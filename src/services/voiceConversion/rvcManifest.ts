export const RVC_MANIFEST_VERSION = 'rvc-on-device/1' as const;
export type RvcGeneration = 'v1' | 'v2';
export type RvcSampleRate = 40000 | 48000;
export type RvcFeatureExtractor = 'contentvec' | 'hubert';
export type RvcPitchExtractor = 'rmvpe' | 'fcpe';
export type RvcQuantization = 'fp32' | 'int8';

export interface RvcTensorShape { readonly name: string; readonly shape: readonly number[]; }
export interface RvcArtifact { readonly path: string; readonly format: 'onnx'; readonly sha256: string; readonly license: string; readonly sourceUrl: string; }
export interface RvcModelManifest {
  readonly manifestVersion: typeof RVC_MANIFEST_VERSION; readonly artifact: RvcArtifact;
  readonly modelFamily: 'net_g_vits'; readonly generation: RvcGeneration; readonly sampleRate: RvcSampleRate;
  readonly featureExtractor: RvcFeatureExtractor; readonly featureDimension: 256 | 768;
  readonly pitchExtractor: RvcPitchExtractor; readonly quantization: RvcQuantization;
  readonly indexPresent: boolean; readonly tensors: readonly RvcTensorShape[];
}
export interface RvcRuntimeContract { readonly sampleRate: RvcSampleRate; readonly featureDimension: 256 | 768; readonly pitchExtractor: RvcPitchExtractor; readonly requiredTensors?: readonly RvcTensorShape[]; }
export type RvcManifestErrorCode = 'INVALID_MANIFEST' | 'UNSAFE_ARTIFACT' | 'SAMPLE_RATE_MISMATCH' | 'FEATURE_SHAPE_MISMATCH' | 'PITCH_EXTRACTOR_MISMATCH' | 'TENSOR_SHAPE_MISMATCH';
export class RvcManifestError extends Error { readonly code: RvcManifestErrorCode; constructor(code: RvcManifestErrorCode, message: string) { super(message); this.name = 'RvcManifestError'; this.code = code; } }

