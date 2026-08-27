import {NativeModules, Platform} from 'react-native';
import {onnxRuntimeSpike} from '../OnnxRuntimeSpike';

describe('OnnxRuntimeSpike diagnostics contract', () => {
  it('reports CPU fallback when the native module is absent', async () => {
    const result = await onnxRuntimeSpike.inspectFixture(
      '/fixtures/onnx/identity_float.onnx',
      Platform.OS === 'ios'
        ? 'CoreMLExecutionProvider'
        : 'NNAPIExecutionProvider',
    );
    expect(result.selectedProvider).toBe('CPUExecutionProvider');
    expect(result.availableProviders).toContain('CPUExecutionProvider');
    expect(result).toHaveProperty('fallbackReasons');
  });

  it('keeps the native API shape stable when installed', () => {
    const module = NativeModules.OnnxRuntimeSpike;
    if (module) {
      expect(typeof module.inspectFixture).toBe('function');
      expect(typeof module.cancel).toBe('function');
    }
  });
});
