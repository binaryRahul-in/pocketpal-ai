import type {RvcModelManifest, RvcPitchBackend} from './types';

export type RvcPlatform = 'android' | 'ios' | 'unknown';
export type RvcAudioRoute =
  | 'speaker'
  | 'wired'
  | 'bluetooth'
  | 'receiver'
  | 'unknown';
export type RvcOnnxProvider =
  | 'cpu'
  | 'nnapi'
  | 'coreml'
  | 'xnnpack'
  | 'qnn'
  | 'cuda'
  | 'unknown';
export type RvcHardwareProfile =
  | 'unsupported'
  | 'low-memory'
  | 'standard-cpu'
  | 'accelerated'
  | 'high-memory';

export interface RvcHardwareSignals {
  os: RvcPlatform;
  abi: string;
  totalRamBytes: number;
  freeStorageBytes: number;
  cpuCoreCount: number;
  apiLevel?: number;
  audioRoute: RvcAudioRoute;
  onnxProviders: RvcOnnxProvider[];
}

export interface MeasuredRvcRequirements {
  downloadBytes: number;
  estimatedPeakRamBytes: number;
  /** True when these numbers came from a measured model bundle, not a generic tier. */
  measured: boolean;
}

export interface RvcPolicyWarning {
  kind: 'storage' | 'peak-ram' | 'thermal' | 'abi' | 'provider' | 'api';
  message: string;
}

export interface RvcHardwarePolicy {
  profile: RvcHardwareProfile;
  supported: boolean;
  canInstall: boolean;
  /** The user may decline and continue using PocketPal without RVC. */
  canContinueWithoutRvc: true;
  requirements: MeasuredRvcRequirements;
  providerLimitations: string[];
  warnings: RvcPolicyWarning[];
}

const GB = 1024 * 1024 * 1024;
const MB = 1024 * 1024;
const MIN_HEADROOM_RATIO = 0.3;

/** Measured reference sizes from the voiceclonnx INT8 bundle. */
export const VOICECLONNX_MEASURED_REQUIREMENTS = {
  contentEncoderInt8Bytes: 90.8 * MB,
  rmvpeInt8Bytes: 94.1 * MB,
} as const;

function measuredDownloadBytes(manifest: RvcModelManifest): number {
  const componentBytes = manifest.components
    .filter(component => component.required)
    .reduce((sum, component) => sum + component.sizeBytes, 0);
  return componentBytes + (manifest.index?.sizeBytes ?? 0);
}

export function measureRvcRequirements(
  manifest: RvcModelManifest,
): MeasuredRvcRequirements {
  return {
    // The manifest is authoritative for the selected model; do not apply one
    // universal RVC size claim to all models.
    downloadBytes: measuredDownloadBytes(manifest),
    estimatedPeakRamBytes: manifest.estimatedPeakRamBytes,
    measured: true,
  };
}

function hasAccelerationProvider(providers: RvcOnnxProvider[]): boolean {
  return providers.some(provider =>
    ['nnapi', 'coreml', 'qnn', 'cuda', 'xnnpack'].includes(provider),
  );
}

function providerLimitations(
  signals: RvcHardwareSignals,
  manifest: RvcModelManifest,
): string[] {
  const limitations: string[] = [];
  const providers = new Set(signals.onnxProviders);
  if (
    signals.os === 'android' &&
    !providers.has('nnapi') &&
    !providers.has('qnn')
  ) {
    limitations.push(
      'No Android NNAPI or QNN provider was reported; RVC will use CPU unless the runtime selects another provider.',
    );
  }
  if (signals.os === 'ios' && !providers.has('coreml')) {
    limitations.push(
      'No CoreML provider was reported; RVC will use CPU on iOS.',
    );
  }
  if (manifest.pitchBackend === 'rmvpe' && !providers.has('xnnpack')) {
    limitations.push(
      'RMVPE has no reported XNNPACK provider; pitch extraction may increase latency.',
    );
  }
  // Deliberately do not say that NNAPI or CoreML is faster: provider speed is
  // device-, model-, and runtime-version-dependent and must be measured.
  return limitations;
}