const SHA256 = /^[a-f0-9]{64}$/; const HTTP_URL = /^https?:\/\//;
function isTensor(value: unknown): value is RvcTensorShape { if (typeof value !== 'object' || value === null) return false; const t = value as Partial<RvcTensorShape>; return typeof t.name === 'string' && t.name.length > 0 && Array.isArray(t.shape) && t.shape.length > 0 && t.shape.every(d => Number.isInteger(d) && d >= -1); }
export function assertSafeOnDeviceArtifact(path: string): void { if (!path.toLowerCase().endsWith('.onnx')) throw new RvcManifestError('UNSAFE_ARTIFACT', `Only ONNX artifacts may be loaded on device; refused ${path}. Convert checkpoints offline.`); }
export function parseRvcManifest(value: unknown): RvcModelManifest { if (typeof value !== 'object' || value === null) throw new RvcManifestError('INVALID_MANIFEST', 'RVC manifest must be an object.'); const m = value as Partial<RvcModelManifest>; const a = m.artifact as Partial<RvcArtifact> | undefined; const valid = m.manifestVersion === RVC_MANIFEST_VERSION && a !== undefined && typeof a.path === 'string' && a.format === 'onnx' && SHA256.test(a.sha256 ?? '') && typeof a.license === 'string' && HTTP_URL.test(a.sourceUrl ?? '') && m.modelFamily === 'net_g_vits' && (m.generation === 'v1' || m.generation === 'v2') && (m.sampleRate === 40000 || m.sampleRate === 48000) && (m.featureExtractor === 'contentvec' || m.featureExtractor === 'hubert') && (m.featureDimension === 256 || m.featureDimension === 768) && (m.pitchExtractor === 'rmvpe' || m.pitchExtractor === 'fcpe') && (m.quantization === 'fp32' || m.quantization === 'int8') && typeof m.indexPresent === 'boolean' && Array.isArray(m.tensors) && m.tensors.every(isTensor); if (!valid) throw new RvcManifestError('INVALID_MANIFEST', 'Manifest does not conform to the RVC on-device schema.'); assertSafeOnDeviceArtifact(a.path); if ((m.generation === 'v1' && m.featureDimension !== 256) || (m.generation === 'v2' && m.featureDimension !== 768)) throw new RvcManifestError('FEATURE_SHAPE_MISMATCH', `${m.generation} requires its canonical feature dimension.`); return m as RvcModelManifest; }
export function validateRvcContract(m: RvcModelManifest, c: RvcRuntimeContract): void { if (m.sampleRate !== c.sampleRate) throw new RvcManifestError('SAMPLE_RATE_MISMATCH', `Model is ${m.sampleRate} Hz; runtime requires ${c.sampleRate} Hz.`); if (m.featureDimension !== c.featureDimension) throw new RvcManifestError('FEATURE_SHAPE_MISMATCH', `Model features are ${m.featureDimension}-wide; runtime requires ${c.featureDimension}.`); if (m.pitchExtractor !== c.pitchExtractor) throw new RvcManifestError('PITCH_EXTRACTOR_MISMATCH', `Model requires ${m.pitchExtractor}; runtime provides ${c.pitchExtractor}.`); for (const r of c.requiredTensors ?? []) { const a = m.tensors.find(t => t.name === r.name); if (!a || a.shape.length !== r.shape.length || a.shape.some((d, i) => r.shape[i] !== -1 && d !== -1 && r.shape[i] !== d)) throw new RvcManifestError('TENSOR_SHAPE_MISMATCH', `Tensor ${r.name} does not match the runtime contract.`); } }
export function loadValidatedRvcManifest(value: unknown, contract: RvcRuntimeContract): RvcModelManifest { const m = parseRvcManifest(value); validateRvcContract(m, contract); return m; }
export const rvcModelRuntimeBoundary = Object.freeze({ acceptedExtensions: ['.onnx'] as const, rejectedExtensions: ['.pth', '.pt', '.ckpt', '.bin'] as const, conversionLocation: 'offline-trusted-tool' as const });
export function assertNoPyTorchCheckpointLoading(path: string): never { assertSafeOnDeviceArtifact(path); throw new RvcManifestError('UNSAFE_ARTIFACT', 'PyTorch checkpoint loading is not part of the mobile runtime.'); }
export default loadValidatedRvcManifest;
// Deliberately no torch/pickle/checkpoint deserialization dependency exists in this module.

export const RVC_CANONICAL_FEATURE_DIMENSIONS: Readonly<Record<RvcGeneration, 256 | 768>> = {v1: 256, v2: 768};
export const RVC_SUPPORTED_SAMPLE_RATES: readonly RvcSampleRate[] = [40000, 48000];
export function isRuntimeSafeRvcPath(path: string): boolean { return /\.onnx$/i.test(path); }
export function isOfflineOnlyRvcPath(path: string): boolean { return /\.(pth|pt|ckpt|bin|pickle)$/i.test(path); }
export function hasExpectedTensorShape(actual: RvcTensorShape, expected: RvcTensorShape): boolean { return actual.name === expected.name && actual.shape.length === expected.shape.length && actual.shape.every((d, i) => expected.shape[i] === -1 || d === -1 || d === expected.shape[i]); }
export function isRvcManifest(value: unknown): value is RvcModelManifest { try { parseRvcManifest(value); return true; } catch { return false; } }
export function manifestSummary(m: RvcModelManifest): string { return `${m.generation}/${m.sampleRate}Hz/${m.featureDimension}d/${m.pitchExtractor}/${m.quantization}/${m.indexPresent ? 'index' : 'no-index'}`; }
export type { RvcModelManifest as ValidatedRvcModelManifest };
