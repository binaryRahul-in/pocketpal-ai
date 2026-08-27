import {
  parseRVCModelBundleManifest,
  RVC_BUNDLE_CHECKSUMS_PATH,
} from '../rvcModelManifest';

const hash = (letter: string) => letter.repeat(64);

function manifest(overrides: Record<string, unknown> = {}) {
  return {
    format: 'pocketpal-rvc-bundle',
    manifestVersion: 1,
    id: 'demo-rvc',
    name: 'Demo RVC',
    source: {
      kind: 'huggingface',
      repository: 'community/demo-rvc',
      revision: 'abc123',
      provenanceUrl: 'https://huggingface.co/community/demo-rvc',
      communityUploaded: true,
    },
    license: {spdxId: 'MIT', url: 'https://opensource.org/license/mit'},
    runtime: {
      format: 'onnx',
      providers: ['cpu'],
      minimumRamBytes: 512 * 1024 * 1024,
      diskBytes: 1024,
      abi: ['arm64-v8a'],
    },
    audio: {
      sampleRate: 40000,
      featureVersion: 'v2',
      featureDimensions: {v1: 256, v2: 768},
    },
    quantization: 'fp16',
    policy: {indexRateDefault: 0.75, supportedExtractors: ['rmvpe', 'dio']},
    components: {
      contentEncoder: {
        role: 'content_encoder',
        path: 'components/content.onnx',
        format: 'onnx',
        sha256: hash('a'),
        bytes: 100,
      },
      pitch: {
        role: 'pitch',
        path: 'components/pitch.onnx',
        format: 'onnx',
        sha256: hash('b'),
        bytes: 200,
      },
      voice: {
        role: 'voice',
        path: 'components/voice.onnx',
        format: 'onnx',
        sha256: hash('c'),
        bytes: 300,
      },
      index: {
        role: 'index',
        path: 'components/voice.index',
        format: 'index',
        sha256: hash('d'),
        bytes: 400,
      },
    },
    metadata: {checksumFile: RVC_BUNDLE_CHECKSUMS_PATH},
    ...overrides,
  };
}

describe('RVC model bundle manifest', () => {
  it('parses curated Hugging Face bundles and validates file hashes', () => {
    const value = manifest();
    const parsed = parseRVCModelBundleManifest(value, {
      files: {
        'components/content.onnx': {sha256: hash('a'), bytes: 100},
        'components/pitch.onnx': {sha256: hash('b'), bytes: 200},
        'components/voice.onnx': {sha256: hash('c'), bytes: 300},
        'components/voice.index': {sha256: hash('d'), bytes: 400},
      },
      checksumText: [
        hash('a') + '  components/content.onnx',
        hash('b') + '  components/pitch.onnx',
        hash('c') + '  components/voice.onnx',
        hash('d') + '  components/voice.index',
      ].join('\n'),
    });
    expect(parsed.audio.featureDimensions).toEqual({v1: 256, v2: 768});
    expect(parsed.components.index?.format).toBe('index');
  });

  it('supports local user-imported ONNX bundles without a repository', () => {
    const value = manifest({source: {kind: 'local', communityUploaded: false}});
    expect(parseRVCModelBundleManifest(value).source.kind).toBe('local');
  });

  it.each([
    ['malformed JSON', '{'],
    ['unsupported format', {...manifest(), format: 'zip'}],
    [
      'missing required component',
      {...manifest(), components: {...manifest().components, pitch: undefined}},
    ],
    [
      'unknown required component',
      {
        ...manifest(),
        components: {
          ...manifest().components,
          decoder: manifest().components.voice,
        },
      },
    ],
    [
      'unsafe path',
      {
        ...manifest(),
        components: {
          ...manifest().components,
          voice: {...manifest().components.voice, path: '../voice.onnx'},
        },
      },
    ],
    [
      'unsupported PTH',
      {
        ...manifest(),
        components: {
          ...manifest().components,
          voice: {...manifest().components.voice, path: 'components/voice.pth'},
        },
      },
    ],
    [
      'wrong component format',
      {
        ...manifest(),
        components: {
          ...manifest().components,
          voice: {...manifest().components.voice, format: 'pth'},
        },
      },
    ],
    [
      'missing checksum',
      {
        ...manifest(),
        components: {
          ...manifest().components,
          voice: {...manifest().components.voice, sha256: hash('z')},
        },
      },
    ],
  ])('rejects %s', (_label, value) => {
    expect(() => parseRVCModelBundleManifest(value)).toThrow(
      'Invalid RVC bundle manifest',
    );
  });

  it('rejects a checksum mismatch', () => {
    expect(() =>
      parseRVCModelBundleManifest(manifest(), {
        files: {'components/voice.onnx': {sha256: hash('z'), bytes: 300}},
      }),
    ).toThrow('checksum or size mismatch');
  });
});
