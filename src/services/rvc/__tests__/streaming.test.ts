import {RvcPcmChunker} from '../streaming';

describe('RvcPcmChunker', () => {
  it('emits bounded overlapping windows and a final remainder', () => {
    const chunker = new RvcPcmChunker(1000, {
      chunkDurationMs: 2000,
      overlapMs: 500,
      crossfade: 'hann',
    });
    const first = chunker.push(
      Float32Array.from({length: 2000}, (_, index) => index),
    );
    expect(first).toHaveLength(1);
    expect(first[0].startSample).toBe(0);
    expect(first[0].endSample).toBe(2000);
    const second = chunker.push(
      Float32Array.from({length: 1500}, (_, index) => index + 2000),
    );
    expect(second).toHaveLength(1);
    expect(second[0].startSample).toBe(1500);
    const final = chunker.flush();
    expect(final?.isFinal).toBe(true);
    expect(final?.startSample).toBe(3000);
    expect(final?.samples).toHaveLength(500);
  });

  it('does not emit an empty final window', () => {
    const chunker = new RvcPcmChunker(16000, {
      chunkDurationMs: 2000,
      overlapMs: 500,
      crossfade: 'linear',
    });
    expect(chunker.flush()).toBeNull();
  });
});
