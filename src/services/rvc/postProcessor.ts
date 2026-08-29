import type {
  InstalledRvcModel,
  RvcConversionResult,
  RvcRuntime,
} from '../../types/rvc';

export interface RvcPostProcessorOptions {
  enabled: boolean;
  model: InstalledRvcModel | null;
  runtime: RvcRuntime;
}

export class RvcPostProcessor {
  private readonly options: RvcPostProcessorOptions;

  public constructor(options: RvcPostProcessorOptions) {
    this.options = options;
  }

  public async processTtsWav(
    inputPath: string,
    outputPath: string,
    pitchShiftSemitones = 0,
  ): Promise<RvcConversionResult | null> {
    if (!this.options.enabled || !this.options.model) return null;
    return this.options.runtime.convert({
      inputPath,
      outputPath,
      model: this.options.model,
      pitchShiftSemitones,
    });
  }
}
