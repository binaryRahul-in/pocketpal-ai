import {RvcChunkingProfile} from './types';

export interface PcmWindow {
  samples: Float32Array;
  startSample: number;
  endSample: number;
  isFinal: boolean;
}

/**
 * Splits mono PCM into bounded windows. The native engine owns conversion and
 * inference; this helper only defines deterministic window boundaries for
 * reference tests and JS fallback orchestration.
 */
export class RvcPcmChunker {
  private readonly chunkSamples: number;
  private readonly overlapSamples: number;
  private readonly hopSamples: number;
  private pending = new Float32Array(0);
  private pendingStart = 0;

  constructor(
    private readonly sampleRateHz: number,
    profile: RvcChunkingProfile,
  ) {
    if (!Number.isInteger(sampleRateHz) || sampleRateHz <= 0) {
      throw new Error('sample rate must be a positive integer');
    }
    this.chunkSamples = Math.round(
      (profile.chunkDurationMs / 1000) * sampleRateHz,
    );
    this.overlapSamples = Math.round((profile.overlapMs / 1000) * sampleRateHz);
    this.hopSamples = this.chunkSamples - this.overlapSamples;
    if (
      this.chunkSamples <= 0 ||
      this.overlapSamples <= 0 ||
      this.hopSamples <= 0
    ) {
      throw new Error('invalid RVC chunking profile');
    }
  }

  push(samples: Float32Array): PcmWindow[] {
    if (samples.length === 0) return [];
    const merged = new Float32Array(this.pending.length + samples.length);
    merged.set(this.pending);
    merged.set(samples, this.pending.length);
    this.pending = merged;
    const windows: PcmWindow[] = [];
    while (this.pending.length >= this.chunkSamples) {
      const data = this.pending.slice(0, this.chunkSamples);
      const start = this.pendingStart;
      windows.push({
        samples: data,
        startSample: start,
        endSample: start + data.length,
        isFinal: false,
      });
      this.pending = this.pending.slice(this.hopSamples);
      this.pendingStart += this.hopSamples;
    }
    return windows;
  }

  flush(): PcmWindow | null {
    if (this.pending.length === 0) return null;
    const start = this.pendingStart;
    const data = this.pending;
    this.pending = new Float32Array(0);
    this.pendingStart += data.length;
    return {
      samples: data,
      startSample: start,
      endSample: start + data.length,
      isFinal: true,
    };
  }
}
