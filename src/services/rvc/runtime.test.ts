import {OrtRvcRuntime} from './runtime';
import {DEFAULT_RVC_CONFIG} from '../../types/rvc';

function wavBase64(sampleRate = 16000, sampleCount = 1600): string {
  const buffer = new ArrayBuffer(44 + sampleCount * 2);
  const view = new DataView(buffer);
  const ascii = (offset: number, value: string) =>
    value
      .split('')
      .forEach((char, index) =>
        view.setUint8(offset + index, char.charCodeAt(0)),
      );
  ascii(0, 'RIFF');
  view.setUint32(4, 36 + sampleCount * 2, true);
  ascii(8, 'WAVE');
  ascii(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  ascii(36, 'data');
  view.setUint32(40, sampleCount * 2, true);
  for (let index = 0; index < sampleCount; index += 1)
    view.setInt16(44 + index * 2, Math.sin(index / 10) * 1000, true);
  let binary = '';
  new Uint8Array(buffer).forEach(byte => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary);
}

describe('OrtRvcRuntime offline conversion', () => {
  it('runs the three-stage pipeline and writes a PCM WAV result', async () => {
    const writes: string[] = [];
    const fakeSession = (kind: 'content' | 'pitch' | 'net') => ({
      inputNames: kind === 'content' ? ['input_values'] : ['input'],
      run: async () => {
        if (kind === 'content')
          return {
            hidden_states: {data: new Float32Array(768 * 2), dims: [1, 2, 768]},
          };
        if (kind === 'pitch')
          return {
            pitch: {
              data: new Float32Array(32 * 360).fill(0.01),
              dims: [1, 32, 360],
            },
          };
        return {
          waveform: {data: new Float32Array(400).fill(0.1), dims: [1, 1, 400]},
        };
      },
    });
    const runtime = new OrtRvcRuntime({
      config: {...DEFAULT_RVC_CONFIG, enabled: true},
      hardware: {
        platform: 'android',
        nativeRuntimeAvailable: false,
        xnnpackAvailable: false,
      },
      fileSystem: {
        readFile: async (path, encoding) => {
          if (path.endsWith('manifest.json'))
            return JSON.stringify({
              schemaVersion: 1,
              engine: 'rvc',
              engineVersion: 'test',
              files: [
                {
                  role: 'contentvec',
                  path: 'content.onnx',
                  sha256: 'a'.repeat(64),
                  bytes: 1,
                },
                {
                  role: 'pitch',
                  path: 'pitch.onnx',
                  sha256: 'b'.repeat(64),
                  bytes: 1,
                },
                {
                  role: 'net_g',
                  path: 'voice.onnx',
                  sha256: 'c'.repeat(64),
                  bytes: 1,
                },
              ],
              inputSampleRate: 16000,
              outputSampleRate: 40000,
              contentDimension: 768,
              pitch: {kind: 'rmvpe', classes: 360},
              supportsIndex: false,
              license: 'MIT',
            });
          return encoding === 'base64' ? wavBase64() : '';
        },
        writeFile: async (_path, data) => {
          writes.push(data);
        },
      },
      loadOrt: async () =>
        ({
          Tensor: class {
            constructor(
              public type: string,
              public data: Float32Array | Int32Array | bigint[],
              public dims: number[],
            ) {}
          } as any,
          InferenceSession: {
            create: async (path: string) =>
              fakeSession(
                path.endsWith('content.onnx')
                  ? 'content'
                  : path.endsWith('pitch.onnx')
                    ? 'pitch'
                    : 'net',
              ),
          },
        }) as any,
    });
    const model = {
      id: 'test',
      displayName: 'Test',
      rootPath: '/models/test',
      validationStatus: 'valid' as const,
      installedAt: 0,
      manifest: {
        schemaVersion: 1 as const,
        engine: 'rvc' as const,
        engineVersion: 'test',
        files: [
          {
            role: 'contentvec' as const,
            path: 'content.onnx',
            sha256: 'a'.repeat(64),
            bytes: 1,
          },
          {
            role: 'pitch' as const,
            path: 'pitch.onnx',
            sha256: 'b'.repeat(64),
            bytes: 1,
          },
          {
            role: 'net_g' as const,
            path: 'voice.onnx',
            sha256: 'c'.repeat(64),
            bytes: 1,
          },
        ],
        inputSampleRate: 16000 as const,
        outputSampleRate: 40000 as const,
        contentDimension: 768 as const,
        pitch: {kind: 'rmvpe' as const, classes: 360},
        supportsIndex: false,
        license: 'MIT',
      },
    };
    const result = await runtime.convert({
      inputPath: '/input.wav',
      outputPath: '/output.wav',
      model,
    });
    expect(result.sampleRate).toBe(40000);
    expect(writes).toHaveLength(1);
    expect(writes[0].length).toBeGreaterThan(44);
  });
});
