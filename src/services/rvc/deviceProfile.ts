import {DeviceSignals, Tier} from '../deviceRules/types';
import {RvcModelManifest} from './types';

export type RvcDeviceTier = 'low' | 'mid' | 'high';

export interface RvcDeviceAssessment {
  tier: RvcDeviceTier;
  supported: boolean;
  warning?: string;
  reasons: string[];
  estimatedPeakRamBytes: number;
  nativeAbiRequired: string;
}

const GB = 1024 * 1024 * 1024;

export function assessRvcDevice(
  signals: DeviceSignals,
  manifest: RvcModelManifest,
  options: {abi?: string; androidApi?: number} = {},
): RvcDeviceAssessment {
  const reasons: string[] = [];
  const abi = options.abi || 'unknown';
  const androidApi = options.androidApi ?? 0;
  const ramGb = signals.ramBytes / GB;
  const tier: RvcDeviceTier = ramGb >= 8 ? 'high' : ramGb >= 6 ? 'mid' : 'low';
  if (tier === 'low') {
    reasons.push('at least 6 GiB RAM is recommended for local RVC inference');
  }
  if (signals.cpuFeatures && signals.cpuFeatures.length > 0) {
    const hasArmAcceleration =
      signals.cpuFeatures.includes('dotprod') ||
      signals.cpuFeatures.includes('i8mm');
    if (!hasArmAcceleration) {
      reasons.push('ARM dot-product or i8mm acceleration was not detected');
    }
  } else {
    reasons.push(
      'CPU feature data is unavailable; performance cannot be guaranteed',
    );
  }
  if (abi !== 'arm64-v8a') {
    reasons.push('the first local RVC backend requires arm64-v8a');
  }
  if (androidApi > 0 && androidApi < manifest.minAndroidApi) {
    reasons.push(
      `Android API ${manifest.minAndroidApi} or newer is required by this model bundle`,
    );
  }
  if (signals.ramBytes < manifest.minRamBytes) {
    reasons.push('device RAM is below the model bundle minimum');
  }
  if (manifest.estimatedPeakRamBytes > signals.ramBytes * 0.7) {
    reasons.push(
      'estimated native working set leaves too little headroom for the rest of the app',
    );
  }
  const supported = reasons.length === 0;
  return {
    tier,
    supported,
    warning: supported
      ? undefined
      : 'Local RVC may be slow, unstable, or unavailable on this device. Use a smaller bundle or a remote fallback.',
    reasons,
    estimatedPeakRamBytes: manifest.estimatedPeakRamBytes,
    nativeAbiRequired: 'arm64-v8a',
  };
}

export function rvcTierFromExistingTier(tier: Tier): RvcDeviceTier {
  if (tier === 'high' || tier === 'flagship') return 'high';
  if (tier === 'mid') return 'mid';
  return 'low';
}
