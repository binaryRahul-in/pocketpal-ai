import {makeAutoObservable, runInAction} from 'mobx';
import {makePersistable} from 'mobx-persist-store';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as RNFS from '@dr.pogodin/react-native-fs';

import {
  createRvcRuntime,
  getDeviceMemoryBytes,
  pickAndInstallRvcModel,
  RvcModelManager,
  type RvcHardwareFacts,
} from '../services/rvc';
import {
  DEFAULT_RVC_CONFIG,
  type InstalledRvcModel,
  type RvcCapabilityReport,
  type RvcConfig,
  type RvcConversionResult,
  type RvcJobState,
} from '../types/rvc';
import {Platform} from 'react-native';

export class RVCStore {
  config: RvcConfig = {...DEFAULT_RVC_CONFIG};
  models: InstalledRvcModel[] = [];
  selectedModelId: string | null = null;
  capability: RvcCapabilityReport | null = null;
  jobState: RvcJobState = 'idle';
  jobError: string | null = null;
  lastResult: RvcConversionResult | null = null;
  private initialized = false;
  private readonly runtime = createRvcRuntime(this.config);
  private readonly modelManager = new RvcModelManager({
    rootDirectory: `${RNFS.DocumentDirectoryPath}/rvc-models`,
    hasher: {
      sha256File: path => RNFS.hash(path, 'sha256'),
    },
    fileSystem: {
      exists: path => RNFS.exists(path),
      readFile: (path, encoding) => RNFS.readFile(path, encoding),
      mkdir: path => RNFS.mkdir(path),
      copyFile: (source, destination) => RNFS.copyFile(source, destination),
      unlink: path => RNFS.unlink(path),
    },
  });

  public constructor() {
    makeAutoObservable(this, {}, {autoBind: true});
    makePersistable(this, {
      name: 'RVCStore',
      properties: ['config', 'selectedModelId'],
      storage: AsyncStorage,
    }).catch(error => {
      console.warn('[RVCStore] persistence initialization failed:', error);
    });
  }

  public async init(): Promise<void> {
    if (this.initialized) return;
    this.initialized = true;
    const totalMemoryBytes = await getDeviceMemoryBytes();
    const facts: RvcHardwareFacts = {
      platform:
        Platform.OS === 'android' || Platform.OS === 'ios'
          ? Platform.OS
          : 'unknown',
      totalMemoryBytes,
      nativeRuntimeAvailable: false,
      xnnpackAvailable: true,
      nnapiAvailable: Platform.OS === 'android',
      coremlAvailable: Platform.OS === 'ios',
    };
    const capability = await this.runtime.getCapabilities();
    runInAction(() => {
      this.capability = {
        ...capability,
        availableRamBytes: facts.totalMemoryBytes,
      };
      this.models = this.modelManager.listInstalled();
      if (
        this.selectedModelId &&
        !this.models.some(model => model.id === this.selectedModelId)
      )
        this.selectedModelId = null;
    });
  }

  public setConfig(patch: Partial<Omit<RvcConfig, 'schemaVersion'>>): void {
    this.config = {...this.config, ...patch, schemaVersion: 1};
  }

  public selectModel(modelId: string | null): void {
    this.selectedModelId = modelId;
  }

  public get selectedModel(): InstalledRvcModel | null {
    return this.models.find(model => model.id === this.selectedModelId) ?? null;
  }

  public async installLocalModel(
    sourceRootPath: string,
    id: string,
    displayName: string,
  ): Promise<InstalledRvcModel> {
    this.jobState = 'validating';
    this.jobError = null;
    try {
      const model = await this.modelManager.install({
        id,
        displayName,
        sourceRootPath,
      });
      runInAction(() => {
        this.models = this.modelManager.listInstalled();
        this.selectedModelId = model.id;
        this.jobState = 'completed';
      });
      return model;
    } catch (error) {
      runInAction(() => {
        this.jobState = 'failed';
        this.jobError =
          error instanceof Error
            ? error.message
            : 'RVC model installation failed.';
      });
      throw error;
    }
  }

  public async pickAndInstallModel(): Promise<InstalledRvcModel | null> {
    this.jobState = 'validating';
    this.jobError = null;
    try {
      const model = await pickAndInstallRvcModel(this.modelManager);
      runInAction(() => {
        this.models = this.modelManager.listInstalled();
        if (model) this.selectedModelId = model.id;
        this.jobState = model ? 'completed' : 'idle';
      });
      return model;
    } catch (error) {
      runInAction(() => {
        this.jobState = 'failed';
        this.jobError =
          error instanceof Error ? error.message : 'RVC model import failed.';
      });
      throw error;
    }
  }

  public async removeModel(modelId: string): Promise<void> {
    await this.modelManager.remove(modelId);
    runInAction(() => {
      this.models = this.modelManager.listInstalled();
      if (this.selectedModelId === modelId) this.selectedModelId = null;
    });
  }

  public async convert(
    inputPath: string,
    outputPath: string,
    pitchShiftSemitones = 0,
  ): Promise<RvcConversionResult> {
    const model = this.selectedModel;
    if (!model)
      throw new Error('Select an RVC voice model before converting audio.');
    if (!this.config.enabled) throw new Error('RVC is disabled in settings.');
    this.jobState = 'running';
    this.jobError = null;
    try {
      const result = await this.runtime.convert({
        inputPath,
        outputPath,
        model,
        pitchShiftSemitones,
      });
      runInAction(() => {
        this.lastResult = result;
        this.jobState = 'completed';
      });
      return result;
    } catch (error) {
      runInAction(() => {
        this.jobState =
          error instanceof Error && error.message.includes('cancelled')
            ? 'cancelled'
            : 'failed';
        this.jobError =
          error instanceof Error ? error.message : 'RVC conversion failed.';
      });
      throw error;
    }
  }

  public async cancel(): Promise<void> {
    await this.runtime.cancel();
    runInAction(() => {
      this.jobState = 'cancelled';
    });
  }
}

export const rvcStore = new RVCStore();
