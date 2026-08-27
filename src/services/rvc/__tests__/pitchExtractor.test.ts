import {
  benchmarkPitchExtractor,
  createFcpeOnnxExtractor,
  createNativePitchExtractor,
  createRmvpeExtractor,
  normalizeF0Frames,
  rankPitchBenchmarks,
  selectPitchBackend,
  type BenchmarkSample,
} from '../pitchExtractor';

describe('pitch extractor contract', () => {
  const request = {
    pcm: new Float32Array(1600),
    sampleRateHz: 16000,
    hopLength: 160,
  };

  it('normalizes all backends to the same voiced/null frame contract', () => {
    expect(
      normalizeF0Frames([220, 0, null, 440], request, [0.9, 0, 0, 1]),
    ).toEqual([
      {timeSeconds: 0.005, f0Hz: 220, confidence: 0.9, voiced: true},
      {timeSeconds: 0.015, f0Hz: null, confidence: 0, voiced: false},
      {timeSeconds: 0.025, f0Hz: null, confidence: 0, voiced: false},
      {timeSeconds: 0.035, f0Hz: 440, confidence: 1, voiced: true},
    ]);
  });

  it('keeps the Net_G-facing request independent of the pitch backend', async () => {
    const runtime = {run: jest.fn(async () => [220, 220])};
    const rmvpe = createRmvpeExtractor(runtime);
    const fcpe = createFcpeOnnxExtractor(runtime);
    const dio = createNativePitchExtractor('dio', runtime);
    expect((await rmvpe.extract(request)).map(x => x.f0Hz)).toEqual(
      (await fcpe.extract(request)).map(x => x.f0Hz),
    );
    expect((await dio.extract(request)).map(x => x.f0Hz)).toEqual([220, 220]);
    expect(rmvpe.backend).toBe('rmvpe');
  });

  it('defaults to RMVPE and requires explicit warning for native DSP', () => {
    expect(selectPitchBackend()).toBe('rmvpe');
    expect(() => selectPitchBackend({backend: 'dio'})).toThrow(
      /quality-warning/i,
    );
    expect(
      selectPitchBackend({backend: 'dio', allowQualityWarnings: true}),
    ).toBe('dio');
    expect(selectPitchBackend({backend: 'fcpe'}, ['fcpe'])).toBe('fcpe');
  });

  it('reports benchmark quality, warm-up, memory, continuity, and conversion quality', async () => {
    const reference = normalizeF0Frames([220, 220, null, 440], request);
    const corpus: BenchmarkSample[] = [
      {
        id: 'synthetic-sine',
        request,
        reference,
        conversionQuality: frames => (frames[0].voiced ? 1 : 0),
      },
    ];
    const result = await benchmarkPitchExtractor(
      createRmvpeExtractor({run: async () => [220, 220, null, 440]}),
      corpus,
    );
    expect(result).toMatchObject({
      backend: 'rmvpe',
      voicedUnvoicedErrorRate: 0,
      octaveErrorRate: 0,
      conversionQuality: 1,
      sampleCount: 1,
    });
    expect(result.deviceProfile).toMatch(/low-end-android-proxy/);
    expect(result.warmupMs).toBeGreaterThanOrEqual(0);
    expect(result.peakRssBytes).toBeGreaterThanOrEqual(0);
    expect(rankPitchBenchmarks([result])).toBe('rmvpe');
  });
});
