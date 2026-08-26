import {
  resolveRvcIndexRate,
  RvcManifestError,
  validateRvcManifest,
} from '../modelManifest';
import {RvcModelManifest} from '../types';

const validManifest: RvcModelManifest = {
  schemaVersion: '1.0',
  id: 'demo-rvc',
  displayName: 'Demo RVC',
  revision: 'abc123',
  source: {
    provider: 'huggingface',
    repository: 'example/demo-rvc',
    revision: 'abc123',
  },
  license: 'MIT',
  attribution: 'Example authors',
  inputSampleRateHz: 16000,
  outputSampleRateHz: 40000,
  pitchBackend: 'rmvpe',
  components: [
    {
      kind: 'content_encoder',
      filename: 'hubert.onnx',
      sha256: 'a'.repeat(64),
      sizeBytes: 100,
      quantization: 'dynamic-int8',
      required: true,
      url: 'https://huggingface.co/example/demo-rvc/resolve/abc123/hubert.onnx',
    },
    {
      kind: 'pitch',
      filename: 'rmvpe.onnx',
      sha256: 'b'.repeat(64),
      sizeBytes: 100,
      quantization: 'fp16',
      required: true,
      url: 'https://huggingface.co/example/demo-rvc/resolve/abc123/rmvpe.onnx',
    },
    {
      kind: 'generator',
      filename: 'net_g.onnx',
      sha256: 'c'.repeat(64),
      sizeBytes: 100,
      quantization: 'weight-only-int8',
      required: true,
      url: 'https://huggingface.co/example/demo-rvc/resolve/abc123/net_g.onnx',
    },
  ],
  indexRateDefault: 0,
  chunking: {chunkDurationMs: 2000, overlapMs: 500, crossfade: 'hann'},
  supportedAbis: ['arm64-v8a'],
  minAndroidApi: 24,
  minRamBytes: 4 * 1024 * 1024 * 1024,
  estimatedPeakRamBytes: 5 * 1024 * 1024 * 1024,
  appCompatibility: {minVersion: '1.16.1'},
};

describe('validateRvcManifest', () => {
  it('accepts a complete manifest and keeps index retrieval opt-in', () => {
    expect(validateRvcManifest(validManifest)).toEqual(validManifest);
    expect(resolveRvcIndexRate(validManifest)).toBe(0);
  });

  it('rejects path traversal, missing components, and non-Hugging Face URLs', () => {
    expect(() =>
      validateRvcManifest({...validManifest, components: []}),
    ).toThrow(RvcManifestError);
    expect(() =>
      validateRvcManifest({
        ...validManifest,
        components: validManifest.components.map((item, index) =>
          index === 0 ? {...item, filename: '../hubert.onnx'} : item,
        ),
      }),
    ).toThrow(RvcManifestError);
    expect(() =>
      validateRvcManifest({
        ...validManifest,
        components: validManifest.components.map((item, index) =>
          index === 0
            ? {...item, url: 'https://example.com/hubert.onnx'}
            : item,
        ),
      }),
    ).toThrow(RvcManifestError);
  });

  it('rejects a nonzero manifest default index rate', () => {
    expect(() =>
      validateRvcManifest({...validManifest, indexRateDefault: 0.5 as 0}),
    ).toThrow('indexRateDefault');
  });

  it('clamps index retrieval to bypass when no index is present', () => {
    expect(resolveRvcIndexRate(validManifest, 0.8)).toBe(0);
  });

  it('accepts an optional index only when explicitly requested', () => {
    const withIndex = {
      ...validManifest,
      index: {
        filename: 'voices.index',
        sha256: 'd'.repeat(64),
        sizeBytes: 200,
        url: 'https://huggingface.co/example/demo-rvc/resolve/abc123/voices.index',
      },
    };
    expect(resolveRvcIndexRate(withIndex, 0.4)).toBe(0.4);
    expect(() => resolveRvcIndexRate(withIndex, 1.1)).toThrow(
      'between 0 and 1',
    );
  });
});
