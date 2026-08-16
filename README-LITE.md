# PocketPal Lite

PocketPal Lite is a reduced Android fork of [PocketPal AI](https://github.com/a-ghorbani/pocketpal-ai). It keeps the local GGUF/llama.cpp chat experience and the existing PocketPal-style conversation UI, while removing the active Pals/personas, video/image chat, voice setup, and other optional product surfaces from the main navigation.

## What the app does

The app provides local text chat with downloaded models, a model catalog and settings screen, a hardware information screen, deterministic model recommendations, the existing benchmark/device-information screen, local chat-session history, and offline operation after a model has been downloaded. The Hardware screen uses the existing PocketPal model manager for downloads, progress, cancellation, integrity checks, deletion, and model settings.

Recommendations are estimates. They reserve conservative memory and storage headroom, but they cannot guarantee that a model will be fast or usable on every phone. A model marked **Not recommended** can still be opened manually from Models if the user understands the risk.

## Repository layout

| Path                                        | Purpose                                                                |
| ------------------------------------------- | ---------------------------------------------------------------------- |
| `App.tsx`                                   | Reduced root providers and drawer navigation.                          |
| `src/screens/HardwareScreen/`               | Device facts, recommendation cards, and download actions.              |
| `src/services/modelRecommendations.ts`      | Deterministic recommendation and formatting logic.                     |
| `src/services/modelRecommendations.test.ts` | Focused unit tests for recommendation behavior.                        |
| `src/components/ChatView/ChatView.tsx`      | Retained PocketPal chat UI with Pal-specific active rendering removed. |
| `src/components/ChatPalModelPickerSheet/`   | Simplified model-only picker sheet.                                    |
| `CHANGELOG-LITE.md`                         | Exact active-surface changes, removed features, and validation notes.  |

## Requirements

Use a current Node.js version that satisfies the upstream package declaration, currently `>=22.21.0`. Install Android Studio with an Android SDK matching the project’s compile/target SDK, an Android NDK matching `27.3.13750724`, Android build tools matching `36.0.0`, and a supported JDK. Set `ANDROID_HOME` or `ANDROID_SDK_ROOT`, ensure `adb` is on `PATH`, and enable USB debugging on a physical phone for installation.

The project uses Yarn and the existing React Native Android build. Do not use Expo Go: the app depends on native llama.cpp and Android modules.

## Install dependencies

```bash
git clone <your-fork-url> pocketpal-lite
cd pocketpal-lite
corepack enable
yarn install
```

If the local Node version is below the declared engine, upgrade Node rather than relying on `--ignore-engines`. The sandbox used `yarn install --ignore-engines --ignore-scripts` only because it had Node `22.13.0`; it is not the preferred development setup.

## Build the Android APK

For the reduced production-debug APK, run:

```bash
yarn build:android
```

The expected output is under:

```text
android/app/build/outputs/apk/prodDebug/
```

For a release-style build:

```bash
yarn build:android:release
```

A signed store artifact requires your own keystore and release credentials. Never commit a keystore, passwords, Hugging Face tokens, or model files to the repository.

## Install on a phone

With a connected Android device visible in `adb devices`, install the APK using:

```bash
adb install -r android/app/build/outputs/apk/prodDebug/app-prod-debug.apk
```

If Android blocks the installation, enable installation from the relevant file manager or authorize the computer on the phone. The Lite package is `com.pocketpallite`, so it can coexist with the upstream `com.pocketpalai` application.

## Use the app

Open **Hardware** to review the device profile and model recommendations. Use **Download in app** on a recommended entry or open **Models** to search and inspect the catalog. Downloads are stored in the app-controlled model directory and are not bundled in the APK. After the download is complete, select the model from the model picker in Chat and begin local generation.

The only network operations in the reduced product are catalog/model metadata requests and user-requested model downloads. After a model is present, chat-session history and inference are designed to work without network access. Model files may have separate licenses; review the provider and license link shown in the model details before use or redistribution.

## GitHub Actions APK build

The repository includes `.github/workflows/pocketpal-lite-android.yml`. It builds the `prodDebug` Android variant on pushes to `main`, relevant pull requests, and manual `workflow_dispatch` runs. The workflow installs Node.js `22.21.0`, JDK 17, Android SDK Platform 36, Build Tools `36.0.0`, NDK `27.3.13750724`, and CMake `3.22.1`. It runs `yarn install --frozen-lockfile`, applies the checked-in Gradle compatibility patch through the postinstall script, creates CI-only placeholder configuration files, and uploads `app-prod-debug.apk` as the artifact `pocketpal-lite-prodDebug-apk`.

To use it, push this repository to GitHub, open the **Actions** tab, select **PocketPal Lite Android APK**, and choose **Run workflow** if you want to start it manually. After the job succeeds, open the workflow run and download the `pocketpal-lite-prodDebug-apk` artifact. The workflow checks out the complete Git history with `fetch-depth: 0`, but the APK build itself does not require repository secrets because it uses CI-only placeholder configuration and the debug signing key.

## Verification commands

```bash
yarn --ignore-engines typecheck
yarn --ignore-engines lint
yarn --ignore-engines jest src/services/modelRecommendations.test.ts --runInBand --coverage=false
```

The full upstream Jest command enforces global coverage thresholds and is not equivalent to the focused recommendation test command. Run the full suite in a correctly provisioned development environment before publishing a release.

## Sandbox build note

The isolated build environment successfully installed dependencies, passed TypeScript validation, passed the focused recommendation tests, and reached Android Gradle configuration. The project includes `patches/@react-native+gradle-plugin+0.82.1.patch`, which updates the React Native Gradle plugin’s foojay resolver from `0.5.0` to `1.0.0` for Gradle 9 compatibility. The remaining sandbox blocker is that no Android SDK is installed:

```text
SDK location not found. Define a valid SDK location with an ANDROID_HOME environment variable
```

This is an environment limitation, not an application-code failure. On a development machine, install the Android SDK/NDK requirements, set `ANDROID_HOME` or `ANDROID_SDK_ROOT`, and retry after `cd android && ./gradlew --stop && ./gradlew clean`. The postinstall script applies the patch automatically after `yarn install`.

## Attribution

This project is derived from [a-ghorbani/pocketpal-ai](https://github.com/a-ghorbani/pocketpal-ai), baseline commit `505ac4b717b015c7f909120f99ee6fdb082b6793`. Retained open-source components and their licenses are documented in the upstream repository and in the project’s existing license files.
