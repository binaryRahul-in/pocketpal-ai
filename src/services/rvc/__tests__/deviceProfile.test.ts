import {assessRvcDevice} from '../deviceProfile';
import {RvcModelManifest} from '../types';

const manifest: RvcModelManifest = {
  schemaVersion: '1.0',
  id: 'device-test',
  displayName: 'Device Test',
  revision: 'r1',
  source: {
    provider: 'huggingface',
    repository: 'example/device-test',
    revision: 'r1',
  },
  license: 'MIT',
  attribution: 'Example',
  inputSampleRateHz: 16000,
  outputSampleRateHz: 40000,
  pitchBackend: 'fcpe',
  components: [
    {
      kind: 'content_encoder',
      filename: 'hubert.onnx',
      sha256: 'a'.repeat(64),
      sizeBytes: 1,
      quantization: 'dynamic-int8',
      required: true,
      url: 'https://huggingface.co/example/device-test/resolve/r1/hubert.onnx',
    },
    {
      kind: 'pitch',
      filename: 'fcpe.onnx',
      sha256: 'b'.repeat(64),
      sizeBytes: 1,
      quantization: 'fp16',
      required: true,
      url: 'https://huggingface.co/example/device-test/resolve/r1/fcpe.onnx',
    },
    {
      kind: 'generator',
      filename: 'net_g.onnx',
      sha256: 'c'.repeat(64),
      sizeBytes: 1,
      quantization: 'weight-only-int8',
      required: true,
      url: 'https://huggingface.co/example/device-test/resolve/r1/net_g.onnx',
    },
  ],
  indexRateDefault: 0,
  chunking: {chunkDurationMs: 2500, overlapMs: 500, crossfade: 'linear'},
  supportedAbis: ['arm64-v8a'],
  minAndroidApi: 24,
  minRamBytes: 4 * 1024 * 1024 * 1024,
  estimatedPeakRamBytes: 4 * 1024 * 1024 * 1024,
  appCompatibility: {minVersion: '1.16.1'},
};

describe('assessRvcDevice', () => {
  it('accepts a capable arm64 device with headroom', () => {
    const assessment = assessRvcDevice(
      {
        ramBytes: 12 * 1024 * 1024 * 1024,
        cpuFeatures: ['dotprod'],
        socModel: 'test',
      },
      manifest,
      {abi: 'arm64-v8a', androidApi: 35},
    );
    expect(assessment.supported).toBe(true);
    expect(assessment.tier).toBe('high');
    expect(assessment.warning).toBeUndefined();
  });

  it('warns and disables local inference when RAM or ABI is insufficient', () => {
    const assessment = assessRvcDevice(
      {ramBytes: 3 * 1024 * 1024 * 1024, cpuFeatures: []},
      manifest,
      {abi: 'armeabi-v7a', androidApi: 23},
    );
    expect(assessment.supported).toBe(false);
    expect(assessment.warning).toContain('unavailable');
    expect(assessment.reasons.length).toBeGreaterThan(1);
  });
});
