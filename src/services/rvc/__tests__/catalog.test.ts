import {
  createRvcCatalogEntry,
  evaluateRvcInstallPolicy,
  setRvcEnabled,
} from '../catalog';

const manifest = {
  schemaVersion: '1.0',
  id: 'catalog-demo',
  displayName: 'Catalog Demo',
  revision: 'r1',
  source: {
    provider: 'huggingface',
    repository: 'example/catalog-demo',
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
      sizeBytes: 10,
      quantization: 'dynamic-int8',
      required: true,
      url: 'https://huggingface.co/example/catalog-demo/resolve/r1/hubert.onnx',
    },
    {
      kind: 'pitch',
      filename: 'fcpe.onnx',
      sha256: 'b'.repeat(64),
      sizeBytes: 10,
      quantization: 'fp16',
      required: true,
      url: 'https://huggingface.co/example/catalog-demo/resolve/r1/fcpe.onnx',
    },
    {
      kind: 'generator',
      filename: 'net_g.onnx',
      sha256: 'c'.repeat(64),
      sizeBytes: 10,
      quantization: 'weight-only-int8',
      required: true,
      url: 'https://huggingface.co/example/catalog-demo/resolve/r1/net_g.onnx',
    },
  ],
  indexRateDefault: 0,
  chunking: {chunkDurationMs: 2000, overlapMs: 400, crossfade: 'hann'},
  supportedAbis: ['arm64-v8a'],
  minAndroidApi: 24,
  minRamBytes: 1,
  estimatedPeakRamBytes: 2,
  appCompatibility: {minVersion: '1.16.1'},
};

describe('RVC catalog policy', () => {
  it('creates disabled catalog entries and enables only installed models', () => {
    const entry = createRvcCatalogEntry(manifest, 'curated', true);
    expect(entry.enabled).toBe(false);
    expect(setRvcEnabled(entry, true).enabled).toBe(true);
    expect(() => setRvcEnabled({...entry, installed: false}, true)).toThrow(
      'installed',
    );
  });

  it('requires a manifest and rejects PyTorch checkpoints', () => {
    expect(
      evaluateRvcInstallPolicy({
        filename: 'bundle.json',
        availableBytes: 100,
        manifestBytes: 50,
        deviceSupported: true,
        offlineMode: false,
      }).allowed,
    ).toBe(true);
    const decision = evaluateRvcInstallPolicy({
      filename: 'voice.pth',
      availableBytes: 100,
      manifestBytes: 50,
      deviceSupported: true,
      offlineMode: false,
    });
    expect(decision.allowed).toBe(false);
    expect(decision.reasons.join(' ')).toContain('not executed');
  });
});
