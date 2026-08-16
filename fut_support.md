# MobiGPT Future Support Research and Roadmap

## 1. Executive summary

MobiGPT already contains the foundation for an extensible local AI client: local model management, GGUF-oriented model metadata, native local inference dependencies, a model picker, session persistence, capability detection utilities, download workers, multimodal-related helpers retained from upstream, and API modules for selected remote services. It does **not** yet expose a stable, documented public inference server API from the phone, and the existing API modules should not be treated as a complete external developer API without an explicit contract.

The recommended direction is incremental:

1. Stabilize a local inference service boundary and model/provider interface.
2. Add an authenticated localhost API and optional explicitly enabled LAN mode.
3. Expand GGUF/model metadata and provider registration without hard-coding every model into screens.
4. Add capability-gated agents and tools.
5. Add VLM/audio input only after runtime and memory constraints are measured.
6. Treat image generation, TTS, and voice cloning as separate model families with their own storage, permissions, licensing, and safety controls.

## 2. Current repository capability audit

### 2.1 Existing inference and API surface

The current source tree includes `src/api/completionEngines.ts`, `src/api/openai.ts`, `src/api/sseParser.ts`, Hugging Face helpers, benchmark/feedback APIs, `src/store/ServerStore.ts`, model stores, model settings utilities, and native specifications such as `NativeDownloadModule` and `NativeHardwareInfo`. This indicates that the application already has multiple API/client boundaries and remote-server concepts, but these should be classified carefully:

| Capability | Current status | Recommended interpretation |
|---|---|---|
| Local on-device inference | Present through the React Native/native model runtime and local model manager. | Existing primary product capability. Stabilize behind a typed `InferenceSession` interface. |
| Remote completion/API client | Present in upstream-derived API modules such as `src/api/openai.ts` and completion-engine code. | Client-side integration, not automatically a public server API. Document supported providers and error behavior. |
| Streaming responses | SSE parsing and completion-engine code exist. | Reuse for a versioned local/remote streaming contract. |
| Model download/catalog | Present through model services, model store, download worker, Hugging Face helpers, recommendations, and integrity checks. | Existing extension point for more GGUF providers and registries. |
| Public phone-hosted inference API | No stable, documented, authenticated server contract has been established by this repository audit. | Future feature. Start localhost-only and opt-in. |
| OpenAI-compatible local endpoint | Technically feasible through a server adapter, but not currently a supported MobiGPT endpoint. | Future feature; do not expose an unauthenticated listener. |
| VLM/image/audio inference | Some multimodal helpers and upstream remnants exist, but the Lite product surface removed video/image chat. | Future runtime capability, gated by model metadata and native support. |
| TTS/voice | A TTS store and automation references exist in the broader source tree, but this Lite scope does not present a finished public TTS/voice feature. | Future feature family requiring separate model/runtime and consent design. |

A public inference API should not be built by simply exposing existing internal functions. The implementation needs a versioned protocol, request limits, authentication, cancellation, streaming semantics, model/session lifecycle, structured errors, and explicit network exposure controls.

### 2.2 Current model path

The current model path is distributed across model stores, download services, model recommendations, model settings/capability utilities, Hugging Face helpers, repositories, and native download specifications. This is a strong base for expansion but should be refactored behind a provider-neutral interface:

```text
ModelProvider
  ├── listModels(query, capabilities)
  ├── getModelMetadata(modelId)
  ├── resolveDownload(modelId)
  ├── verifyChecksum(file, expected)
  ├── install(modelPackage)
  ├── uninstall(modelId)
  └── getRuntimeRequirements(modelId)
```

GGUF support should remain metadata-driven. A model record should include architecture, quantization, context length, tokenizer requirements, optional projector/audio files, supported tasks, license, source URL, checksum, file size, minimum RAM/storage estimate, and runtime compatibility. User-provided or third-party catalog entries must be treated as untrusted data and validated before download/install.

## 3. Future feature A — Local inference API

### 3.1 Recommended architecture

Start with a **localhost-only API** owned by the Android native layer or a small local server bridge. The initial endpoint should be disabled by default and enabled explicitly in Developer Settings. The first contract can be OpenAI-compatible for interoperability, while the internal interface remains provider-neutral:

| Endpoint | Purpose |
|---|---|
| `GET /v1/models` | List installed models and capabilities. |
| `POST /v1/chat/completions` | Stream or return a chat completion. |
| `POST /v1/completions` | Optional legacy text-completion compatibility. |
| `GET /v1/sessions` | List local inference sessions if session sharing is enabled. |
| `POST /v1/sessions` | Create an explicitly scoped session. |
| `DELETE /v1/sessions/:id` | Release context/memory. |
| `GET /healthz` | Report process health without exposing model content. |

The API should bind to `127.0.0.1` by default. LAN binding must require a separate user action, display the listening address, use a generated access token, and show a persistent security warning. There should be no public internet binding option in the first version.

