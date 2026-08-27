import {z} from 'zod';

import {
  DEFAULT_RVC_CONFIG,
  type RvcConfig,
  type RvcMode,
  type RvcPitchExtractor,
  type RvcPrecision,
  type RvcProvider,
} from '../../types/rvc';

const RvcConfigSchema = z.object({
  schemaVersion: z.literal(1),
  enabled: z.boolean(),
  mode: z.enum(['offline', 'streaming']),
  provider: z.enum(['auto', 'cpu', 'xnnpack', 'nnapi', 'coreml']),
  precision: z.enum(['fp32', 'int8']),
  pitchExtractor: z.enum(['dio', 'harvest', 'pm', 'rmvpe', 'fcpe']),
  indexRate: z.number().min(0).max(1),
  chunkSeconds: z.number().min(2).max(3),
  overlapMilliseconds: z.number().min(0).max(1000),
  maxQueuedChunks: z.number().int().min(1).max(4),
  outputSampleRate: z.union([
    z.literal('model'),
    z.literal(32000),
    z.literal(40000),
    z.literal(48000),
  ]),
  allowNetworkModels: z.boolean(),
  ttsPostProcessingEnabled: z.boolean(),
});

export function normalizeRvcConfig(value: unknown): RvcConfig {
  const candidate = value && typeof value === 'object' ? value : {};
  const parsed = RvcConfigSchema.safeParse({
    ...DEFAULT_RVC_CONFIG,
    ...candidate,
  });
  if (parsed.success) return parsed.data;
  return {...DEFAULT_RVC_CONFIG};
}

export function migrateRvcConfig(value: unknown): RvcConfig {
  if (!value || typeof value !== 'object') return {...DEFAULT_RVC_CONFIG};
  const candidate = value as Record<string, unknown>;
  return normalizeRvcConfig({
    ...candidate,
    schemaVersion: 1,
    enabled: candidate.enabled === true,
    mode: candidate.mode === 'streaming' ? 'streaming' : 'offline',
  });
}

export function isRvcProvider(value: unknown): value is RvcProvider {
  return ['auto', 'cpu', 'xnnpack', 'nnapi', 'coreml'].includes(String(value));
}

export function isRvcPitchExtractor(
  value: unknown,
): value is RvcPitchExtractor {
  return ['dio', 'harvest', 'pm', 'rmvpe', 'fcpe'].includes(String(value));
}

export function isRvcPrecision(value: unknown): value is RvcPrecision {
  return value === 'fp32' || value === 'int8';
}

export function isRvcMode(value: unknown): value is RvcMode {
  return value === 'offline' || value === 'streaming';
}

export {RvcConfigSchema};
