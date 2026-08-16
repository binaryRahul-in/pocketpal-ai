# PocketPal Lite change log

## 0.1.0 — reduced Android build

### Baseline

This fork starts from upstream commit `505ac4b717b015c7f909120f99ee6fdb082b6793` of [a-ghorbani/pocketpal-ai](https://github.com/a-ghorbani/pocketpal-ai). The upstream MIT license and attribution files remain in the repository.

### Added

The fork adds a dedicated **Hardware & recommendations** screen at `src/screens/HardwareScreen/HardwareScreen.tsx`. It reports non-sensitive device facts including brand/model, Android/API level, supported ABIs, CPU cores, total memory, free storage, chipset, GPU information when available, and accelerator status when detectable. It deliberately does not display IMEI, serial number, advertising ID, or other exact device identifiers.

The fork adds `src/services/modelRecommendations.ts`, which applies deterministic, conservative heuristics to the model metadata already maintained by PocketPal. It reserves memory and storage headroom, labels models **Likely to run**, **May run slowly**, or **Not recommended**, and explains the label. Focused unit coverage lives in `src/services/modelRecommendations.test.ts`.

The Hardware screen links directly to the existing PocketPal model manager. A not-yet-installed recommended model uses `modelStore.checkSpaceAndDownload`, while an installed model opens the existing Models screen for settings and management. The upstream model manager continues to provide progress, cancellation, integrity checking, deletion, and model configuration.

### Changed

The root navigation in `App.tsx` now exposes Chat, Models, Hardware, Benchmark, Settings, About, and debug-only developer tools. The Pals route and Pals header were removed from the active drawer. The Android app is branded **PocketPal Lite** and uses the distinct application ID `com.pocketpallite` so it can be installed beside the upstream package.

The chat screen and chat view were reduced to local text chat. The active chat path no longer resolves a Pal, opens a Pal sheet, shows video-Pal branches, displays Pal greetings or suggested prompts, or shows the Pal-load hint. The model selector remains available through a simplified model-only bottom sheet, and the existing PocketPal message layout, streaming controls, reasoning toggle, context management, model errors, drafts, and chat-session history are retained.

The generation-settings sheet now exposes one local/custom settings path without a Pal-vs-custom segmented control. Generic chat-prefill deep links remain supported, while Pal and marketplace deep links are no longer resolved or parked by the active deep-link hook.

Image upload and vision controls are disabled in the active chat entrypoint. TTS initialization and the global TTS setup sheet were removed from the root runtime. The benchmark screen remains available because it contains useful device/runtime information and performance settings, as requested.

### Removed from the active product surface

The following features were removed from navigation or active runtime wiring: Pals/personas, Pal selection in chat, Pal settings sheets, video-Pal rendering, Pal greetings and suggested prompts, Pal-load hint notifications, voice setup initialization, image upload controls, and vision controls.

The upstream repository still contains some dormant Pal, voice, vision, and server-related source files and dependencies because they are referenced by upstream stores, tests, migration code, or optional screens. They are not reachable from the reduced root navigation. A later hard-delete pass can remove those dormant files after deciding whether existing chat-history migrations and upstream tests must remain supported.

### Validation

- `yarn install --ignore-engines --ignore-scripts`: completed. The sandbox Node version is `22.13.0`, while the upstream package declares `>=22.21.0`; the engine guard was bypassed only for this environment.
- `yarn --ignore-engines typecheck`: passed after the fork changes.
- `yarn --ignore-engines lint`: no lint errors; existing and newly introduced non-blocking warnings remain.
- `yarn --ignore-engines jest src/services/modelRecommendations.test.ts --runInBand --coverage=false`: passed, 4 tests.
- Baseline Android Gradle build: the reproducible `patches/@react-native+gradle-plugin+0.82.1.patch` resolved the `JvmVendorSpec IBM_SEMERU` compatibility error and allowed Gradle configuration to proceed. The build then stopped because the sandbox has no Android SDK (`SDK location not found`). See `README-LITE.md` for setup instructions.
