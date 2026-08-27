import {
  detectRvcHardware,
  evaluateRvcHardwarePolicy,
  formatBytes,
  summarizeRvcInstallWarning,
  VOICECLONNX_MEASURED_REQUIREMENTS,
} from '../hardwarePolicy';
import type {RvcHardwareSignals} from '../hardwarePolicy';
import type {RvcModelManifest} from '../types';

const GB = 1024 * 1024 * 1024;
const manifest: RvcModelManifest = {
  schemaVersion: '1.0',
  id: 'voiceclonnx-int8',
  displayName: 'VoiceClonnx INT8',
  revision: 'r1',
  source: {provider: 'huggingface', repository: 'example/rvc', revision: 'r1'},
  license: 'MIT',
  attribution: 'Example',
  inputSampleRateHz: 16000,
  outputSampleRateHz: 40000,
  pitchBackend: 'rmvpe',
  components: [
    {
      kind: 'content_encoder',
      filename: 'contentvec-int8.onnx',
      sha256: 'a'.repeat(64),
      sizeBytes: VOICECLONNX_MEASURED_REQUIREMENTS.contentEncoderInt8Bytes,
      quantization: 'dynamic-int8',
      required: true,
    },
    {
      kind: 'pitch',
      filename: 'rmvpe-int8.onnx',
      sha256: 'b'.repeat(64),
      sizeBytes: VOICECLONNX_MEASURED_REQUIREMENTS.rmvpeInt8Bytes,
      quantization: 'dynamic-int8',
      required: true,
    },
    {
      kind: 'generator',
      filename: 'generator.onnx',
      sha256: 'c'.repeat(64),
      sizeBytes: 40 * 1024 * 1024,
      quantization: 'dynamic-int8',
      required: true,
    },
  ],
  indexRateDefault: 0,
  chunking: {chunkDurationMs: 2500, overlapMs: 500, crossfade: 'linear'},
  supportedAbis: ['arm64-v8a'],
  minAndroidApi: 24,
  minRamBytes: 4 * GB,
  estimatedPeakRamBytes: 2 * GB,
  appCompatibility: {minVersion: '1.16.1'},
};

function signals(
  overrides: Partial<RvcHardwareSignals> = {},
): RvcHardwareSignals {
  return {
    os: 'android',
    abi: 'arm64-v8a',
    totalRamBytes: 12 * GB,
    freeStorageBytes: 2 * GB,
    cpuCoreCount: 8,
    apiLevel: 35,
    audioRoute: 'speaker',
    onnxProviders: ['cpu'],
    ...overrides,
  };
}

describe('RVC hardware policy', () => {
  it('uses the selected model manifest rather than a universal size claim', () => {
    const policy = evaluateRvcHardwarePolicy(signals(), manifest);
    expect(policy.requirements.downloadBytes).toBe(
      90.8 * 1024 * 1024 + 94.1 * 1024 * 1024 + 40 * 1024 * 1024,
    );
    expect(policy.requirements.estimatedPeakRamBytes).toBe(2 * GB);
    expect(
      formatBytes(VOICECLONNX_MEASURED_REQUIREMENTS.contentEncoderInt8Bytes),
    ).toBe('90.8 MiB');
  });

  it('classifies a capable CPU-only device as standard-cpu', () => {
    const policy = evaluateRvcHardwarePolicy(
      signals({totalRamBytes: 6 * GB, cpuCoreCount: 6}),
      manifest,
    );
    expect(policy.profile).toBe('standard-cpu');
    expect(policy.supported).toBe(true);
    expect(policy.providerLimitations.join(' ')).toContain('CPU');
  });

  it('classifies a reported provider as accelerated without claiming it is faster', () => {
    const policy = evaluateRvcHardwarePolicy(
      signals({onnxProviders: ['nnapi']}),
      manifest,
    );
    expect(policy.profile).toBe('accelerated');
    expect(summarizeRvcInstallWarning(policy, manifest)).not.toMatch(
      /faster|fastest/i,
    );
  });

  it('classifies high-memory CPU devices separately from standard CPU devices', () => {
    const policy = evaluateRvcHardwarePolicy(
      signals({totalRamBytes: 16 * GB, cpuCoreCount: 8}),
      manifest,
    );
    expect(policy.profile).toBe('high-memory');
  });

  it('reports low memory and retains the explicit no-RVC continuation path', () => {
    const policy = evaluateRvcHardwarePolicy(
      signals({totalRamBytes: 4 * GB}),
      manifest,
    );
    expect(policy.profile).toBe('low-memory');
    expect(policy.canInstall).toBe(false);
    expect(policy.canContinueWithoutRvc).toBe(true);
    expect(policy.warnings.some(warning => warning.kind === 'peak-ram')).toBe(
      true,
    );
  });

  it('distinguishes storage, ABI, API, provider, and thermal warnings', () => {
    const policy = evaluateRvcHardwarePolicy(
      signals({
        abi: 'armeabi-v7a',
        apiLevel: 23,
        freeStorageBytes: 1,
        onnxProviders: ['cpu'],
      }),
      manifest,
    );
    expect(policy.profile).toBe('unsupported');
    expect(policy.canInstall).toBe(false);
    expect(policy.warnings.map(warning => warning.kind)).toEqual(
      expect.arrayContaining(['storage', 'abi', 'api', 'provider', 'thermal']),
    );
  });

  it('collects all signals deterministically from one probe snapshot', async () => {
    const detected = await detectRvcHardware({
      getOs: () => 'ios',
      getAbi: () => 'arm64-v8a',
      getTotalRamBytes: () => 8 * GB,
      getFreeStorageBytes: () => 3 * GB,
      getCpuCoreCount: () => 6,
      getApiLevel: () => undefined,
      getAudioRoute: () => 'bluetooth',
      getOnnxProviders: () => ['coreml'],
    });
    expect(detected).toEqual({
      os: 'ios',
      abi: 'arm64-v8a',
      totalRamBytes: 8 * GB,
      freeStorageBytes: 3 * GB,
      cpuCoreCount: 6,
      apiLevel: undefined,
      audioRoute: 'bluetooth',
      onnxProviders: ['coreml'],
    });
  });
});
