export interface RvcChunkQueueOptions {
  maxQueuedChunks: number;
  chunkSeconds: number;
  sampleRate: number;
}

export interface RvcAudioChunk {
  sequence: number;
  samples: Float32Array;
  sampleRate: number;
}

export class RvcChunkQueue {
  private readonly maxQueuedChunks: number;
  private readonly chunks: RvcAudioChunk[] = [];
  private sequence = 0;
  private stopped = false;

  public constructor(options: RvcChunkQueueOptions) {
    if (options.maxQueuedChunks < 1)
      throw new Error('RVC queue must allow at least one queued chunk.');
    if (options.chunkSeconds < 2 || options.chunkSeconds > 3)
      throw new Error('RVC chunks must be between 2 and 3 seconds.');
    this.maxQueuedChunks = options.maxQueuedChunks;
  }

  public get size(): number {
    return this.chunks.length;
  }

  public push(samples: Float32Array, sampleRate: number): RvcAudioChunk | null {
    if (this.stopped || this.chunks.length >= this.maxQueuedChunks) return null;
    const chunk = {sequence: this.sequence++, samples, sampleRate};
    this.chunks.push(chunk);
    return chunk;
  }

  public shift(): RvcAudioChunk | undefined {
    return this.chunks.shift();
  }

  public stop(): void {
    this.stopped = true;
    this.chunks.length = 0;
  }

  public reset(): void {
    this.stopped = false;
    this.chunks.length = 0;
  }
}

export function crossfade(
  left: Float32Array,
  right: Float32Array,
  overlapSamples: number,
): Float32Array {
  const overlap = Math.max(
    0,
    Math.min(overlapSamples, left.length, right.length),
  );
  const output = new Float32Array(left.length + right.length - overlap);
  output.set(left.slice(0, left.length - overlap), 0);
  for (let index = 0; index < overlap; index += 1) {
    const leftWeight = (overlap - index) / overlap;
    const rightWeight = index / overlap;
    output[left.length - overlap + index] =
      left[left.length - overlap + index] * leftWeight +
      right[index] * rightWeight;
  }
  output.set(right.slice(overlap), left.length);
  return output;
}
