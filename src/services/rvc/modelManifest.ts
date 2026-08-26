import {RvcModelManifest} from './types';

const SHA256 = /^[a-f0-9]{64}$/i;
const SAFE_FILENAME = /^[^/\\][^/\\]*$/;

export class RvcManifestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RvcManifestError';
  }
}

export function validateRvcManifest(value: unknown): RvcModelManifest {
  if (!value || typeof value !== 'object') {
    throw new RvcManifestError('RVC manifest must be an object');
  }
  const manifest = value as Partial<RvcModelManifest>;
  if (manifest.schemaVersion !== '1.0') {
    throw new RvcManifestError('Unsupported RVC manifest schema version');
  }
  if (!manifest.id || !manifest.displayName || !manifest.revision) {
    throw new RvcManifestError(
      'RVC manifest requires id, displayName, and revision',
    );
  }
  if (!manifest.source || manifest.source.provider !== 'huggingface') {
    throw new RvcManifestError('RVC manifest source must be Hugging Face');
  }
  if (!manifest.license || !manifest.attribution) {
    throw new RvcManifestError('RVC manifest requires license and attribution');
  }
  if (
    !Number.isInteger(manifest.inputSampleRateHz) ||
    !Number.isInteger(manifest.outputSampleRateHz)
  ) {
    throw new RvcManifestError('RVC sample rates must be integers');
  }
  if (manifest.indexRateDefault !== 0) {
    throw new RvcManifestError(
      'RVC manifests must default indexRateDefault to 0',
    );
  }
  if (!manifest.components || manifest.components.length === 0) {
    throw new RvcManifestError('RVC manifest requires at least one component');
  }
  const requiredKinds = new Set(['content_encoder', 'pitch', 'generator']);
  const seenKinds = new Set<string>();
  for (const component of manifest.components) {
    if (!component || !requiredKinds.has(component.kind)) {
      throw new RvcManifestError(
        'RVC manifest contains an invalid required component',
      );
    }
    if (seenKinds.has(component.kind)) {
      throw new RvcManifestError(
        `RVC manifest contains duplicate component: ${component.kind}`,
      );
    }
    seenKinds.add(component.kind);
    if (!component.required || !SAFE_FILENAME.test(component.filename)) {
      throw new RvcManifestError(
        `Invalid required component metadata: ${component.kind}`,
      );
    }
    if (!SHA256.test(component.sha256)) {
      throw new RvcManifestError(
        `Invalid SHA-256 for component: ${component.kind}`,
      );
    }
    if (
      !Number.isSafeInteger(component.sizeBytes) ||
      component.sizeBytes <= 0
    ) {
      throw new RvcManifestError(
        `Invalid size for component: ${component.kind}`,
      );
    }
    if (!component.url || !isAllowedModelUrl(component.url)) {
      throw new RvcManifestError(
        `Component URL must be HTTPS Hugging Face: ${component.kind}`,
      );
    }
  }
  if (
    !['rmvpe', 'fcpe', 'dio', 'harvest', 'pm'].includes(
      manifest.pitchBackend || '',
    )
  ) {
    throw new RvcManifestError('Unsupported pitch backend');
  }
  if (
    !manifest.chunking ||
    manifest.chunking.chunkDurationMs < 2000 ||
    manifest.chunking.chunkDurationMs > 3000
  ) {
    throw new RvcManifestError(
      'Chunk duration must be between 2000 and 3000 ms',
    );
  }
  if (
    manifest.chunking.overlapMs <= 0 ||
    manifest.chunking.overlapMs >= manifest.chunking.chunkDurationMs
  ) {
    throw new RvcManifestError(
      'Chunk overlap must be positive and less than chunk duration',
    );
  }
  if (
    !Array.isArray(manifest.supportedAbis) ||
    !manifest.supportedAbis.includes('arm64-v8a')
  ) {
    throw new RvcManifestError('RVC manifest must declare arm64-v8a support');
  }
  const minAndroidApi = manifest.minAndroidApi;
  if (
    typeof minAndroidApi !== 'number' ||
    !Number.isInteger(minAndroidApi) ||
    minAndroidApi < 24
  ) {
    throw new RvcManifestError(
      'RVC manifest must target Android API 24 or later',
    );
  }
  const minRamBytes = manifest.minRamBytes;
  const estimatedPeakRamBytes = manifest.estimatedPeakRamBytes;
  if (
    typeof minRamBytes !== 'number' ||
    typeof estimatedPeakRamBytes !== 'number' ||
    !Number.isSafeInteger(minRamBytes) ||
    !Number.isSafeInteger(estimatedPeakRamBytes) ||
    estimatedPeakRamBytes < minRamBytes
  ) {
    throw new RvcManifestError('Invalid RVC memory requirements');
  }
  if (manifest.index) {
    if (
      !SAFE_FILENAME.test(manifest.index.filename) ||
      !SHA256.test(manifest.index.sha256) ||
      !Number.isSafeInteger(manifest.index.sizeBytes) ||
      manifest.index.sizeBytes <= 0
    ) {
      throw new RvcManifestError('Invalid optional RVC index metadata');
    }
    if (!manifest.index.url || !isAllowedModelUrl(manifest.index.url)) {
      throw new RvcManifestError(
        'Optional RVC index URL must be HTTPS Hugging Face',
      );
    }
  }
  return manifest as RvcModelManifest;
}

export function isAllowedModelUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      url.protocol === 'https:' &&
      (url.hostname === 'huggingface.co' ||
        url.hostname.endsWith('.huggingface.co'))
    );
  } catch {
    return false;
  }
}

export function resolveRvcIndexRate(
  manifest: RvcModelManifest,
  requestedRate?: number,
): number {
  if (!manifest.index || requestedRate === undefined) {
    return 0;
  }
  if (
    !Number.isFinite(requestedRate) ||
    requestedRate < 0 ||
    requestedRate > 1
  ) {
    throw new RvcManifestError('RVC index rate must be between 0 and 1');
  }
  return requestedRate;
}
