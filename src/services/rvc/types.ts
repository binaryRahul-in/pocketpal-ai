export type RvcPitchBackend = 'rmvpe' | 'fcpe' | 'dio' | 'harvest' | 'pm';

export type RvcQuantization =
  | 'fp32'
  | 'fp16'
  | 'dynamic-int8'
  | 'static-int8-qdq'
  | 'weight-only-int8';

export type RvcComponentKind =
  | 'content_encoder'
  | 'pitch'
  | 'generator'
  | 'index';

export interface RvcModelComponent {
  kind: RvcComponentKind;
  filename: string;
  sha256: string;
  sizeBytes: number;
  quantization: RvcQuantization;
  required: boolean;
  url?: string;
}

export interface RvcChunkingProfile {
  chunkDurationMs: number;
  overlapMs: number;
  crossfade: 'linear' | 'hann';
}

export interface RvcModelManifest {
  schemaVersion: '1.0';
  id: string;
  displayName: string;
  revision: string;
  source: {
    provider: 'huggingface';
    repository: string;
    revision: string;
    manifestUrl?: string;
  };
  license: string;
  attribution: string;
  inputSampleRateHz: number;
  outputSampleRateHz: number;
  pitchBackend: RvcPitchBackend;
  components: RvcModelComponent[];
  index?: {
    filename: string;
    sha256: string;
    sizeBytes: number;
    url?: string;
  };
  indexRateDefault: 0;
  chunking: RvcChunkingProfile;
  supportedAbis: string[];
  minAndroidApi: number;
  minRamBytes: number;
  estimatedPeakRamBytes: number;
  appCompatibility: {
    minVersion: string;
    maxVersion?: string;
  };
}

export interface RvcEngineCapabilities {
  available: boolean;
  nativeFastPath: boolean;
  jsFallback: boolean;
  streaming: boolean;
  quantizedInference: boolean;
  supportedPitchBackends: RvcPitchBackend[];
  indexRetrieval: boolean;
  reason?: string;
}

export interface RvcInferenceOptions {
  pitchShiftSemitones: number;
  indexRate: number;
  protectVoicelessConsonants: number;
  pitchBackend?: RvcPitchBackend;
  chunkDurationMs?: number;
}

export interface RvcInferenceMetrics {
  inputDurationMs: number;
  outputDurationMs: number;
  elapsedMs: number;
  realTimeFactor: number;
  peakNativeBytes?: number;
  audioUnderruns?: number;
}

export interface RvcInferenceResult {
  audioPath?: string;
  metrics: RvcInferenceMetrics;
  backend: 'native-jsi' | 'native-bridge' | 'javascript';
}
