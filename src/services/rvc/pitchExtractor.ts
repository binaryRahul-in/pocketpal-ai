import {performance} from 'perf_hooks';

import type {RvcPitchBackend} from './types';

export type NormalizedF0Frame = {
  /** Frame center in seconds. */
  timeSeconds: number;
  /** Hz; null is the canonical unvoiced value. */
  f0Hz: number | null;
  /** Probability in [0, 1], or 0 for unvoiced frames. */
  confidence: number;
  /** True iff f0Hz is present and confidence is non-zero. */
  voiced: boolean;
};

export type PitchExtractionRequest = {
  pcm: Float32Array;
  sampleRateHz: number;
  hopLength: number;
  fminHz?: number;
  fmaxHz?: number;
};

export type PitchExtractor = {
  backend: RvcPitchBackend;
  extract(request: PitchExtractionRequest): Promise<NormalizedF0Frame[]>;
  warmup?(): Promise<void>;
  dispose?(): Promise<void>;
};

export type PitchRuntime = {
  run(request: PitchExtractionRequest): Promise<unknown>;
  warmup?(): Promise<void>;
  dispose?(): Promise<void>;
};

const DEFAULT_FMIN = 50;
const DEFAULT_FMAX = 1100;

export function normalizeF0Frames(
  values: Array<number | null | undefined>,
  request: PitchExtractionRequest,
  confidences?: Array<number | undefined>,
): NormalizedF0Frame[] {
  const fmin = request.fminHz ?? DEFAULT_FMIN;
  const fmax = request.fmaxHz ?? DEFAULT_FMAX;
  return values.map((value, index) => {
    const confidence = Math.max(
      0,
      Math.min(1, confidences?.[index] ?? (value ? 1 : 0)),
    );
    const valid =
      typeof value === 'number' &&
      Number.isFinite(value) &&
      value >= fmin &&
      value <= fmax &&
      confidence > 0;
    return {
      timeSeconds:
        (index * request.hopLength + request.hopLength / 2) /
        request.sampleRateHz,
      f0Hz: valid ? value! : null,
      confidence: valid ? confidence : 0,
      voiced: valid,
    };
  });
}

function runtimeAdapter(
  backend: RvcPitchBackend,
  runtime: PitchRuntime,
): PitchExtractor {
  return {
    backend,
    async extract(request) {
      const output = await runtime.run(request);
      if (!Array.isArray(output))
        throw new Error(`${backend} runtime returned a non-array F0 result`);
      const values = output.map(item =>
        typeof item === 'number'
          ? item
          : ((item as {f0Hz?: number; f0?: number | null})?.f0Hz ??
            (item as {f0?: number | null})?.f0),
      );
      const confidences = output.map(item =>
        typeof item === 'object' && item
          ? (item as {confidence?: number}).confidence
          : undefined,
      );
      return normalizeF0Frames(values, request, confidences);
    },
    warmup: runtime.warmup,
    dispose: runtime.dispose,
  };
}

/** RMVPE remains the quality reference and is intentionally the default. */
export function createRmvpeExtractor(runtime: PitchRuntime): PitchExtractor {
  return runtimeAdapter('rmvpe', runtime);
}
/** FCPE is the explicitly opt-in lightweight ONNX alternative. */
export function createFcpeOnnxExtractor(runtime: PitchRuntime): PitchExtractor {
  return runtimeAdapter('fcpe', runtime);
}
export function createNativePitchExtractor(
  backend: 'dio' | 'harvest' | 'pm',
  runtime: PitchRuntime,
): PitchExtractor {
  return runtimeAdapter(backend, runtime);
}

export type PitchSelectionConfig = {
  backend?: RvcPitchBackend;
  allowQualityWarnings?: boolean;
};
export const PITCH_BACKEND_ORDER: RvcPitchBackend[] = [
  'rmvpe',
  'fcpe',
  'dio',
  'harvest',
  'pm',
];

export function selectPitchBackend(
  config: PitchSelectionConfig = {},
  available: RvcPitchBackend[] = PITCH_BACKEND_ORDER,
): RvcPitchBackend {
  const requested = config.backend;
  if (
    requested &&
    !config.allowQualityWarnings &&
    (requested === 'dio' || requested === 'harvest' || requested === 'pm')
  ) {
    throw new Error(
      `${requested} requires an explicit quality-warning acknowledgement (allowQualityWarnings=true); native DSP quality is not equivalent to RMVPE`,
    );
  }
  if (requested && available.includes(requested)) return requested;
  if (requested) return requested;
  return available.includes('rmvpe')
    ? 'rmvpe'
    : available.includes('fcpe')
      ? 'fcpe'
      : (available[0] ?? 'rmvpe');
}