export function evaluateRvcHardwarePolicy(
  signals: RvcHardwareSignals,
  manifest: RvcModelManifest,
): RvcHardwarePolicy {
  const requirements = measureRvcRequirements(manifest);
  const warnings: RvcPolicyWarning[] = [];
  const apiTooOld =
    signals.os === 'android' &&
    signals.apiLevel !== undefined &&
    signals.apiLevel < manifest.minAndroidApi;
  const abiSupported = manifest.supportedAbis.includes(signals.abi);
  const osSupported = signals.os === 'android' || signals.os === 'ios';
  const memoryFloor = Math.max(
    manifest.minRamBytes,
    requirements.estimatedPeakRamBytes,
  );
  const hasHeadroom =
    signals.totalRamBytes > 0 &&
    requirements.estimatedPeakRamBytes <=
      signals.totalRamBytes * (1 - MIN_HEADROOM_RATIO);
  const storageRequired = requirements.downloadBytes;
  const enoughStorage = signals.freeStorageBytes >= storageRequired;

  if (!enoughStorage) {
    warnings.push({
      kind: 'storage',
      message: `This model needs ${formatBytes(storageRequired)} of free storage; only ${formatBytes(signals.freeStorageBytes)} is available.`,
    });
  }
  if (
    signals.totalRamBytes < memoryFloor ||
    signals.totalRamBytes < 6 * GB ||
    !hasHeadroom
  ) {
    warnings.push({
      kind: 'peak-ram',
      message: `Estimated peak RVC memory is ${formatBytes(requirements.estimatedPeakRamBytes)}. Keep at least 30% RAM free for PocketPal and the operating system.`,
    });
  }
  if (!abiSupported || !osSupported) {
    warnings.push({
      kind: 'abi',
      message: `This RVC bundle supports ${manifest.supportedAbis.join(', ')} on Android/iOS; the detected ${signals.os} ${signals.abi} combination is not supported.`,
    });
  }
  if (apiTooOld) {
    warnings.push({
      kind: 'api',
      message: `Android API ${manifest.minAndroidApi} or newer is required for this model; API ${signals.apiLevel} was detected.`,
    });
  }

  const limitations = providerLimitations(signals, manifest);
  if (limitations.length > 0) {
    warnings.push({kind: 'provider', message: limitations.join(' ')});
  }
  warnings.push({
    kind: 'thermal',
    message:
      'RVC runs sustained neural inference and may increase battery drain, device heat, and audio latency. Performance can vary by model, provider, audio route, and thermal state.',
  });

  const unsupported = !osSupported || !abiSupported || apiTooOld;
  const lowMemory = signals.totalRamBytes < 6 * GB || !hasHeadroom;
  const profile: RvcHardwareProfile = unsupported
    ? 'unsupported'
    : lowMemory
      ? 'low-memory'
      : hasAccelerationProvider(signals.onnxProviders)
        ? 'accelerated'
        : signals.totalRamBytes >= 8 * GB && signals.cpuCoreCount >= 8
          ? 'high-memory'
          : 'standard-cpu';

  return {
    profile,
    supported: !unsupported && enoughStorage && !lowMemory,
    canInstall: !unsupported && enoughStorage && !lowMemory,
    canContinueWithoutRvc: true,
    requirements,
    providerLimitations: limitations,
    warnings,
  };
}

export function formatBytes(bytes: number): string {
  if (bytes >= GB) return `${(bytes / GB).toFixed(1)} GiB`;
  return `${(bytes / MB).toFixed(1)} MiB`;
}

export function summarizeRvcInstallWarning(
  policy: RvcHardwarePolicy,
  manifest: RvcModelManifest,
): string {
  const modelNote = manifest.components.some(
    component => component.quantization === 'fp32',
  )
    ? 'FP32 ContentVec and RMVPE can each be hundreds of megabytes.'
    : 'This model uses its own measured component sizes; voiceclonnx reports roughly 90.8 MB INT8 ContentVec and 94.1 MB INT8 RMVPE.';
  const providerNote = policy.providerLimitations.length
    ? ` Provider limits: ${policy.providerLimitations.join(' ')}`
    : '';
  return `${manifest.displayName}: download ${formatBytes(policy.requirements.downloadBytes)}, estimated peak RAM ${formatBytes(policy.requirements.estimatedPeakRamBytes)}. ${modelNote} Sustained use may affect battery, heat, and latency.${providerNote} You can decline installation and continue using PocketPal normally.`;
}

export interface RvcHardwareProbe {
  getOs(): RvcPlatform;
  getAbi(): Promise<string> | string;
  getTotalRamBytes(): Promise<number> | number;
  getFreeStorageBytes(): Promise<number> | number;
  getCpuCoreCount(): Promise<number> | number;
  getApiLevel(): Promise<number | undefined> | number | undefined;
  getAudioRoute(): Promise<RvcAudioRoute> | RvcAudioRoute;
  getOnnxProviders(): Promise<RvcOnnxProvider[]> | RvcOnnxProvider[];
}

/** Collect all device signals once so policy decisions are reproducible. */
export async function detectRvcHardware(
  probe: RvcHardwareProbe,
): Promise<RvcHardwareSignals> {
  const [
    abi,
    totalRamBytes,
    freeStorageBytes,
    cpuCoreCount,
    apiLevel,
    audioRoute,
    onnxProviders,
  ] = await Promise.all([
    probe.getAbi(),
    probe.getTotalRamBytes(),
    probe.getFreeStorageBytes(),
    probe.getCpuCoreCount(),
    probe.getApiLevel(),
    probe.getAudioRoute(),
    probe.getOnnxProviders(),
  ]);
  return {
    os: probe.getOs(),
    abi,
    totalRamBytes,
    freeStorageBytes,
    cpuCoreCount,
    apiLevel,
    audioRoute,
    onnxProviders,
  };
}

export type {RvcPitchBackend};
