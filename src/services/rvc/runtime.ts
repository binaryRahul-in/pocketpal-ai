import type {
  InstalledRvcModel,
  RvcCapabilityReport,
  RvcConfig,
  RvcConversionRequest,
  RvcConversionResult,
  RvcModelManifest,
  RvcProvider,
  RvcPitchExtractor,
  RvcRuntime,
  RvcValidationReport,
} from '../../types/rvc';
import {getRvcCapabilities, type RvcHardwareFacts} from './capabilities';
import {resolveSafeModelPath, validateRvcManifest} from './modelManifest';

type Int64Data = Int32Array | bigint[];

interface OrtTensor {
  data: Float32Array | Int64Data;
  dims: number[];
}

interface OrtSession {
  readonly inputNames?: string[];
  run(feeds: Record<string, OrtTensor>): Promise<Record<string, OrtTensor>>;
}

interface OrtModule {
  InferenceSession: {
    create(
      path: string,
      options?: {executionProviders?: string[]},
    ): Promise<OrtSession>;
  };
  Tensor: new (
    type: 'float32' | 'int64',
    data: Float32Array | Int64Data,
    dims: number[],
  ) => OrtTensor;
}

interface RvcFileSystem {
  readFile(path: string, encoding: 'utf8' | 'base64'): Promise<string>;
  writeFile(path: string, data: string, encoding: 'base64'): Promise<void>;
}

interface RvcRuntimeDependencies {
  loadOrt?: () => Promise<OrtModule>;
  fileSystem: RvcFileSystem;
  hardware: RvcHardwareFacts;
  config: RvcConfig;
}

interface PcmAudio {
  samples: Float32Array;
  sampleRate: number;
}

function decodeBase64(value: string): Uint8Array {
  const decoder = (
    globalThis as typeof globalThis & {atob?: (input: string) => string}
  ).atob;
  if (!decoder)
    throw new Error(
      'This build does not provide a base64 decoder for WAV input.',
    );
  const binary = decoder(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1)
    bytes[index] = binary.charCodeAt(index);
  return bytes;
}

function readUint32(view: DataView, offset: number): number {
  return view.getUint32(offset, true);
}

function decodePcm16Wav(base64: string): PcmAudio {
  const bytes = decodeBase64(base64);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (
    view.byteLength < 44 ||
    view.getUint32(0, false) !== 0x52494646 ||
    view.getUint32(8, false) !== 0x57415645
  ) {
    throw new Error('RVC currently accepts PCM16 WAV input only.');
  }

  let offset = 12;
  let sampleRate = 0;
  let channels = 0;
  let bitsPerSample = 0;
  let dataOffset = -1;
  let dataLength = 0;
  while (offset + 8 <= view.byteLength) {
    const chunkId = view.getUint32(offset, false);
    const chunkSize = readUint32(view, offset + 4);
    const chunkStart = offset + 8;
    if (chunkId === 0x666d7420 && chunkSize >= 16) {
      const format = view.getUint16(chunkStart, true);
      channels = view.getUint16(chunkStart + 2, true);
      sampleRate = readUint32(view, chunkStart + 4);
      bitsPerSample = view.getUint16(chunkStart + 14, true);
      if (format !== 1)
        throw new Error('RVC accepts uncompressed PCM WAV input only.');
    }
    if (chunkId === 0x64617461) {
      dataOffset = chunkStart;
      dataLength = Math.min(chunkSize, view.byteLength - chunkStart);
      break;
    }
    offset = chunkStart + chunkSize + (chunkSize % 2);
  }
  if (dataOffset < 0 || !sampleRate || !channels || bitsPerSample !== 16) {
    throw new Error('WAV must contain PCM16 audio metadata.');
  }

  const frameCount = Math.floor(dataLength / (2 * channels));
  const samples = new Float32Array(frameCount);
  for (let frame = 0; frame < frameCount; frame += 1) {
    let sum = 0;
    for (let channel = 0; channel < channels; channel += 1) {
      sum +=
        view.getInt16(dataOffset + (frame * channels + channel) * 2, true) /
        32768;
    }
    samples[frame] = sum / channels;
  }
  return {samples, sampleRate};
}

function resample(
  samples: Float32Array,
  fromRate: number,
  toRate: number,
): Float32Array {
  if (fromRate === toRate) return samples;
  const outputLength = Math.max(
    1,
    Math.round((samples.length * toRate) / fromRate),
  );
  const output = new Float32Array(outputLength);
  for (let index = 0; index < outputLength; index += 1) {
    const sourcePosition =
      (index * (samples.length - 1)) / Math.max(1, outputLength - 1);
    const left = Math.floor(sourcePosition);
    const right = Math.min(samples.length - 1, left + 1);
    const fraction = sourcePosition - left;
    output[index] = samples[left] * (1 - fraction) + samples[right] * fraction;
  }
  return output;
}

