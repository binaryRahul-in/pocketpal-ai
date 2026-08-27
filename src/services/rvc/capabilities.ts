import type {
  RvcCapabilityReport,
  RvcConfig,
  RvcProvider,
  RvcPitchExtractor,
  RvcPrecision,
} from '../../types/rvc';

export interface RvcHardwareFacts {
  platform: 'android' | 'ios' | 'web' | 'unknown';
  totalMemoryBytes?: number;
  supportedAbis?: string[];
  nativeRuntimeAvailable?: boolean;
  xnnpackAvailable?: boolean;
  nnapiAvailable?: boolean;
  coremlAvailable?: boolean;
}

const GB = 1024 * 1024 * 1024;

export function classifyRvcDevice(
  totalMemoryBytes?: number,
): RvcCapabilityReport['deviceClass'] {
  if (!totalMemoryBytes) return 'unknown';
  if (totalMemoryBytes < 4 * GB) return 'limited';
  if (totalMemoryBytes < 8 * GB) return 'capable';
  return 'high-performance';
}

export function getRvcCapabilities(
  facts: RvcHardwareFacts,
  config: RvcConfig,
): RvcCapabilityReport {
  const deviceClass = classifyRvcDevice(facts.totalMemoryBytes);
  const warnings: string[] = [];
  const offlineRuntime =
    facts.platform === 'android' || facts.platform === 'ios';
  const streamingRuntime = Boolean(
    facts.nativeRuntimeAvailable && facts.platform === 'android',
  );

  if (!offlineRuntime)
    warnings.push(
      'RVC is currently supported only on native Android and iOS builds.',
    );
  if (!facts.nativeRuntimeAvailable)
    warnings.push(
      'The optional native RVC runtime is not included in this build.',
    );
  if (deviceClass === 'limited')
    warnings.push(
      'This device has limited memory for RVC base models; use INT8, DIO, index off, and offline mode.',
    );
  if (deviceClass === 'unknown')
    warnings.push(
      'Device memory could not be measured; RVC will use conservative defaults.',
    );
  if (config.mode === 'streaming' && !streamingRuntime)
    warnings.push(
      'Native streaming is unavailable; offline conversion is the safe fallback.',
    );
  if (config.precision === 'int8' && config.pitchExtractor === 'rmvpe')
    warnings.push(
      'INT8 pitch extraction must be validated for the selected artifact before activation.',
    );
  if (config.indexRate > 0)
    warnings.push(
      'Index retrieval increases memory use and is not recommended on mobile by default.',
    );

  let recommendedProvider: RvcProvider = 'cpu';
  if (facts.xnnpackAvailable && config.precision === 'fp32')
    recommendedProvider = 'xnnpack';
  if (config.provider !== 'auto') recommendedProvider = config.provider;

  let recommendedPitchExtractor: RvcPitchExtractor = config.pitchExtractor;
  if (
    deviceClass === 'limited' &&
    ['rmvpe', 'fcpe'].includes(recommendedPitchExtractor)
  )
    recommendedPitchExtractor = 'dio';

  let recommendedPrecision: RvcPrecision = config.precision;
  if (deviceClass === 'limited') recommendedPrecision = 'int8';

  return {
    supported:
      offlineRuntime &&
      Boolean(
        facts.nativeRuntimeAvailable ||
          facts.platform === 'android' ||
          facts.platform === 'ios',
      ),
    nativeRuntime: Boolean(facts.nativeRuntimeAvailable),
    offlineRuntime,
    streamingRuntime,
    recommendedProvider,
    recommendedPrecision,
    recommendedPitchExtractor,
    deviceClass,
    availableRamBytes: facts.totalMemoryBytes,
    supportedAbis: facts.supportedAbis,
    warnings,
  };
}