export type BenchmarkSample = {
  id: string;
  request: PitchExtractionRequest;
  reference: NormalizedF0Frame[];
  /** Optional converted audio scorer; 1 is transparent, 0 is unusable. */
  conversionQuality?: (frames: NormalizedF0Frame[]) => number;
};

export type PitchBenchmarkResult = {
  backend: RvcPitchBackend;
  voicedUnvoicedErrorRate: number;
  octaveErrorRate: number;
  cpuTimeMs: number;
  peakRssBytes: number;
  warmupMs: number;
  chunkBoundaryContinuity: number;
  conversionQuality: number | null;
  sampleCount: number;
  deviceProfile: string;
  qualityWarning?: string;
};

const rss = () =>
  typeof process !== 'undefined' && process.memoryUsage
    ? process.memoryUsage().rss
    : 0;
const median = (values: number[]) =>
  values.length
    ? [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)]
    : 0;

function frameErrors(
  actual: NormalizedF0Frame[],
  reference: NormalizedF0Frame[],
) {
  const n = Math.min(actual.length, reference.length);
  let vu = 0;
  let octave = 0;
  for (let i = 0; i < n; i += 1) {
    const a = actual[i];
    const r = reference[i];
    if (a.voiced !== r.voiced) vu += 1;
    if (
      a.voiced &&
      r.voiced &&
      (a.f0Hz! / r.f0Hz! > 1.8 || a.f0Hz! / r.f0Hz! < 0.55)
    )
      octave += 1;
  }
  return {vu: n ? vu / n : 0, octave: n ? octave / n : 0};
}

function continuity(
  frames: NormalizedF0Frame[],
  hopLength: number,
  sampleRateHz: number,
) {
  const voiced = frames.filter(frame => frame.voiced).map(frame => frame.f0Hz!);
  if (voiced.length < 2) return 1;
  const jumps = voiced
    .slice(1)
    .map((f0, i) => Math.abs(Math.log2(f0 / voiced[i])));
  return (
    Math.max(0, 1 - median(jumps) / 0.5) *
    (hopLength > 0 && sampleRateHz > 0 ? 1 : 0)
  );
}

export async function benchmarkPitchExtractor(
  extractor: PitchExtractor,
  corpus: BenchmarkSample[],
  deviceProfile = 'low-end-android-proxy: 4x CPU / 2GB RAM',
): Promise<PitchBenchmarkResult> {
  const warmupStart = performance.now();
  if (extractor.warmup) await extractor.warmup();
  const warmupMs = performance.now() - warmupStart;
  const vu: number[] = [];
  const octave: number[] = [];
  const cpu: number[] = [];
  const cont: number[] = [];
  const quality: number[] = [];
  const startRss = rss();
  let peak = startRss;
  for (const sample of corpus) {
    const started = performance.now();
    const frames = await extractor.extract(sample.request);
    cpu.push(performance.now() - started);
    peak = Math.max(peak, rss());
    const errors = frameErrors(frames, sample.reference);
    vu.push(errors.vu);
    octave.push(errors.octave);
    cont.push(
      continuity(frames, sample.request.hopLength, sample.request.sampleRateHz),
    );
    if (sample.conversionQuality)
      quality.push(Math.max(0, Math.min(1, sample.conversionQuality(frames))));
  }
  const qualityWarning = ['dio', 'harvest', 'pm'].includes(extractor.backend)
    ? 'Native DSP backend is exposed only as an explicit quality-warning option; compare against RMVPE before use.'
    : undefined;
  return {
    backend: extractor.backend,
    voicedUnvoicedErrorRate: median(vu),
    octaveErrorRate: median(octave),
    cpuTimeMs: median(cpu),
    peakRssBytes: Math.max(0, peak - startRss),
    warmupMs,
    chunkBoundaryContinuity: median(cont),
    conversionQuality: quality.length ? median(quality) : null,
    sampleCount: corpus.length,
    deviceProfile,
    qualityWarning,
  };
}

export function rankPitchBenchmarks(
  results: PitchBenchmarkResult[],
): RvcPitchBackend {
  if (!results.length) return 'rmvpe';
  return [...results].sort(
    (a, b) =>
      a.voicedUnvoicedErrorRate +
        a.octaveErrorRate -
        (b.voicedUnvoicedErrorRate + b.octaveErrorRate) ||
      a.cpuTimeMs - b.cpuTimeMs,
  )[0].backend;
}
