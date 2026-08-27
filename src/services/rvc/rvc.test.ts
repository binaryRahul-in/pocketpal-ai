import {DEFAULT_RVC_CONFIG} from '../../types/rvc';
import {getRvcCapabilities} from './capabilities';
import {migrateRvcConfig, normalizeRvcConfig} from './config';
import {resolveRvcExecutionPlan} from './executionPlan';
import {resolveSafeModelPath, validateRvcManifest} from './modelManifest';

const validManifest = {
  schemaVersion: 1,
  engine: 'rvc',
  engineVersion: 'rvc-v2',
  files: [
    {
      role: 'contentvec',
      path: 'contentvec.onnx',
      sha256: 'a'.repeat(64),
      bytes: 100,
    },
    {role: 'pitch', path: 'rmvpe.onnx', sha256: 'b'.repeat(64), bytes: 100},
    {role: 'net_g', path: 'voice.onnx', sha256: 'c'.repeat(64), bytes: 100},
  ],
  inputSampleRate: 16000,
  outputSampleRate: 40000,
  contentDimension: 768,
  pitch: {kind: 'rmvpe', classes: 360},
  supportsIndex: false,
  license: 'MIT',
};

describe('RVC configuration', () => {
  it('defaults to disabled, offline, and index-free operation', () => {
    expect(normalizeRvcConfig(undefined)).toEqual(DEFAULT_RVC_CONFIG);
  });

  it('does not allow migration to enable the feature implicitly', () => {
    expect(
      migrateRvcConfig({schemaVersion: 0, mode: 'streaming'}).enabled,
    ).toBe(false);
    expect(migrateRvcConfig({schemaVersion: 1, enabled: true}).enabled).toBe(
      true,
    );
  });
});

describe('RVC model manifests', () => {
  it('accepts a complete model bundle', () => {
    const report = validateRvcManifest(validManifest);
    expect(report.valid).toBe(true);
    expect(report.errors).toEqual([]);
  });

  it('rejects missing net_g and traversal paths', () => {
    const report = validateRvcManifest({
      ...validManifest,
      files: [{...validManifest.files[0], path: '../voice.onnx'}],
    });
    expect(report.valid).toBe(false);
    expect(report.errors.join(' ')).toMatch(/files|net_g/i);
    expect(() =>
      resolveSafeModelPath('/models/voice', '../voice.onnx'),
    ).toThrow(/Unsafe/);
  });

  it('warns when an index exists but remains opt-in', () => {
    const report = validateRvcManifest({
      ...validManifest,
      supportsIndex: true,
      files: [
        ...validManifest.files,
        {
          role: 'index',
          path: 'voice.index',
          sha256: 'd'.repeat(64),
          bytes: 100,
        },
      ],
    });
    expect(report.valid).toBe(true);
    expect(report.warnings.join(' ')).toMatch(/opt-in|disabled/i);
  });
});

describe('RVC execution plan', () => {
  it('keeps index retrieval off and falls back from unavailable streaming', () => {
    const plan = resolveRvcExecutionPlan(
      {
        ...DEFAULT_RVC_CONFIG,
        enabled: true,
        mode: 'streaming',
        indexRate: 0.8,
        pitchExtractor: 'fcpe',
      },
      {
        supported: true,
        nativeRuntime: false,
        offlineRuntime: true,
        streamingRuntime: false,
        recommendedProvider: 'cpu',
        recommendedPrecision: 'fp32',
        recommendedPitchExtractor: 'dio',
        deviceClass: 'capable',
        warnings: [],
      },
      null,
    );
    expect(plan.indexRate).toBe(0);
    expect(plan.mode).toBe('offline');
    expect(plan.warnings.join(' ')).toMatch(/Index|Streaming/);
  });
});

describe('RVC device policy', () => {
  it('recommends memory-saving choices on limited Android devices', () => {
    const report = getRvcCapabilities(
      {
        platform: 'android',
        totalMemoryBytes: 3 * 1024 * 1024 * 1024,
        nativeRuntimeAvailable: false,
        xnnpackAvailable: true,
      },
      {...DEFAULT_RVC_CONFIG, enabled: true, pitchExtractor: 'rmvpe'},
    );
    expect(report.deviceClass).toBe('limited');
    expect(report.recommendedPrecision).toBe('int8');
    expect(report.recommendedPitchExtractor).toBe('dio');
    expect(report.warnings.join(' ')).toMatch(/limited memory/i);
  });
});
