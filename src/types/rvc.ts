export type RvcMode = 'offline' | 'streaming';
export type RvcPrecision = 'fp32' | 'int8';
export type RvcProvider = 'auto' | 'cpu' | 'xnnpack' | 'nnapi' | 'coreml';
export type RvcPitchExtractor = 'dio' | 'harvest' | 'pm' | 'rmvpe' | 'fcpe';
export type RvcModelRole = 'contentvec' | 'pitch' | 'net_g' | 'index';
export type RvcJobState =
  | 'idle'
  | 'validating'
  | 'preparing'
  | 'running'
  | 'completed'
  | 'cancelled'
  | 'failed';

export interface RvcConfig {
  schemaVersion: 1;
  enabled: boolean;
  mode: RvcMode;
  provider: RvcProvider;
  precision: RvcPrecision;
  pitchExtractor: RvcPitchExtractor;
  indexRate: number;
  chunkSeconds: number;
  overlapMilliseconds: number;
  maxQueuedChunks: number;
  outputSampleRate: 'model' | 32000 | 40000 | 48000;
  allowNetworkModels: boolean;
  ttsPostProcessingEnabled: boolean;
}

export interface RvcModelFile {
  role: RvcModelRole;
  path: string;
  sha256: string;
  bytes: number;
  precision?: RvcPrecision;
}

export interface RvcPitchMetadata {
  kind: RvcPitchExtractor;
  classes?: number;
}

export interface RvcModelManifest {
  schemaVersion: 1;
  engine: 'rvc';
  engineVersion: string;
  files: RvcModelFile[];
  inputSampleRate: 16000;
  outputSampleRate: 32000 | 40000 | 48000;
  contentDimension: 768;
  pitch: RvcPitchMetadata;
  supportsIndex: boolean;
  license: string;
  sourceUrl?: string;
  revision?: string;
  minOrtVersion?: string;
  opset?: number;
  estimatedRamBytes?: number;
}

export interface InstalledRvcModel {
  id: string;
  displayName: string;
  rootPath: string;
  manifest: RvcModelManifest;
  validationStatus: 'pending' | 'valid' | 'invalid';
  validationMessage?: string;
  installedAt: number;
}

export interface RvcCapabilityReport {
  supported: boolean;
  nativeRuntime: boolean;
  offlineRuntime: boolean;
  streamingRuntime: boolean;
  recommendedProvider: RvcProvider;
  recommendedPrecision: RvcPrecision;
  recommendedPitchExtractor: RvcPitchExtractor;
  deviceClass: 'limited' | 'capable' | 'high-performance' | 'unknown';
  availableRamBytes?: number;
  supportedAbis?: string[];
  warnings: string[];
}

export interface RvcValidationReport {
  valid: boolean;
  errors: string[];
  warnings: string[];
  files: RvcModelFile[];
  estimatedRamBytes: number;
}

export interface RvcConversionRequest {
  inputPath: string;
  outputPath: string;
  model: InstalledRvcModel;
  pitchShiftSemitones?: number;
  speakerId?: number;
  signal?: AbortSignal;
}

export interface RvcConversionResult {
  outputPath: string;
  sampleRate: number;
  durationSeconds: number;
  provider: RvcProvider;
  precision: RvcPrecision;
}

export interface RvcRuntime {
  getCapabilities(): Promise<RvcCapabilityReport>;
  validateModel(modelRootPath: string): Promise<RvcValidationReport>;
  convert(request: RvcConversionRequest): Promise<RvcConversionResult>;
  cancel(): Promise<void>;
}

export const DEFAULT_RVC_CONFIG: RvcConfig = {
  schemaVersion: 1,
  enabled: false,
  mode: 'offline',
  provider: 'auto',
  precision: 'fp32',
  pitchExtractor: 'dio',
  indexRate: 0,
  chunkSeconds: 2.5,
  overlapMilliseconds: 300,
  maxQueuedChunks: 2,
  outputSampleRate: 'model',
  allowNetworkModels: true,
  ttsPostProcessingEnabled: false,
};
