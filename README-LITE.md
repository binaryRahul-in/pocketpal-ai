# MobiGPT

MobiGPT is a reduced Android-first fork of [PocketPal AI](https://github.com/a-ghorbani/pocketpal-ai). It keeps local GGUF/llama.cpp chat, model management, model recommendations, hardware information, conversation history, and offline operation after models are downloaded. Optional product surfaces removed from the Lite scope include active Pals/personas, video/image chat, voice setup, and other remote product surfaces.

## Compatibility identity

MobiGPT is a **user-visible rebrand only**. The Android application ID remains `com.pocketpallite`, the native namespace remains `com.pocketpal`, and the React Native registration key remains `PocketPal`. These identifiers must not be changed casually because doing so would create a new Android application and can break upgrades or startup registration. The visible launcher label and display name are `MobiGPT`.

## What the app does

The app provides local text chat with downloaded models, a model catalog and settings screen, a hardware information screen, deterministic model recommendations, local chat-session history, and offline inference after a model has been downloaded. Model files are not bundled into the APK. They are downloaded and managed by the existing model manager, with progress, cancellation, integrity checks, deletion, and model settings.

Recommendations are estimates. They reserve conservative memory and storage headroom but cannot guarantee that a model will be fast or usable on every phone. A model marked **Not recommended** can still be opened manually if the user accepts the risk.

## Repository layout

| Path | Role |
|---|---|
| `App.tsx` | Reduced React Native root providers, navigation container, drawer, and retained product surfaces. |
| `index.js` | React Native entrypoint. It registers the internal component name `PocketPal`; this is intentionally not renamed to MobiGPT. |
| `src/screens/` | Chat, models, hardware, settings, benchmark, onboarding, and about screens. |
| `src/components/` | Chat UI, model picker, settings sheets, sidebar, overlays, and reusable presentation components. |
| `src/hooks/` | Deep-linking, model loading, memory checks, theme, storage, and other lifecycle logic. |
| `src/services/` | Model recommendations, downloads, local inference integration, catalog access, persistence helpers, and feature services. |
| `src/stores/` and `src/repositories/` | MobX/state and database/repository boundaries for models, chats, sessions, and settings. |
| `android/` | Native Android wrapper, Gradle build, CMake/JNI hardware module, resources, workers, and release configuration. |
| `.github/workflows/` | Manual debug build, optimized release matrix, focused validation, and upstream CI workflows. |
| `report.md` | Developer-facing repository architecture, file map, and modification ledger. |
| `fut_support.md` | Research and roadmap for APIs, models, agents, multimodality, image generation, TTS, and voice cloning. |

## Requirements

Use Node.js `>=22.21.0`, Yarn, JDK 17, Android SDK Platform 36, Build Tools 36.0.0, NDK `27.3.13750724`, CMake 3.22.1, and the Android Gradle wrapper checked into the repository. The project depends on native llama.cpp and Android modules; Expo Go is not supported.

## Install dependencies

```bash
git clone <your-fork-url> mobigpt
cd mobigpt
corepack enable
yarn install
```

## Local build commands

The normal development build remains the universal, unshrunk debug variant:

```bash
yarn build:android
```

For an optimized release build for one ABI:

```bash
cd android
./gradlew assembleProdRelease -PtargetAbi=arm64-v8a
./gradlew assembleProdRelease -PtargetAbi=x86_64
```

The `targetAbi` property is optional. When omitted, the Gradle configuration retains both supported ABIs for development/universal builds. Release builds enable R8 code shrinking and resource shrinking. Test every optimized release build before distribution because React Native, Hermes, JNI, reflection, and native model runtimes may need targeted keep rules.

A release-style AAB can be built with:

```bash
cd android
./gradlew bundleProdRelease
```

A signed store artifact requires an approved keystore and release credentials. Never commit a keystore, passwords, API keys, model files, or Hugging Face tokens.

## GitHub Actions

| Workflow | Trigger | Output |
|---|---|---|
| `MobiGPT Debug APK` | Manual `workflow_dispatch` only | `MobiGPT-debug-universal.apk`, an unshrunk development APK. |
| `MobiGPT Release APKs` | `mobigpt-v*` tag or manual dispatch | Optimized `MobiGPT-release-arm64-v8a.apk`, `MobiGPT-release-x86_64.apk`, release AAB, checksums, R8 mapping outputs, and bundletool inspection artifacts. |
| `MobiGPT Checks` | Focused validation workflow | TypeScript, ESLint, localization/font checks, and Lite-focused tests. |

Debug builds are intentionally manual so ordinary pushes do not produce large artifacts. Release builds use a matrix with one ABI per APK. The workflow also creates device-specific APK sets from the AAB with bundletool to approximate Play-style delivery and reports their sizes.

Without protected production signing secrets, CI release artifacts are test-signed and are not Google Play production artifacts. The release workflow must not be used to imply official store signing.

## Install on a phone

For an ABI-matching release APK or the universal debug APK:

```bash
adb install -r MobiGPT-release-arm64-v8a.apk
```

The application ID is still `com.pocketpallite`, so Android treats it as the same application identity as the prior Lite build. The visible application label is MobiGPT.

## Troubleshooting React Native startup

If Android reports that `PocketPal` has not been registered, verify that `app.json` still contains:

```json
{"name":"PocketPal","displayName":"MobiGPT"}
```

The `name` field is the internal React Native registration key and must match `MainActivity.getMainComponentName()`. `displayName` and the Android `app_name` resource are the user-visible branding fields.

If Metro is used for a debug build, stop any stale Metro process, run it from the repository root, clear its cache, and rebuild/reload. Release APKs bundle JavaScript and should not depend on a separately running Metro server.

## Focused verification commands

```bash
yarn typecheck
yarn lint
yarn jest src/services/modelRecommendations.test.ts --runInBand --coverage=false
```

The full upstream Jest suite contains tests for features intentionally removed from the Lite scope. Use the focused workflow as the baseline for this fork and document any upstream tests that assert removed behavior.

## Branding asset

The MobiGPT launcher icon is derived from the user-supplied GitHub avatar at `https://avatars.githubusercontent.com/u/166840758?v=4`. The source and compatibility note are recorded in `assets/branding-source.md`. Confirm permission to distribute the portrait as an application icon before public release.

## Attribution

This project is derived from [a-ghorbani/pocketpal-ai](https://github.com/a-ghorbani/pocketpal-ai), with Lite changes and MobiGPT user-visible branding. Retained open-source components and licenses remain documented in the upstream repository and existing license files.
