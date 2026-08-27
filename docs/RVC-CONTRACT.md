# RVC domain and native contract

RVC (Retrieval-based Voice Conversion) is **any-to-one**: the target speaker identity is embedded in the selected model manifest. The application selects a model/profile; it does not ask the engine to synthesize an arbitrary target speaker at conversion time.

The TypeScript definitions in `src/domain/rvc.ts` are the canonical app-facing model. They represent both `speech-to-speech` and `tts-to-rvc` inputs, and make sample rate, model version, F0 method, index mode/rate, chunk duration, execution provider, quantization, memory budget, and latency metrics explicit.

`src/specs/NativeRvc.ts` defines the stable native/JSI method surface: `loadModel`, `unloadModel`, `convertFile`, `startStream`, `pushAudioChunk`, `flush`, `cancel`, `getCapabilities`, and `release`. It discovers the module only through the optional `NativeModules.RvcModule` feature boundary. When that module is not bundled, capabilities report `available: false` with `reason: module-unavailable`; no screen or store needs to import an engine implementation, and existing builds retain their prior behavior.

Configuration validation is deterministic. An `indexRate` greater than zero is valid only when the selected manifest includes an installed index and `indexMode` is not `none`; otherwise validation throws an `RvcContractError` with code `INVALID_CONFIG`. A zero index rate remains valid without an index.

The C++ counterpart is `android/app/src/main/jni/include/pocketpal/rvc_contract.h`. It is an engine-agnostic abstract boundary intended for optional implementations and uses the same lifecycle and conversion concepts as the TypeScript contract.
