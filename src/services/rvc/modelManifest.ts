import {z} from 'zod';

import type {
  RvcModelFile,
  RvcModelManifest,
  RvcValidationReport,
} from '../../types/rvc';

const sha256Pattern = /^[a-f0-9]{64}$/i;
const safeRelativePathPattern =
  /^(?!\/)(?!.*(?:^|\/)\.\.(?:\/|$))(?!.*\\)(?!.*\0)[^/]+(?:\/[^/]+)*$/;
const MAX_MODEL_FILE_BYTES = 1_500 * 1024 * 1024;
const MAX_MODEL_BUNDLE_BYTES = 2_500 * 1024 * 1024;

const ManifestFileSchema = z.object({
  role: z.enum(['contentvec', 'pitch', 'net_g', 'index']),
  path: z.string().min(1).max(240).regex(safeRelativePathPattern),
  sha256: z.string().regex(sha256Pattern),
  bytes: z.number().int().positive().max(MAX_MODEL_FILE_BYTES),
  precision: z.enum(['fp32', 'int8']).optional(),
});

export const RvcModelManifestSchema = z.object({
  schemaVersion: z.literal(1),
  engine: z.literal('rvc'),
  engineVersion: z.string().min(1).max(80),
  files: z.array(ManifestFileSchema).min(2).max(4),
  inputSampleRate: z.literal(16000),
  outputSampleRate: z.union([
    z.literal(32000),
    z.literal(40000),
    z.literal(48000),
  ]),
  contentDimension: z.literal(768),
  pitch: z.object({
    kind: z.enum(['dio', 'harvest', 'pm', 'rmvpe', 'fcpe']),
    classes: z.number().int().positive().max(1024).optional(),
  }),
  supportsIndex: z.boolean(),
  license: z.string().min(1).max(120),
  sourceUrl: z.string().url().optional(),
  revision: z.string().min(1).max(160).optional(),
  minOrtVersion: z.string().min(1).max(40).optional(),
  opset: z.number().int().min(11).max(20).optional(),
  estimatedRamBytes: z
    .number()
    .int()
    .positive()
    .max(4 * 1024 * 1024 * 1024)
    .optional(),
});

function hasRole(files: RvcModelFile[], role: RvcModelFile['role']): boolean {
  return files.some(file => file.role === role);
}

export function validateRvcManifest(value: unknown): RvcValidationReport {
  const parsed = RvcModelManifestSchema.safeParse(value);
  if (!parsed.success) {
    return {
      valid: false,
      errors: parsed.error.issues.map(
        issue => `${issue.path.join('.') || 'manifest'}: ${issue.message}`,
      ),
      warnings: [],
      files: [],
      estimatedRamBytes: 0,
    };
  }

  const manifest = parsed.data as RvcModelManifest;
  const errors: string[] = [];
  const warnings: string[] = [];
  const roles = new Set(manifest.files.map(file => file.role));
  const totalBytes = manifest.files.reduce((sum, file) => sum + file.bytes, 0);

  if (!hasRole(manifest.files, 'contentvec'))
    errors.push('Bundle is missing a ContentVec file.');
  if (
    !hasRole(manifest.files, 'pitch') &&
    manifest.pitch.kind !== 'dio' &&
    manifest.pitch.kind !== 'harvest' &&
    manifest.pitch.kind !== 'pm'
  ) {
    errors.push('Neural pitch extractors require a pitch model file.');
  }
  if (!hasRole(manifest.files, 'net_g'))
    errors.push('Bundle is missing a per-voice net_g file.');
  if (!manifest.supportsIndex && roles.has('index'))
    errors.push('Bundle contains an index file but supportsIndex is false.');
  if (manifest.supportsIndex && !roles.has('index'))
    warnings.push(
      'Index support is declared but no index file is installed; indexRate will remain zero.',
    );
  if (totalBytes > MAX_MODEL_BUNDLE_BYTES)
    errors.push(
      `Bundle exceeds the ${MAX_MODEL_BUNDLE_BYTES} byte safety limit.`,
    );
  if (manifest.pitch.kind === 'rmvpe' && manifest.pitch.classes !== 360)
    warnings.push(
      'RMVPE normally uses 360 pitch classes; verify the export before activation.',
    );
  if (manifest.outputSampleRate === 48000)
    warnings.push(
      '48 kHz output increases playback and memory bandwidth on limited devices.',
    );
  if (manifest.supportsIndex)
    warnings.push(
      'Index retrieval is opt-in and disabled by default to keep mobile memory bounded.',
    );

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    files: manifest.files,
    estimatedRamBytes: manifest.estimatedRamBytes ?? totalBytes,
  };
}

export function resolveSafeModelPath(
  rootPath: string,
  relativePath: string,
): string {
  if (!safeRelativePathPattern.test(relativePath))
    throw new Error('Unsafe RVC model path.');
  const normalizedRoot = rootPath.replace(/[\\/]$/, '');
  return `${normalizedRoot}/${relativePath}`;
}

export function getRvcManifestRequiredRoles(): RvcModelFile['role'][] {
  return ['contentvec', 'net_g'];
}
