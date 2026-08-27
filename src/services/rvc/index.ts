import * as RNFS from '@dr.pogodin/react-native-fs';
import DeviceInfo from 'react-native-device-info';
import {Platform} from 'react-native';

import NativeRvcRuntime from '../../specs/NativeRvcRuntime';
import {
  DEFAULT_RVC_CONFIG,
  type InstalledRvcModel,
  type RvcConfig,
  type RvcRuntime,
} from '../../types/rvc';
import {OrtRvcRuntime} from './runtime';

export * from './capabilities';
export * from './config';
export * from './executionPlan';
export * from './modelManifest';
export * from './modelManager';
export * from './postProcessor';
export * from './importer';
export * from './registry';
export * from './runtime';
export * from './streaming';

export function createRvcRuntime(
  config: RvcConfig = DEFAULT_RVC_CONFIG,
): RvcRuntime {
  return new OrtRvcRuntime({
    config,
    fileSystem: {
      readFile: (path, encoding) => RNFS.readFile(path, encoding),
      writeFile: (path, data, encoding) => RNFS.writeFile(path, data, encoding),
    },
    hardware: {
      platform:
        Platform.OS === 'android' || Platform.OS === 'ios'
          ? Platform.OS
          : 'unknown',
      nativeRuntimeAvailable: NativeRvcRuntime !== null,
      xnnpackAvailable: true,
      nnapiAvailable: Platform.OS === 'android',
      coremlAvailable: Platform.OS === 'ios',
      supportedAbis: [],
      totalMemoryBytes: undefined,
    },
    loadOrt: async () => require('onnxruntime-react-native'),
  });
}

export function modelFromManifest(
  id: string,
  displayName: string,
  rootPath: string,
  manifest: InstalledRvcModel['manifest'],
): InstalledRvcModel {
  return {
    id,
    displayName,
    rootPath,
    manifest,
    validationStatus: 'pending',
    installedAt: Date.now(),
  };
}

export async function getDeviceMemoryBytes(): Promise<number | undefined> {
  try {
    return await DeviceInfo.getTotalMemory();
  } catch {
    return undefined;
  }
}
