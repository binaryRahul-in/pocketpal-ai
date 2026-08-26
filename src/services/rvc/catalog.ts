import {validateRvcManifest} from './modelManifest';
import {RvcModelManifest} from './types';

export type RvcModelOrigin = 'curated' | 'user-import';

export interface RvcCatalogEntry {
  manifest: RvcModelManifest;
  origin: RvcModelOrigin;
  installed: boolean;
  enabled: boolean;
}

export interface RvcInstallPolicyInput {
  filename: string;
  availableBytes: number;
  manifestBytes: number;
  deviceSupported: boolean;
  offlineMode: boolean;
}

export interface RvcInstallDecision {
  allowed: boolean;
  reasons: string[];
}

export function createRvcCatalogEntry(
  manifestValue: unknown,
  origin: RvcModelOrigin,
  installed = false,
): RvcCatalogEntry {
  return {
    manifest: validateRvcManifest(manifestValue),
    origin,
    installed,
    enabled: false,
  };
}

export function evaluateRvcInstallPolicy(
  input: RvcInstallPolicyInput,
): RvcInstallDecision {
  const reasons: string[] = [];
  if (!input.filename.toLowerCase().endsWith('.json')) {
    reasons.push('RVC installs must start from a validated JSON manifest');
  }
  if (input.filename.toLowerCase().endsWith('.pth')) {
    reasons.push(
      'PyTorch checkpoint files are not executed or converted on-device',
    );
  }
  if (!Number.isSafeInteger(input.manifestBytes) || input.manifestBytes <= 0) {
    reasons.push('bundle size is invalid');
  }
  if (input.availableBytes < input.manifestBytes) {
    reasons.push('device storage is insufficient for this bundle');
  }
  if (!input.deviceSupported) {
    reasons.push('device requirements are not satisfied');
  }
  if (input.offlineMode && input.manifestBytes === 0) {
    reasons.push('offline installation requires a complete local bundle');
  }
  return {allowed: reasons.length === 0, reasons};
}

export function setRvcEnabled(
  entry: RvcCatalogEntry,
  enabled: boolean,
): RvcCatalogEntry {
  if (enabled && !entry.installed) {
    throw new Error('RVC model must be installed before it can be enabled');
  }
  return {...entry, enabled};
}
