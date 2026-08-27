import type {
  InstalledRvcModel,
  RvcCapabilityReport,
  RvcConfig,
  RvcPitchExtractor,
  RvcPrecision,
  RvcProvider,
} from '../../types/rvc';

export interface RvcExecutionPlan {
  provider: RvcProvider;
  precision: RvcPrecision;
  pitchExtractor: RvcPitchExtractor;
  indexRate: number;
  mode: 'offline' | 'streaming';
  warnings: string[];
}

export function resolveRvcExecutionPlan(
  config: RvcConfig,
  capability: RvcCapabilityReport,
  model: InstalledRvcModel | null,
): RvcExecutionPlan {
  const warnings = [...capability.warnings];
  const manifest = model?.manifest;
  const provider =
    config.provider === 'auto'
      ? capability.recommendedProvider
      : config.provider;
  const precision =
    config.precision === 'int8' ? 'int8' : capability.recommendedPrecision;
  let pitchExtractor = config.pitchExtractor;
  if (
    capability.deviceClass === 'limited' &&
    ['rmvpe', 'fcpe'].includes(pitchExtractor)
  )
    pitchExtractor = 'dio';
  if (
    manifest &&
    pitchExtractor === 'rmvpe' &&
    manifest.pitch.kind !== 'rmvpe'
  ) {
    warnings.push(
      'The selected model does not provide RMVPE; falling back to its declared pitch extractor.',
    );
    pitchExtractor = manifest.pitch.kind;
  }
  if (manifest && pitchExtractor === 'fcpe' && manifest.pitch.kind !== 'fcpe') {
    warnings.push(
      'FCPE is not available in the selected model bundle; using the declared model pitch extractor.',
    );
    pitchExtractor = manifest.pitch.kind;
  }
  const indexRate =
    config.indexRate > 0 && Boolean(manifest?.supportsIndex)
      ? config.indexRate
      : 0;
  if (config.indexRate > 0 && indexRate === 0)
    warnings.push(
      'Index retrieval is disabled because the selected model has no validated index asset.',
    );
  const mode =
    config.mode === 'streaming' && capability.streamingRuntime
      ? 'streaming'
      : 'offline';
  if (config.mode === 'streaming' && mode === 'offline')
    warnings.push(
      'Streaming is unavailable on this build or device; using offline conversion.',
    );
  return {provider, precision, pitchExtractor, indexRate, mode, warnings};
}
