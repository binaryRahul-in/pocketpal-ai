import {NativeModules, Platform} from 'react-native';

export type OnnxProvider =
  | 'CPUExecutionProvider'
  | 'XNNPACKExecutionProvider'
  | 'NNAPIExecutionProvider'
  | 'CoreMLExecutionProvider';

export type OnnxDiagnostics = {
  requestedProvider: OnnxProvider;
  selectedProvider: OnnxProvider;
  availableProviders: OnnxProvider[];
  fallbackReasons: string[];
  initialized: boolean;
  cancelled: boolean;
  error?: string;
};

type OnnxRuntimeSpikeModule = {
  inspectFixture(
    modelPath: string,
    requestedProvider: OnnxProvider,
    quantized: boolean,
  ): Promise<OnnxDiagnostics>;
  cancel(): void;
};

const nativeModule = NativeModules.OnnxRuntimeSpike as
  | OnnxRuntimeSpikeModule
  | undefined;

export const onnxRuntimeSpike = {
  inspectFixture: async (
    modelPath: string,
    requestedProvider: OnnxProvider = Platform.OS === 'ios'
      ? 'CoreMLExecutionProvider'
      : 'XNNPACKExecutionProvider',
    quantized = false,
  ) => {
    if (!nativeModule) {
      return {
        requestedProvider,
        selectedProvider: 'CPUExecutionProvider' as const,
        availableProviders: ['CPUExecutionProvider' as const],
        fallbackReasons: [
          'OnnxRuntimeSpike native module is unavailable in this build',
        ],
        initialized: false,
        cancelled: false,
      } satisfies OnnxDiagnostics;
    }
    return nativeModule.inspectFixture(modelPath, requestedProvider, quantized);
  },
  cancel: () => nativeModule?.cancel(),
};
