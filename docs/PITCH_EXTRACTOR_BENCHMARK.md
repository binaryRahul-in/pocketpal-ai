# Offline pitch-extractor benchmark

PocketPal’s RVC pitch stage now has an offline adapter boundary shared by **RMVPE**, **FCPE ONNX**, and native C++ **DIO**, **Harvest**, and **PM** implementations. Every adapter returns `NormalizedF0Frame[]`: frame-center time, `f0Hz` in hertz or `null` for unvoiced, confidence in `[0, 1]`, and a consistent voiced flag. The adapter consumes PCM, sample rate, hop length, and optional frequency limits; it does not receive or mutate `Net_G` inputs.

## Selection policy

RMVPE is the quality baseline and the default whenever it is available. FCPE is the lightweight ONNX alternative and may be selected with `pitchBackend: "fcpe"`. DIO, Harvest, and PM are available only when the caller explicitly sets `allowQualityWarnings: true`; this makes the quality trade-off visible rather than silently changing conversion behavior. A caller can override the default with `selectPitchBackend({backend, allowQualityWarnings})`, while manifests and `RvcInferenceOptions.pitchBackend` remain unchanged.

The benchmark’s `rankPitchBenchmarks` function ranks measured voiced/unvoiced and octave error first, then CPU time. It is intended to make a measured result, rather than device assumptions, the source of a future default change. The runtime adapter accepts either an array of numeric F0 values or objects containing `f0Hz`/`f0` and `confidence`, so actual ONNX and native bindings can be injected without duplicating normalization logic.

## Corpus and measurements

`BenchmarkSample` contains an identifier, PCM request, reference normalized frames, and an optional conversion-quality scorer. Run each adapter against the same samples. `benchmarkPitchExtractor` records median CPU time per sample, warm-up time, RSS delta as a portable peak-memory proxy, voiced/unvoiced error rate, octave error rate, chunk-boundary continuity, and conversion quality. Native implementations should provide an audio scorer that compares the converted waveform against the RMVPE-baseline conversion; a missing scorer is reported as `null`, not as a fabricated score.

The default device profile is deliberately explicit: `low-end-android-proxy: 4x CPU / 2GB RAM`. This is a documented proxy for low-end Android-class hardware when an Android device is not connected. For release evidence, repeat the same corpus on a physical device and replace the profile with its model, ABI, Android API, CPU, RAM, thermal state, and run count. RSS is a process-level proxy on non-Android hosts; a native Android runner should additionally report native heap/PSS.

## Net_G contract

Pitch extractor swaps are isolated to the pitch adapter. The `RvcInferenceOptions` shape and `NativeRvcProcessRequest` shape are unchanged, and no extractor-specific tensor is exposed to `Net_G`. Adapters should therefore be wired before the existing generator invocation and pass the same normalized frame array downstream.

## Reproducibility

Use fixed mono PCM fixtures spanning voiced speech, unvoiced consonants, register transitions, vibrato, and chunk boundaries. Store corpus metadata and references outside the application bundle; model weights are not committed. Run `yarn test src/services/rvc/__tests__/pitchExtractor.test.ts` and `yarn typecheck` before accepting a backend. A backend is not eligible for a default change unless it is measured against RMVPE on the same corpus and its conversion-quality score and continuity remain within the product’s agreed tolerance.