### 3.2 Request lifecycle

```text
HTTP request
  → authentication/rate limit
  → schema validation
  → model capability check
  → session allocation
  → native inference queue
  → cancellation/backpressure
  → SSE/JSON response
  → audit-safe metrics only
```

The inference queue should be serialized or capacity-limited because mobile memory and thermal budgets are finite. Each request needs a cancellation token and maximum prompt/output token budget. The API must reject unsupported features instead of silently ignoring them.

### 3.3 Security requirements

The API must use an unpredictable token, avoid logging prompts or generated content by default, rate-limit requests, enforce maximum body sizes, and expose only installed models. LAN mode should use a short-lived or user-rotatable token. The app must clearly separate local-only requests from remote provider requests in the UI and privacy documentation.

## 4. Future feature B — More GGUF models and model providers

### 4.1 Provider abstraction

Add a registry that can load model providers from built-in descriptors and, later, signed/validated remote catalogs. Each provider should supply model metadata and download manifests rather than arbitrary executable code. A model package can contain:

| Field | Reason |
|---|---|
| Stable model ID | Prevents duplicate installs and supports upgrades. |
| Architecture/task | Determines runtime compatibility. |
| Quantization | Estimates memory/performance and informs recommendations. |
| Context length | Controls session allocation and device feasibility. |
| Files and checksums | Supports atomic download and integrity verification. |
| License/provenance | Required before redistribution or catalog publication. |
| Optional tokenizer/projector/audio files | Required for some model families and multimodal tasks. |
| Minimum RAM/storage | Prevents avoidable OOM and failed downloads. |
| Runtime version | Identifies native backend compatibility. |

### 4.2 Catalog workflow

1. Validate provider metadata against a JSON schema.
2. Resolve files and checksums through HTTPS.
3. Download to a temporary file with resumable ranges.
4. Verify checksum and expected size.
5. Atomically move the model into the managed directory.
6. Run metadata/capability detection before exposing the model in the picker.
7. Store provider, license, version, and checksum in the local database.

Avoid embedding large models in the APK. Models should remain user-selected downloads. This keeps app updates smaller and avoids redistributing files whose licenses may differ from the application license.

## 5. Future feature C — Agents and tools

Agents should be added as a capability-gated orchestration layer, not as unrestricted prompt text. The model must emit structured tool calls validated against registered schemas. Every tool needs a permission class:

| Tool class | Default policy |
|---|---|
| Pure local calculation/formatting | Allow after capability check. |
| Read-only local file/model metadata | Ask once per session or require explicit enablement. |
| Mutating local file/database actions | Confirm every action initially. |
| Network request/search | Disabled by default in offline mode; show destination and permission. |
| External account/payment/publishing action | Never silently execute; require explicit confirmation and secure authentication. |

The agent runtime needs bounded steps, cancellation, context budgeting, loop detection, tool timeouts, structured traces, and a deterministic replay mode for testing. The Lite product should begin with local, read-only tools such as model metadata, calculator, and conversation export before adding network tools.

## 6. Future feature D — Multimodal and VLM support

The existing source tree contains multimodal helpers and capability-detection utilities, but the Lite navigation intentionally removed image/video chat. A future VLM feature should be reintroduced only when the runtime supports the model family reliably on Android. `llama.cpp` documents multimodal support through its multimodal runtime, and `llama.rn` is a React Native binding that has reported support for image/audio-capable workflows [1] [2].

Required work includes:

1. Add model metadata for vision/audio capability and required projector or auxiliary files.
2. Add image capture/import, resizing, orientation normalization, and privacy controls.
3. Keep images out of logs and session exports unless the user explicitly includes them.
4. Enforce image pixel/byte limits before native preprocessing.
5. Add capability-aware prompt templates and reject unsupported model/input combinations.
6. Measure memory overhead of the vision encoder/projector separately from the language model.
7. Add tests for missing projector files, unsupported formats, cancellation, and low-memory behavior.

Do not make every text model appear VLM-capable. Capability detection must be based on metadata and runtime validation.

## 7. Future feature E — Image generation

Image generation is a different workload from chat inference. It may require diffusion models, multiple UNet/text-encoder/VAE components, larger temporary memory, GPU/NNAPI delegates, and long-running background jobs. ONNX Runtime Mobile provides a path for mobile ONNX inference, and ONNX Runtime GenAI targets on-device generative workloads [3] [4]. A MobiGPT image-generation implementation should initially support remote generation or a separate optional native module rather than adding all image runtimes to the base APK.

Recommended phases:

| Phase | Scope |
|---|---|
| 1 | Remote image-generation provider with explicit network consent and output download. |
| 2 | Optional on-device small diffusion model behind a separate feature flag and model download. |
| 3 | Device-specific acceleration and memory/thermal scheduling. |

