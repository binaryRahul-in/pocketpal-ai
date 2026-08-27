import {RvcChunkQueue, crossfade} from './streaming';

describe('RvcChunkQueue', () => {
  it('applies backpressure and clears on stop', () => {
    const queue = new RvcChunkQueue({
      maxQueuedChunks: 2,
      chunkSeconds: 2.5,
      sampleRate: 16000,
    });
    expect(queue.push(new Float32Array([1]), 16000)).not.toBeNull();
    expect(queue.push(new Float32Array([2]), 16000)).not.toBeNull();
    expect(queue.push(new Float32Array([3]), 16000)).toBeNull();
    expect(queue.size).toBe(2);
    queue.stop();
    expect(queue.size).toBe(0);
    expect(queue.push(new Float32Array([4]), 16000)).toBeNull();
    queue.reset();
    expect(queue.push(new Float32Array([5]), 16000)).not.toBeNull();
  });
});

describe('crossfade', () => {
  it('blends the overlap and preserves the non-overlap samples', () => {
    const output = crossfade(
      new Float32Array([1, 1, 1]),
      new Float32Array([0, 0, 0]),
      2,
    );
    expect(Array.from(output)).toEqual([1, 1, 0.5, 0]);
  });
});
