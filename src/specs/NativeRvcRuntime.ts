import type {TurboModule} from 'react-native';
import {TurboModuleRegistry} from 'react-native';

export interface NativeRvcCapability {
  supported: boolean;
  streaming: boolean;
  provider: string;
  precision: string;
  warnings: string[];
}

export interface NativeRvcValidation {
  valid: boolean;
  errors: string[];
  warnings: string[];
  estimatedRamBytes: number;
}

export interface Spec extends TurboModule {
  getCapabilities(): Promise<NativeRvcCapability>;
  validateModel(rootPath: string): Promise<NativeRvcValidation>;
  convert(
    inputPath: string,
    outputPath: string,
    modelRootPath: string,
    optionsJson: string,
  ): Promise<string>;
  startStreaming(modelRootPath: string, optionsJson: string): Promise<boolean>;
  writeStreamingPcm(base64Pcm16: string, sampleRate: number): Promise<number>;
  stopStreaming(): Promise<void>;
  cancel(): Promise<void>;
}

export default TurboModuleRegistry.get<Spec>('NativeRvcRuntime');