Generated outputs need gallery/storage permissions, cancellation, progress, content-safety policy, provenance metadata, and an explicit cleanup policy.

## 8. Future feature F — TTS and speech input

For speech input, `whisper.cpp` is a primary local-ASR candidate with Android support listed by its project [5]. For TTS, Piper is a fast local neural TTS system with community Android integration paths [6]. Both should be optional model/runtime families, not mandatory dependencies in the base app.

A staged voice feature could be:

1. System TTS integration with no bundled model.
2. Optional offline Piper voice download with language/voice metadata and license display.
3. Optional local Whisper speech-to-text model with push-to-talk and explicit microphone permission.
4. Streaming partial transcription and interruption-aware generation.
5. Voice conversation mode that composes ASR → chat → TTS with backpressure and cancellation.

The app must show recording state, provide a clear stop action, avoid retaining raw audio by default, and explain whether audio is processed locally or sent to a remote provider.

## 9. Future feature G — Voice cloning

Voice cloning must be treated as a higher-risk feature than ordinary TTS. It requires explicit speaker consent, a clear statement of permitted use, provenance/watermarking strategy where practical, abuse prevention, and a local-only default. The first implementation should not accept arbitrary voice samples for unrestricted cloning. Safer alternatives include a fixed set of licensed voices or user-owned voice profiles with explicit local encryption and deletion controls.

Technical requirements include speaker-embedding storage, model licensing, sample quality checks, inference latency, memory budgets, audio export metadata, and a policy for synthetic impersonation. This feature should remain research-stage until the product has a reviewed safety and consent design.

## 10. API and model roadmap

| Horizon | Deliverable | Acceptance criteria |
|---|---|---|
| Near term | Provider-neutral model metadata and installed-model API | Schema validation, checksums, atomic install, capability-aware picker, no regression in local chat. |
| Near term | Localhost inference API prototype | Auth token, `/v1/models`, streaming chat, cancellation, request limits, no public binding. |
| Medium term | Agent runtime with local read-only tools | Structured tool calls, permissions, step/time limits, traces, deterministic tests. |
| Medium term | Optional VLM/audio model family | Projector/auxiliary files, memory checks, image/audio privacy, capability gating. |
| Medium term | Optional TTS/STT downloads | Permission UX, offline operation, model licensing, cancellation, no raw-audio retention by default. |
| Research | On-device image generation | Separate feature/runtime, model download, thermal/memory scheduling, safe output handling. |
| Research | Voice cloning | Consent, provenance, abuse controls, secure voice profiles, explicit user ownership. |

## 11. Engineering and product risks

| Risk | Mitigation |
|---|---|
| APK size growth | Keep optional runtimes/model assets out of the base APK; use separate native modules and on-demand model downloads. |
| Device OOM/thermal throttling | Use model capability metadata, memory estimates, serialized queues, cancellation, and device-specific recommendations. |
| Native ABI complexity | Keep ABI-specific release builds and test each ABI independently. |
| R8/JNI breakage | Add narrow keep rules only when a validated runtime path requires them; retain mapping outputs. |
| Model licensing | Store provider/license/provenance metadata and require review before catalog publication. |
| Network privacy | Localhost-only API default, explicit LAN enablement, authentication, and no prompt/content logging by default. |
| Agent misuse | Capability gates, confirmation prompts, tool schemas, step limits, and audit-safe traces. |
| Voice impersonation | Consent, licensed voices, provenance, local encryption, and delayed research-stage rollout. |
| API stability | Version the public API and do not expose internal store/repository types directly. |

## 12. Recommended first implementation slice

The highest-value next slice is a **localhost-only OpenAI-compatible inference API** backed by the existing local model manager, plus a provider-neutral model metadata schema. It creates immediate interoperability without requiring a new model runtime. The API should be disabled by default, expose only installed models, support streaming and cancellation, and be tested with a local client on an emulator. After that boundary is stable, agents and additional model families can build on the same capability/session abstractions.

## References

[1]: https://github.com/ggml-org/llama.cpp/blob/master/docs/multimodal.md "llama.cpp multimodal documentation"

[2]: https://github.com/mybigday/llama.rn "llama.rn React Native binding for llama.cpp"

[3]: https://onnxruntime.ai/docs/get-started/with-mobile.html "ONNX Runtime Mobile"

[4]: https://github.com/microsoft/onnxruntime-genai "ONNX Runtime GenAI"

[5]: https://github.com/ggml-org/whisper.cpp "whisper.cpp speech recognition"

[6]: https://github.com/rhasspy/piper "Piper local text-to-speech"

[7]: https://developer.android.com/guide/app-bundle "Android Developers — App Bundles"

[8]: https://developer.android.com/topic/performance/app-optimization/enable-app-optimization "Android Developers — R8 app optimization"
