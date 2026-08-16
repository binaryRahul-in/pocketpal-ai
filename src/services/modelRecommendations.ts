import type {Model} from '../utils/types';

export interface HardwareSnapshot {
  model: string;
  brand: string;
  androidVersion: string;
  apiLevel: string;
  abis: string[];
  cores: number;
  totalMemory: number;
  freeStorage: number;
  chipset: string;
  gpu: string;
  gpuAcceleration: string;
}

export type RecommendationLabel =
  | 'Likely to run'
  | 'May run slowly'
  | 'Not recommended';

export type ModelRecommendation = {
  model: Model;
  label: RecommendationLabel;
  reason: string;
  score: number;
};

export const formatBytes = (bytes: number) => {
  if (!Number.isFinite(bytes) || bytes <= 0) return 'Unknown';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(unit === 0 ? 0 : 1)} ${units[unit]}`;
};

export const getModelSize = (model: Model) =>
  model.size || model.hfModelFile?.size || 0;

export const buildRecommendations = (
  snapshot: HardwareSnapshot | null,
  models: Model[],
): ModelRecommendation[] => {
  if (!snapshot) return [];
  const availableRam = snapshot.totalMemory * 0.62;
  const availableStorage = snapshot.freeStorage * 0.85;

  return models
    .filter(
      model =>
        model.origin !== 'remote' && (model.downloadUrl || model.isDownloaded),
    )
    .map(model => {
      const size = getModelSize(model);
      const hasSize = size > 0;
      const fitsRam =
        model.isDownloaded && !hasSize ? true : hasSize && size < availableRam;
      const fitsStorage =
        model.isDownloaded || (hasSize && size < availableStorage);
      const isLarge = hasSize && size > availableRam * 0.85;
      let label: RecommendationLabel = 'Likely to run';
      let reason =
        'The model size leaves conservative memory headroom for Android and the chat runtime.';
      let score = 3;

      if (!fitsStorage || !fitsRam) {
        label = 'Not recommended';
        reason = !fitsStorage
          ? 'The model may not fit in the currently available storage.'
          : 'The model is larger than the conservative memory budget for this device.';
        score = 1;
      } else if (isLarge || snapshot.cores <= 4) {
        label = 'May run slowly';
        reason =
          'It fits the conservative budget, but its size or CPU core count may make generation slow.';
        score = 2;
      }

      return {model, label, reason, score};
    })
    .sort(
      (a, b) =>
        b.score - a.score || getModelSize(a.model) - getModelSize(b.model),
    )
    .slice(0, 8);
};
