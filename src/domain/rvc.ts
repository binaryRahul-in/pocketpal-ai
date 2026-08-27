/**
 * Domain contracts for optional Retrieval-based Voice Conversion (RVC).
 *
 * RVC is an any-to-one voice-conversion system: the target speaker is embedded
 * in the selected model, rather than selected dynamically by the UI.
 */

export type PitchExtractorKind = 'harvest' | 'rmvpe' | 'crepe' | 'fcpe';
export type RvcInputMode = 'speech-to-speech' | 'tts-to-rvc';
export type RvcIndexMode = 'none' | 'local' | 'external';
export type RvcExecutionProvider = 'cpu' | 'coreml' | 'nnapi' | 'cuda' | 'vulkan';
export type RvcQuantization = 'fp32' | 'fp16' | 'int8';
export type RvcProgressPhase = 'loading' | 'converting' | 'streaming' | 'flushing' | 'complete' | 'cancelled';

export interface RvcIndexManifest {
  path: string;
  version?: string;
  sizeBytes?: number;
}

export interface RvcModelManifest {
  id: string;
  displayName: string;
  modelVersion: string;
  sampleRate: number;
  targetSpeaker: string;
  modelPath: string;
  index?: RvcIndexManifest;
  supportedPitchExtractors: readonly PitchExtractorKind[];
  supportedInputModes: readonly RvcInputMode[];
}

export interface RvcProfile {
  id: string;
  name: string;
  modelId: string;
  inputMode: RvcInputMode;
  pitchExtractor: PitchExtractorKind;
  indexMode: RvcIndexMode;
  indexRate: number;
  chunkDurationMs: number;
  executionProvider: RvcExecutionProvider;
  quantization: RvcQuantization;
  memoryBudgetBytes?: number;
}

export interface RvcConfig {
  sampleRate: number;
  modelVersion: string;
  f0Method: PitchExtractorKind;
  indexMode: RvcIndexMode;
  indexRate: number;
  chunkDurationMs: number;
  executionProvider: RvcExecutionProvider;
  quantization: RvcQuantization;
  memoryBudgetBytes?: number;
}

export interface RvcAudioInput {
  mode: RvcInputMode;
  sampleRate: number;
  channels: 1 | 2;
  pcm: ArrayBuffer;
  timestampMs?: number;
}

export interface RvcProgressEvent {
  phase: RvcProgressPhase;
  progress: number;
  processedMs?: number;
  totalMs?: number;
  realtimeFactor?: number;
  latencyMs?: number;
}

export interface RvcLatencyMetrics {
  loadMs?: number;
  firstChunkMs?: number;
  averageChunkMs?: number;
  endToEndMs?: number;
  realtimeFactor?: number;
}

export interface RvcCapabilities {
  available: boolean;
  supportedInputModes: readonly RvcInputMode[];
  pitchExtractors: readonly PitchExtractorKind[];
  executionProviders: readonly RvcExecutionProvider[];
  quantizations: readonly RvcQuantization[];
  sampleRates: readonly number[];
  maxMemoryBytes?: number;
  latency?: RvcLatencyMetrics;
  reason?: 'module-unavailable' | 'unsupported-platform' | 'initialization-failed';
}

export type RvcErrorCode =
  | 'MODULE_UNAVAILABLE'
  | 'INVALID_CONFIG'
  | 'MODEL_NOT_FOUND'
  | 'MODEL_INCOMPATIBLE'
  | 'INVALID_INPUT'
  | 'CANCELLED'
  | 'NATIVE_FAILURE';

export interface RvcError {
  code: RvcErrorCode;
  message: string;
  recoverable: boolean;
  details?: Record<string, string | number | boolean>;
}

export class RvcContractError extends Error implements RvcError {
  readonly name = 'RvcContractError';
  constructor(
    readonly code: RvcErrorCode,
    message: string,
    readonly recoverable = false,
    readonly details?: Record<string, string | number | boolean>,
  ) {
    super(message);
  }
}

export function validateRvcConfig(config: RvcConfig, manifest?: RvcModelManifest): void {
  if (!Number.isFinite(config.sampleRate) || config.sampleRate <= 0) {
    throw new RvcContractError('INVALID_CONFIG', 'sampleRate must be a positive finite number.');
  }
  if (!Number.isFinite(config.indexRate) || config.indexRate < 0 || config.indexRate > 1) {
    throw new RvcContractError('INVALID_CONFIG', 'indexRate must be between 0 and 1.');
  }
  if (config.indexRate > 0 && (config.indexMode === 'none' || !manifest?.index)) {
    throw new RvcContractError(
      'INVALID_CONFIG',
      'indexRate greater than zero requires an installed index and a non-none indexMode.',
      false,
      {indexRate: config.indexRate, indexMode: config.indexMode},
    );
  }
  if (!Number.isFinite(config.chunkDurationMs) || config.chunkDurationMs <= 0) {
    throw new RvcContractError('INVALID_CONFIG', 'chunkDurationMs must be a positive finite number.');
  }
  if (config.memoryBudgetBytes !== undefined && (!Number.isSafeInteger(config.memoryBudgetBytes) || config.memoryBudgetBytes <= 0)) {
    throw new RvcContractError('INVALID_CONFIG', 'memoryBudgetBytes must be a positive safe integer.');
  }
  if (manifest && (manifest.modelVersion !== config.modelVersion || manifest.sampleRate !== config.sampleRate)) {
    throw new RvcContractError('MODEL_INCOMPATIBLE', 'The model manifest does not match the RVC configuration.');
  }
}

export function validateRvcProfile(profile: RvcProfile, manifest: RvcModelManifest): RvcConfig {
  if (profile.modelId !== manifest.id) {
    throw new RvcContractError('MODEL_INCOMPATIBLE', 'The profile references a different model.');
  }
  if (!manifest.supportedPitchExtractors.includes(profile.pitchExtractor)) {
    throw new RvcContractError('MODEL_INCOMPATIBLE', 'The selected pitch extractor is not supported by the model.');
  }
  if (!manifest.supportedInputModes.includes(profile.inputMode)) {
    throw new RvcContractError('MODEL_INCOMPATIBLE', 'The selected input mode is not supported by the model.');
  }
  const config: RvcConfig = {
    sampleRate: manifest.sampleRate,
    modelVersion: manifest.modelVersion,
    f0Method: profile.pitchExtractor,
    indexMode: profile.indexMode,
    indexRate: profile.indexRate,
    chunkDurationMs: profile.chunkDurationMs,
    executionProvider: profile.executionProvider,
    quantization: profile.quantization,
    memoryBudgetBytes: profile.memoryBudgetBytes,
  };
  validateRvcConfig(config, manifest);
  return config;
}