function makeInt64(values: number[]): Int64Data {
  const BigInt64ArrayConstructor = (
    globalThis as typeof globalThis & {
      BigInt64Array?: new (lengthOrValues: number | bigint[]) => Int64Data;
    }
  ).BigInt64Array;
  if (BigInt64ArrayConstructor)
    return new BigInt64ArrayConstructor(
      values.map(value => BigInt(value)),
    ) as unknown as Int64Data;
  return new Int32Array(values);
}

function yieldToRuntime(): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, 0));
}

function pickFile(
  manifest: RvcModelManifest,
  role: 'contentvec' | 'pitch' | 'net_g',
): string {
  const file = manifest.files.find(item => item.role === role);
  if (!file) throw new Error(`RVC manifest is missing the ${role} file.`);
  return file.path;
}

function chooseProvider(
  config: RvcConfig,
  hardware: RvcHardwareFacts,
): RvcProvider {
  if (config.provider !== 'auto') return config.provider;
  if (config.precision === 'int8') return 'cpu';
  if (hardware.xnnpackAvailable) return 'xnnpack';
  return 'cpu';
}

export class OrtRvcRuntime implements RvcRuntime {
  private readonly dependencies: RvcRuntimeDependencies;
  private ort?: OrtModule;
  private cancelled = false;
  private sessions?: {
    contentvec: OrtSession;
    pitch?: OrtSession;
    netG: OrtSession;
  };
  private activeModelRoot?: string;

  public constructor(dependencies: RvcRuntimeDependencies) {
    this.dependencies = dependencies;
  }

  public async getCapabilities(): Promise<RvcCapabilityReport> {
    return getRvcCapabilities(
      this.dependencies.hardware,
      this.dependencies.config,
    );
  }

  public async validateModel(
    modelRootPath: string,
  ): Promise<RvcValidationReport> {
    const manifestText = await this.dependencies.fileSystem.readFile(
      `${modelRootPath}/manifest.json`,
      'utf8',
    );
    let manifest: unknown;
    try {
      manifest = JSON.parse(manifestText);
    } catch {
      return {
        valid: false,
        errors: ['manifest.json is not valid JSON.'],
        warnings: [],
        files: [],
        estimatedRamBytes: 0,
      };
    }
    const report = validateRvcManifest(manifest);
    if (!report.valid) return report;
    const parsedManifest = manifest as RvcModelManifest;
    try {
      const ort = await this.getOrt();
      const provider = chooseProvider(
        this.dependencies.config,
        this.dependencies.hardware,
      );
      const providers =
        provider === 'xnnpack'
          ? ['XNNPACK', 'CPUExecutionProvider']
          : ['CPUExecutionProvider'];
      await ort.InferenceSession.create(
        resolveSafeModelPath(
          modelRootPath,
          pickFile(parsedManifest, 'contentvec'),
        ),
        {executionProviders: providers},
      );
      if (
        parsedManifest.pitch.kind === 'rmvpe' ||
        parsedManifest.pitch.kind === 'fcpe'
      ) {
        await ort.InferenceSession.create(
          resolveSafeModelPath(
            modelRootPath,
            pickFile(parsedManifest, 'pitch'),
          ),
          {executionProviders: providers},
        );
      }
      await ort.InferenceSession.create(
        resolveSafeModelPath(modelRootPath, pickFile(parsedManifest, 'net_g')),
        {executionProviders: providers},
      );
      return report;
    } catch (error) {
      return {
        ...report,
        valid: false,
        errors: [
          ...report.errors,
          error instanceof Error
            ? error.message
            : 'RVC ONNX graph validation failed.',
        ],
      };
    }
  }

  public async convert(
    request: RvcConversionRequest,
  ): Promise<RvcConversionResult> {
    this.cancelled = false;
    const inputBase64 = await this.dependencies.fileSystem.readFile(
      request.inputPath,
      'base64',
    );
    const source = decodePcm16Wav(inputBase64);
    const targetSampleRate = request.model.manifest.outputSampleRate;
    const source16k = resample(source.samples, source.sampleRate, 16000);
    const sessions = await this.ensureSessions(request.model);
    const features = await this.extractContent(sessions.contentvec, source16k);
    await this.checkCancelled();
    const configuredPitch = this.dependencies.config.pitchExtractor;
    const f0 = sessions.pitch
      ? await this.extractPitch(sessions.pitch, source16k, features.length)
      : this.extractNativePitch(source16k, features.length, configuredPitch);
    if (request.pitchShiftSemitones) {
      const factor = 2 ** (request.pitchShiftSemitones / 12);
      for (let index = 0; index < f0.length; index += 1) {
        if (f0[index] > 0) f0[index] *= factor;
      }
    }
    await this.checkCancelled();
    // Retrieval indexes are intentionally not loaded by the mobile runtime.
    // `indexRate = 0` is the safe default; enabling it requires a separately
    // validated native retrieval implementation and bounded memory budget.
    const coarse = this.f0ToCoarse(f0);
    const waveform = await this.synthesize(
      sessions.netG,
      features,
      f0,
      coarse,
      request.speakerId ?? 0,
    );
    await this.checkCancelled();
    const output = resample(waveform, targetSampleRate, targetSampleRate);
    await this.dependencies.fileSystem.writeFile(
      request.outputPath,
      this.encodePcm16Wav(output, targetSampleRate),
      'base64',
    );
    return {
      outputPath: request.outputPath,
      sampleRate: targetSampleRate,
      durationSeconds: output.length / targetSampleRate,
      provider: chooseProvider(
        this.dependencies.config,
        this.dependencies.hardware,
      ),
      precision: this.dependencies.config.precision,
    };
  }

