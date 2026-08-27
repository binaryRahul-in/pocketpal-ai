import {NativeModules} from 'react-native';
import type {
  RvcAudioInput,
  RvcCapabilities,
  RvcConfig,
  RvcLatencyMetrics,
  RvcProgressEvent,
} from '../domain/rvc';

export interface RvcModelHandle {
  id: string;
  modelVersion: string;
  targetSpeaker: string;
}

export interface RvcAudioChunk {
  pcm: ArrayBuffer;
  sampleRate: number;
  channels: 1 | 2;
  timestampMs?: number;
}

export interface RvcConversionResult {
  pcm: ArrayBuffer;
  sampleRate: number;
  channels: 1 | 2;
  metrics?: RvcLatencyMetrics;
}

export interface RvcNativeModule {
  loadModel(modelPath: string, config: RvcConfig): Promise<RvcModelHandle>;
  unloadModel(modelId: string): Promise<void>;
  convertFile(
    modelId: string,
    input: RvcAudioInput,
    onProgress?: (event: RvcProgressEvent) => void,
  ): Promise<RvcConversionResult>;
  startStream(modelId: string, config: RvcConfig): Promise<void>;
  pushAudioChunk(chunk: RvcAudioChunk): Promise<RvcConversionResult>;
  flush(): Promise<RvcConversionResult>;
  cancel(): Promise<void>;
  getCapabilities(): Promise<RvcCapabilities>;
  release(): Promise<void>;
}

/** The optional module is absent on builds that do not bundle an RVC engine. */
export function getOptionalRvcModule(): RvcNativeModule | undefined {
  const candidate = (NativeModules as {RvcModule?: unknown}).RvcModule;
  return candidate as RvcNativeModule | undefined;
}

export function isRvcAvailable(): boolean {
  return getOptionalRvcModule() !== undefined;
}

export async function getRvcCapabilities(): Promise<RvcCapabilities> {
  const module = getOptionalRvcModule();
  if (!module) {
    return {
      available: false,
      supportedInputModes: [],
      pitchExtractors: [],
      executionProviders: [],
      quantizations: [],
      sampleRates: [],
      reason: 'module-unavailable',
    };
  }
  return module.getCapabilities();
}
