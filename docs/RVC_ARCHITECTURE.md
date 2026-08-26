# Optional RVC Inference Architecture

## Scope

This document defines the contract for adding **Retrieval-based Voice Conversion (RVC)** to PocketPal on the `pocketpal-lite` branch. RVC remains an optional capability. The base application must continue to build and run when RVC dependencies, native libraries, and model bundles are absent.

The first production target is **Android arm64**. The same TypeScript-facing contracts leave room for iOS, but iOS support is not considered production-ready until a native build and physical-device validation are available.

## Pipeline

The pipeline is a sequence of independently testable stages:

| Stage           | Contract                                                                 | Mobile constraint                                                                  |
| --------------- | ------------------------------------------------------------------------ | ---------------------------------------------------------------------------------- |
| Input           | Microphone PCM for speech-to-speech, or PCM from an existing TTS adapter | Capture and TTS output must be normalized before inference                         |
| Preprocessing   | Mono, model-declared sample rate, bounded float buffers                  | Never pass large intermediate tensors through the JavaScript bridge                |
| Content encoder | HuBERT or a manifest-declared compatible encoder                         | Prefer native tensor ownership; quantization must be validated per export          |
| Pitch           | RMVPE, FCPE, DIO, Harvest, or PM behind a common interface               | Select using measured quality, peak memory, latency, and license checks            |
| Retrieval       | Optional index blending                                                  | `indexRateDefault` is always `0`; do not load an index unless explicitly requested |
| Generator       | Manifest-declared Net_G/VITS-compatible ONNX graph                       | Keep activations native; start with floating-point or weight-only INT8             |
| Chunking        | 2,000–3,000 ms chunks with overlap and crossfade                         | Sequential bounded buffers prevent memory growth                                   |
| Output          | Native audio sink, preferably a low-latency path on Android              | Handle sample-rate mismatch, underruns, focus, interruption, and teardown          |

A typical application flow is `prepare → processChunk* → flush → release`. Every operation supports cancellation. JavaScript receives lifecycle, progress, capability, and error events; it does not receive HuBERT, pitch, or Net_G tensors in the fast path.

## Execution layouts

| Layout                                                   | Use                                                           | Decision gate                                                               |
| -------------------------------------------------------- | ------------------------------------------------------------- | --------------------------------------------------------------------------- |
| JavaScript orchestration with `onnxruntime-react-native` | Contract validation and high-end proof of concept             | Retain only if measured real-time factor and bridge pressure are acceptable |
| C++/JSI or TurboModule native pipeline                   | Android production fast path                                  | Preferred when profiling shows bridge/GC pressure or RTF above 1.0          |
| Remote/server fallback                                   | Devices that fail local capability checks or users who opt in | Explicitly labeled; never presented as offline local inference              |

The repository already enables React Native New Architecture, has `onnxruntime-react-native`, Android JNI/CMake code, device signal collection, and TTS/download infrastructure. New code should reuse these seams rather than introduce a second model or download system.

## Optimization switches

The safe defaults are deliberately conservative. The app may expose advanced settings only when the selected manifest and device capability report support them.

| Switch              | Default                                    | Behavior                                                                        |
| ------------------- | ------------------------------------------ | ------------------------------------------------------------------------------- |
| Index rate          | `0`                                        | Bypass FAISS/vector databases and avoid loading `.index` files into mobile RAM  |
| Chunk duration      | Manifest value, constrained to 2–3 seconds | Process sequentially with bounded working buffers                               |
| Crossfade           | Manifest value                             | Use overlap-add to reduce boundary clicks; validate against a reference harness |
| Pitch backend       | Manifest default                           | Allow FCPE or native DSP alternatives only when available and validated         |
| Generator precision | Manifest value                             | Do not assume INT8 is safe for Net_G; provide a float fallback                  |
| Execution provider  | CPU/XNNPACK-compatible baseline            | Put NNAPI or other accelerators behind capability checks and measurement        |

The phrase “zero-RAM DSP” is not used in product copy. Native DIO, Harvest, or PM implementations still allocate working memory; the app reports measured peak native memory instead.

## Model-bundle contract

A model bundle is a versioned manifest plus immutable component files. Required fields include model identity, source repository and revision, license, attribution, input/output sample rates, pitch backend, component names, hashes, byte sizes, quantization, supported ABIs, Android minimum API, minimum RAM, estimated peak RAM, and application compatibility range. Component URLs must be HTTPS Hugging Face URLs and must be pinned to a revision.

User-imported `.pth` files are rejected by the mobile application. They are not executed or converted on-device. Only validated ONNX bundles with complete hashes and compatible component kinds are loadable. Downloaded files are resumable, checksummed, cancellable, stored outside the JavaScript bundle, and removable by the user. Third-party model weights are not bundled by default; model licenses and attribution must be recorded before catalog publication.

## Quantization policy

ONNX Runtime’s quantization guidance distinguishes dynamic and static INT8, QOperator and QDQ representations, and recommends preprocessing and activation/weight debugging before trusting a quantized export.[^1] PocketPal therefore treats quantization as a model-specific artifact, not a global checkbox.

HuBERT and pitch candidates may be evaluated with dynamic INT8 or FP16. Net_G is initially expected to remain FP32/FP16 or use weight-only INT8 until audio quality tests show that static INT8 is acceptable. Each candidate must have fixed speech fixtures and report waveform quality, intelligibility, speaker similarity where available, model size, load time, real-time factor, and peak native memory.

## Device requirements and degradation

Device warnings are based on actual signals from PocketPal’s existing hardware module: total RAM, ABI, Android API, SoC/hardware identifiers, CPU features, and frequency information. A device that fails the manifest minimum or lacks arm64 support is shown a clear warning and is not allowed to start local inference. A device that passes minimum requirements may still be labeled “may be slow” when headroom is limited.

A low-tier device should retain the base PocketPal experience and can use an explicit remote fallback if a compatible service is configured. A high-tier device is not promised a particular latency until a physical-device benchmark confirms it. Thermal throttling, audio underruns, and cancellation are user-visible states rather than silent degradation.

## CI and acceptance gates

Every RVC change runs TypeScript, lint, unit tests, manifest validation, secret scanning, and the RVC-disabled Android build. RVC-enabled arm64 builds and native tests run when RVC or Android native paths change. Large model files remain external fixtures or controlled caches.

The minimum automated numerical gates are deterministic manifest validation, default index bypass, chunked versus unchunked comparison within an agreed tolerance, quantized-versus-floating comparison, cancellation, and error mapping. Device gates additionally measure cold start, model load time, real-time factor, peak native memory, underruns, and sustained thermal behavior. Performance thresholds are versioned after the first benchmark wave; no unmeasured device number is placed in UI copy.

## References

[^1]: [ONNX Runtime — Quantize ONNX models](https://onnxruntime.ai/docs/performance/model-optimizations/quantization.html)

[^2]: [ONNX Runtime — React Native](https://onnxruntime.ai/docs/get-started/with-javascript/react-native.html)

[^3]: [Android NDK — Audio latency](https://developer.android.com/ndk/guides/audio/audio-latency)

[^4]: [Hugging Face — Model cards](https://huggingface.co/docs/hub/en/model-cards)

[^5]: [CircuitCM/RVC-inference](https://github.com/CircuitCM/RVC-inference)

[^6]: [TigreGotico/voiceclonnx](https://github.com/TigreGotico/voiceclonnx)
