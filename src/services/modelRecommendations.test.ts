import {
  buildRecommendations,
  formatBytes,
  HardwareSnapshot,
} from './modelRecommendations';
import type {Model} from '../utils/types';

const makeModel = (id: string, size: number, isDownloaded = false) =>
  ({
    id,
    name: id,
    author: 'test',
    size,
    isDownloaded,
    downloadUrl: `https://example.test/${id}.gguf`,
    origin: 'hf',
  }) as unknown as Model;

const hardware = (
  overrides: Partial<HardwareSnapshot> = {},
): HardwareSnapshot => ({
  model: 'Test Phone',
  brand: 'Test',
  androidVersion: '16',
  apiLevel: '36',
  abis: ['arm64-v8a'],
  cores: 8,
  totalMemory: 8 * 1024 ** 3,
  freeStorage: 32 * 1024 ** 3,
  chipset: 'Test SoC',
  gpu: 'Unknown',
  gpuAcceleration: 'Unknown',
  ...overrides,
});

describe('modelRecommendations', () => {
  it('formats bytes conservatively', () => {
    expect(formatBytes(0)).toBe('Unknown');
    expect(formatBytes(1024 ** 3)).toBe('1.0 GB');
  });

  it('labels a small model as likely to run on a high-memory device', () => {
    const result = buildRecommendations(hardware(), [
      makeModel('small', 1 * 1024 ** 3),
    ]);
    expect(result[0]?.label).toBe('Likely to run');
  });

  it('labels an oversized model as not recommended', () => {
    const result = buildRecommendations(
      hardware({totalMemory: 4 * 1024 ** 3}),
      [makeModel('large', 4 * 1024 ** 3)],
    );
    expect(result[0]?.label).toBe('Not recommended');
  });

  it('does not recommend models with no downloadable metadata unless already installed', () => {
    const model = {...makeModel('unknown', 0), downloadUrl: ''} as Model;
    expect(buildRecommendations(hardware(), [model])).toHaveLength(0);
    expect(
      buildRecommendations(hardware(), [{...model, isDownloaded: true}]),
    ).toHaveLength(1);
  });
});
