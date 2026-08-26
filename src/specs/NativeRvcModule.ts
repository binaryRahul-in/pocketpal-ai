import type {TurboModule} from 'react-native';
import {TurboModuleRegistry} from 'react-native';

export type NativeRvcCapabilities = {
  nativeFastPath: boolean;
  streaming: boolean;
  quantizedInference: boolean;
  supportedPitchBackends: string[];
  supportedAbis: string[];
  reason?: string;
};

export type NativeRvcLoadRequest = {
  manifestPath: string;
  componentDirectory: string;
  pitchBackend: string;
  useIndex: boolean;
};

export type NativeRvcProcessRequest = {
  sessionId: string;
  pcm16Base64: string;
  sampleRateHz: number;
  channels: number;
  pitchShiftSemitones: number;
  indexRate: number;
  protectVoicelessConsonants: number;
};

export type NativeRvcProcessResponse = {
  pcm16Base64: string;
  sampleRateHz: number;
  channels: number;
  inputDurationMs: number;
  outputDurationMs: number;
  elapsedMs: number;
  peakNativeBytes?: number;
  audioUnderruns?: number;
};

export interface Spec extends TurboModule {
  getCapabilities(): Promise<NativeRvcCapabilities>;
  load(request: NativeRvcLoadRequest): Promise<{sessionId: string}>;
  processChunk(
    request: NativeRvcProcessRequest,
  ): Promise<NativeRvcProcessResponse>;
  flush(sessionId: string): Promise<NativeRvcProcessResponse>;
  cancel(sessionId: string): Promise<void>;
  release(sessionId: string): Promise<void>;
}

export default TurboModuleRegistry.get<Spec>('RvcModule');
