import {Platform} from 'react-native';
import DeviceInfo from 'react-native-device-info';
import NativeHardwareInfo from '../../specs/NativeHardwareInfo';
import {getCpuCoreCount} from '../../utils/deviceCapabilities';
import type {
  RvcAudioRoute,
  RvcHardwareProbe,
  RvcOnnxProvider,
  RvcPlatform,
} from './hardwarePolicy';

/**
 * Conservative native probe. Provider discovery is intentionally CPU-first:
 * ONNX Runtime provider availability is not inferred from the GPU brand, and
 * platform acceleration is never presented as universally faster.
 */
export const nativeRvcHardwareProbe: RvcHardwareProbe = {
  getOs(): RvcPlatform {
    if (Platform.OS === 'android' || Platform.OS === 'ios') return Platform.OS;
    return 'unknown';
  },
  async getAbi(): Promise<string> {
    const abis = await DeviceInfo.supportedAbis();
    return abis[0] ?? 'unknown';
  },
  getTotalRamBytes(): Promise<number> {
    return DeviceInfo.getTotalMemory();
  },
  getFreeStorageBytes(): Promise<number> {
    return DeviceInfo.getFreeDiskStorage();
  },
  getCpuCoreCount,
  async getApiLevel(): Promise<number | undefined> {
    if (Platform.OS !== 'android') return undefined;
    return DeviceInfo.getApiLevel();
  },
  getAudioRoute(): RvcAudioRoute {
    return 'unknown';
  },
  async getOnnxProviders(): Promise<RvcOnnxProvider[]> {
    // The RN binding does not expose a reliable provider enumeration API.
    // Treat CPU as the only confirmed provider until native probing reports more.
    try {
      await NativeHardwareInfo.getCPUInfo();
    } catch {
      // Keep the deterministic CPU fallback even when native inspection fails.
    }
    return ['cpu'];
  },
};