  public async cancel(): Promise<void> {
    this.cancelled = true;
    this.sessions = undefined;
    this.activeModelRoot = undefined;
  }

  private async getOrt(): Promise<OrtModule> {
    if (this.ort) return this.ort;
    if (!this.dependencies.loadOrt)
      throw new Error('ONNX Runtime is not included in this build.');
    this.ort = await this.dependencies.loadOrt();
    return this.ort;
  }

  private async ensureSessions(
    model: InstalledRvcModel,
  ): Promise<{contentvec: OrtSession; pitch?: OrtSession; netG: OrtSession}> {
    if (this.sessions && this.activeModelRoot === model.rootPath)
      return this.sessions;
    const ort = await this.getOrt();
    const provider = chooseProvider(
      this.dependencies.config,
      this.dependencies.hardware,
    );
    const providers =
      provider === 'xnnpack'
        ? ['XNNPACK', 'CPUExecutionProvider']
        : ['CPUExecutionProvider'];
    const contentvec = await ort.InferenceSession.create(
      resolveSafeModelPath(
        model.rootPath,
        pickFile(model.manifest, 'contentvec'),
      ),
      {executionProviders: providers},
    );
    const pitch =
      ['rmvpe', 'fcpe'].includes(this.dependencies.config.pitchExtractor) &&
      model.manifest.pitch.kind === this.dependencies.config.pitchExtractor
        ? await ort.InferenceSession.create(
            resolveSafeModelPath(
              model.rootPath,
              pickFile(model.manifest, 'pitch'),
            ),
            {executionProviders: providers},
          )
        : undefined;
    const netG = await ort.InferenceSession.create(
      resolveSafeModelPath(model.rootPath, pickFile(model.manifest, 'net_g')),
      {executionProviders: providers},
    );
    this.sessions = {contentvec, pitch, netG};
    this.activeModelRoot = model.rootPath;
    return this.sessions;
  }

  private async extractContent(
    session: OrtSession,
    audio: Float32Array,
  ): Promise<Float32Array[]> {
    const inputNames = session.inputNames ?? [];
    const input = new (await this.getOrt()).Tensor(
      'float32',
      audio,
      inputNames.includes('source') ? [1, 1, audio.length] : [1, audio.length],
    );
    const feeds: Record<string, OrtTensor> = inputNames.includes('source')
      ? {source: input}
      : {input_values: input};
    if (inputNames.includes('attention_mask'))
      feeds.attention_mask = new (await this.getOrt()).Tensor(
        'int64',
        makeInt64(new Array(audio.length).fill(1)),
        [1, audio.length],
      );
    const output = await session.run(feeds);
    const tensor = Object.values(output)[0];
    if (!tensor || tensor.data.length % 768 !== 0)
      throw new Error(
        'ContentVec output does not contain 768-dimensional features.',
      );
    const values = tensor.data as Float32Array;
    const frames: Float32Array[] = [];
    for (let offset = 0; offset < values.length; offset += 768)
      frames.push(values.slice(offset, offset + 768));
    return frames;
  }

  private async extractPitch(
    session: OrtSession,
    audio: Float32Array,
    frameCount: number,
  ): Promise<Float32Array> {
    const ort = await this.getOrt();
    const melFrames = Math.max(32, Math.ceil(audio.length / 160));
    const mel = new Float32Array(128 * melFrames);
    const output = await session.run({
      input: new ort.Tensor('float32', mel, [1, 128, melFrames]),
    });
    const tensor = Object.values(output)[0];
    if (!tensor) throw new Error('Pitch extractor returned no output.');
    const raw = tensor.data as Float32Array;
    const f0 = new Float32Array(frameCount);
    for (let frame = 0; frame < frameCount; frame += 1) {
      const sourceFrame = Math.min(
        melFrames - 1,
        Math.floor((frame * melFrames) / frameCount),
      );
      const classCount = Math.max(1, Math.floor(raw.length / melFrames));
      let weighted = 0;
      let weightTotal = 0;
      for (let cls = 0; cls < classCount; cls += 1) {
        const value = raw[sourceFrame * classCount + cls] ?? 0;
        weighted += value * cls;
        weightTotal += value;
      }
      f0[frame] =
        weightTotal > 0.003
          ? 32.7 * 2 ** (((weighted / weightTotal) * 20) / 1200)
          : 0;
    }
    return f0;
  }

  private extractNativePitch(
    audio: Float32Array,
    frameCount: number,
    extractor: RvcPitchExtractor,
  ): Float32Array {
    const f0 = new Float32Array(frameCount);
    if (extractor === 'rmvpe' || extractor === 'fcpe') return f0;
    const frameSize = Math.max(
      160,
      Math.floor(audio.length / Math.max(1, frameCount)),
    );
    const minLag = Math.floor(16000 / 1100);
    const maxLag = Math.floor(16000 / 50);
    for (let frame = 0; frame < frameCount; frame += 1) {
      const start = Math.min(audio.length - 1, frame * frameSize);
      const end = Math.min(audio.length, start + frameSize);
      if (end - start < 32) continue;
      let bestLag = 0;
      let bestScore = 0;
      for (
        let lag = minLag;
        lag <= Math.min(maxLag, end - start - 1);
        lag += 1
      ) {
        let energy = 0;
        let correlation = 0;
        for (let index = start; index + lag < end; index += 1) {
          const left = audio[index];
          const right = audio[index + lag];
          energy += left * left + right * right;
          correlation += left * right;
        }
        const score = energy > 1e-8 ? correlation / energy : 0;
        if (score > bestScore) {
          bestScore = score;
          bestLag = lag;
        }
      }
      if (bestLag > 0 && bestScore > 0.25) f0[frame] = 16000 / bestLag;
    }
    return f0;
  }

  private async synthesize(
    session: OrtSession,
    features: Float32Array[],
    f0: Float32Array,
    coarse: Int64Data,
    speakerId: number,
  ): Promise<Float32Array> {
    const ort = await this.getOrt();
    const frameCount = features.length;
    const flat = new Float32Array(frameCount * 768);
    features.forEach((frame, index) => flat.set(frame, index * 768));
    const feeds: Record<string, OrtTensor> = {
      phone: new ort.Tensor('float32', flat, [1, frameCount, 768]),
      phone_lengths: new ort.Tensor('int64', makeInt64([frameCount]), [1]),
      pitch: new ort.Tensor('int64', coarse, [1, frameCount]),
      pitchf: new ort.Tensor('float32', f0, [1, frameCount]),
      ds: new ort.Tensor('int64', makeInt64([speakerId]), [1]),
      rnd: new ort.Tensor('float32', new Float32Array(192 * frameCount), [
        1,
        192,
        frameCount,
      ]),
    };
    const output = await session.run(feeds);
    const tensor = Object.values(output)[0];
    if (!tensor) throw new Error('RVC net_g returned no waveform.');
    return tensor.data as Float32Array;
  }

  private f0ToCoarse(f0: Float32Array): Int64Data {
    const values = new Array<number>(f0.length);
    const logMin = Math.log(50);
    const logMax = Math.log(1100);
    for (let index = 0; index < f0.length; index += 1) {
      values[index] = 0;
      if (f0[index] <= 0) continue;
      const value = Math.max(50, Math.min(1100, f0[index]));
      values[index] = Math.max(
        1,
        Math.min(
          255,
          Math.round(((Math.log(value) - logMin) / (logMax - logMin)) * 254) +
            1,
        ),
      );
    }
    return makeInt64(values);
  }

  private encodePcm16Wav(samples: Float32Array, sampleRate: number): string {
    const buffer = new ArrayBuffer(44 + samples.length * 2);
    const view = new DataView(buffer);
    const writeAscii = (offset: number, value: string): void =>
      value
        .split('')
        .forEach((char, index) =>
          view.setUint8(offset + index, char.charCodeAt(0)),
        );
    writeAscii(0, 'RIFF');
    view.setUint32(4, 36 + samples.length * 2, true);
    writeAscii(8, 'WAVE');
    writeAscii(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * 2, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    writeAscii(36, 'data');
    view.setUint32(40, samples.length * 2, true);
    samples.forEach((sample, index) =>
      view.setInt16(
        44 + index * 2,
        Math.max(-32768, Math.min(32767, Math.round(sample * 32767))),
        true,
      ),
    );
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let index = 0; index < bytes.length; index += 1)
      binary += String.fromCharCode(bytes[index]);
    return btoa(binary);
  }

  private async checkCancelled(): Promise<void> {
    if (this.cancelled) throw new Error('RVC conversion cancelled.');
    await yieldToRuntime();
  }
}
