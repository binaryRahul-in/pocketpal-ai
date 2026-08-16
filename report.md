# MobiGPT Repository Developer Report

## 1. Purpose and scope

MobiGPT is a user-visible rebrand of the reduced PocketPal Lite fork. The application remains a React Native mobile app with native Android inference and model-management capabilities. The current product scope emphasizes local GGUF/llama.cpp chat, model discovery and downloading, device/hardware information, model recommendations, settings, chat-session history, and offline operation after model files are present.

The rebrand deliberately changes the visible product name to **MobiGPT** without changing the Android application identity. The following identifiers are compatibility-sensitive and remain unchanged:

| Identifier | Current value | Why it remains unchanged |
|---|---|---|
| React Native registration name | `PocketPal` | `index.js` registers this name and Android `MainActivity` requests it. Changing only the display name avoids the “has not been registered” startup failure. |
| Android application ID | `com.pocketpallite` | Preserves upgrade/install identity for existing Lite builds. |
| Android namespace | `com.pocketpal` | Preserves generated/native references and package structure. |
| Java/Kotlin package paths | Existing `com.pocketpalai` paths where present | Avoids an unnecessary package migration. |
| Visible display name | `MobiGPT` | User-facing branding. |
| Launcher label | `MobiGPT` | User-facing Android branding. |

## 2. Architecture overview

The application is organized as a React Native frontend over a native Android wrapper. React Native owns navigation, presentation, localization, model catalog screens, model selection, chat-session UI, and orchestration of user actions. Android owns the Gradle build, JNI/CMake hardware integration, download worker, native libraries, application packaging, and ABI-specific release outputs.

```text
React Native entrypoint
  └── index.js
      └── App.tsx
          ├── Providers and localization
          ├── Navigation and drawer
          ├── Models and Hardware screens
          ├── Chat and model picker
          ├── Settings/About/Benchmark surfaces
          └── Stores, repositories, hooks, and services

Android wrapper
  ├── MainActivity and React Native host
  ├── Gradle build types/flavors and ABI selector
  ├── CMake/JNI hardware module
  ├── Download worker and persistence dependencies
  ├── Native llama.cpp/ONNX/Hermes/React Native libraries
  └── GitHub Actions APK/AAB release workflows
```

The main data path is: catalog/model metadata is displayed by React Native; the user selects a model or downloads it; the model manager stores and validates the model; the chat UI selects the local model; the native inference bridge performs generation; and the session/repository layer persists conversations and settings.

## 3. Root files and configuration

| File or directory | Responsibility | Modification status |
|---|---|---|
| `App.tsx` | Root providers, navigation container, drawer entries, overlays, and retained application surfaces. | Lite-reduced frontend; visible branding changes should remain display-only. |
| `index.js` | React Native entrypoint and `AppRegistry.registerComponent`. | Internal registration remains `PocketPal`; do not rename to MobiGPT. |
| `app.json` | React Native application metadata. | `name` remains `PocketPal`; `displayName` is `MobiGPT`. |
| `package.json` | JavaScript dependencies, build/test scripts, version, and Node engine. | Preserve package identity; add or update only user-facing scripts/metadata when needed. |
| `yarn.lock` | Locked JavaScript dependency graph. | Must be kept in sync with dependency changes. |
| `babel.config.js` | Babel transpilation configuration. | Build infrastructure; no product logic. |
| `metro.config.js` | React Native Metro bundler configuration. | Debug bundling and asset resolution. |
| `react-native.config.js` | React Native native asset/link configuration. | Used by native asset integration, including fonts. |
| `tsconfig.json` | TypeScript compiler configuration. | Static type-checking boundary. |
| `.eslintrc.js` | ESLint rules and project lint configuration. | CI quality gate. |
| `.prettierrc.js` | Formatting defaults. | Formatting consistency. |
| `jest.config.js` | Jest transforms, module mappings, coverage, and test setup. | Test infrastructure. |
| `jest/` | Shared fixtures and test setup files. | Test infrastructure and mocks. |
| `__mocks__/` | Native/external module mocks used by Jest. | Keeps unit tests independent of device runtime. |
| `__tests__/` | Root-level application and persistence tests. | Some upstream tests assert removed features; Lite CI uses focused coverage where appropriate. |
| `.env.example` | Example environment variable names. | Never put real credentials in this file. |
| `.gitignore` | Excludes generated/build/credential files. | Must continue excluding keystores, APKs, model files, and local configuration. |
| `LICENSE` | Repository licensing terms. | Must remain present and respected. |
| `README.md` | Upstream/general project documentation. | Update user-visible fork references only where appropriate. |
| `README-LITE.md` | MobiGPT user/developer quick-start documentation. | Rewritten for MobiGPT branding and optimized release workflows. |
| `CHANGELOG-LITE.md` | Lite feature/removal history. | Update with MobiGPT/release changes. |
| `CONTRIBUTING.md` | Contribution instructions. | Add MobiGPT branch and validation expectations if needed. |
| `CODE_OF_CONDUCT.md` | Community behavior policy. | Template/policy; no runtime role. |
| `docs/` | Project notes, getting-started material, and baseline audit. | `report.md` is the primary developer map; keep baseline evidence in `docs/BASELINE-AUDIT.md`. |
| `assets/` | Onboarding/tutorial images and branding assets. | Contains the supplied avatar source and attribution note for the MobiGPT icon. |
| `patches/` | Yarn patch-package patches for third-party dependencies. | Includes the Gradle plugin compatibility patch required by the current toolchain. |
| `scripts/` | Postinstall, localization validation, font verification, and sync helpers. | CI calls validation scripts; postinstall must remain deterministic. |
| `fastlane/` | Release automation definitions for platform distribution. | Store credentials must remain external and protected. |
| `.bundle/` and `Gemfile*` | Ruby/Bundler configuration for Fastlane and iOS tooling. | Build tooling; not user-facing product code. |
| `.husky/` and `commitlint.config.js` | Commit hooks and commit-message conventions. | Developer workflow only. |
| `.vscode/` and `.watchmanconfig` | Editor and file-watcher preferences. | Local developer convenience. |
| `.version` | Project/version marker used by release tooling. | Update only with intentional release versioning. |

## 4. Frontend structure

### 4.1 Navigation and screens

`App.tsx` composes the root providers and registers the navigation tree. The Lite branch retains chat, models, hardware, benchmark/device information, settings, and about screens while removing optional product surfaces from the main navigation.

| Path | Responsibility |
|---|---|
| `src/screens/ChatScreen/` | Chat route, input, generation lifecycle, model selection, and session interaction. |
| `src/screens/ModelsScreen/` | Model catalog, downloaded models, search, model details, loading, and deletion actions. |
| `src/screens/HardwareScreen/` | Device facts, conservative model recommendations, and model-management actions. |
| `src/screens/SettingsScreen/` | User preferences, runtime settings, and storage/configuration controls. |
| `src/screens/BenchmarkScreen/` | Retained benchmark/device-information surface where still exposed by the Lite scope. |
| `src/screens/OnboardingScreens/` | Initial setup and first-run experience. |
| `src/screens/AboutScreen/` | About, attribution, licenses, and visible product information. |
| `src/screens/DevToolsScreen/` | Debug-only development tools. |
| `src/screens/index.ts` | Screen exports and route-facing module boundary. |

### 4.2 Reusable components

| Path | Responsibility |
|---|---|
| `src/components/ChatView/` | Message list, generation state, input interactions, and retained local-chat rendering. |
| `src/components/ChatPalModelPickerSheet/` | Simplified model picker sheet; Pal-specific behavior is reduced in Lite. |
| `src/components/ChatGenerationSettingsSheet/` | Generation parameters and runtime controls. |
| `src/components/SidebarContent/` | Drawer/sidebar navigation and app-level actions. |
| `src/components/DownloadOverlay/` and related overlays | Download progress and blocking/feedback UI. |
| `src/components/` remaining folders | Shared buttons, dialogs, cards, models, settings, markdown, keyboard, and theme-aware presentation primitives. |

### 4.3 Hooks and services

| Path | Responsibility |
|---|---|
| `src/hooks/useDeepLinking.ts` | Deep-link lifecycle and route handling. Internal URL compatibility should be changed only with explicit product requirements. |
| `src/hooks/` remaining hooks | Model loading, storage/memory checks, theme, messages, session lifecycle, and UI state. |
| `src/services/modelRecommendations.ts` | Deterministic device/model recommendation logic. |
| `src/services/downloads/` | Model download management, progress, cancellation, integrity, and storage operations. |
| `src/services/` remaining files | Catalog metadata, local inference integration, authentication/remote services retained by upstream, search, session support, and domain utilities. |
| `src/store/` or `src/stores/` | MobX/application state for models, chats, settings, localization, and runtime status. |
| `src/repositories/` | Persistence and database boundaries for models, sessions, chats, and related records. |
| `src/locales/` | Translation resources and localization tests. |
| `src/api/` | HTTP/remote API helpers that remain in the upstream-derived codebase; see `fut_support.md` for the current inference-API audit. |

## 5. Android native wrapper

| Path | Responsibility | Modification status |
|---|---|---|
| `android/settings.gradle` | Gradle settings and React Native plugin inclusion. | Keep root/native identifiers stable. |
| `android/build.gradle` | Root Android build versions: compile SDK, target SDK, NDK, Kotlin, and plugin dependencies. | Toolchain baseline for CI. |
| `android/app/build.gradle` | Application ID, variants, signing, ABI filters, R8/resource shrinking, native build, and dependencies. | Adds `targetAbi` selection and release-only shrinking; preserves `com.pocketpallite` and unshrunk debug. |
| `android/app/proguard-rules.pro` | Project-specific R8/ProGuard rules. | Keep rules must remain narrow and evidence-driven. |
| `android/app/src/main/java/.../MainActivity.kt` | React Native Android host and internal main component name. | Keep `PocketPal` registration name. |
| `android/app/src/main/jni/` | CMake/JNI hardware integration and native bridge support. | Native wrapper feature around the React Native frontend. |
| `android/app/src/main/res/values/strings.xml` | Android-visible labels. | `app_name` becomes `MobiGPT`. |
| `android/app/src/main/res/mipmap-*` | Legacy launcher icon density resources. | Replaced with the supplied MobiGPT avatar while retaining filenames. |
| `android/app/src/main/AndroidManifest.xml` | Android components, permissions, labels, icon references, and deep links. | Keep package and internal component identities stable; visible label points to MobiGPT. |
| `android/app/src/main/.../download/DownloadWorker.kt` | Background model download worker. | Retained native support for model management. |
| `android/gradle/` and `gradlew*` | Gradle wrapper and reproducible build entrypoint. | CI uses the checked-in wrapper; local/CI builds must use the pinned versions. |
| `android/app/debug.keystore` | Development/test signing key. | Never use it as a production Play signing identity. |

## 6. iOS and E2E areas

The `ios/` directory contains the iOS workspace, Podfile, native bridge/header files, asset link manifest, and platform project sources. Visible display-name updates may be applied to iOS configuration, but bundle identifiers, schemes, native targets, and internal registration remain unchanged for the same compatibility reason.

The `e2e/` directory contains Appium/WebDriverIO configuration, AWS Device Farm test specifications, device pools, local configuration, and test package metadata. It is a test harness rather than product runtime code. Paths containing `PocketPal.app` or similar native artifacts are technical build paths and should not be renamed merely for visible branding.

## 7. CI and release workflow structure

| Workflow | Purpose |
|---|---|
| `.github/workflows/pocketpal-lite-android.yml` | Now the manually triggered **MobiGPT Debug APK** workflow. Builds unshrunk universal `prodDebug` and uploads `MobiGPT-debug-universal.apk`. |
| `.github/workflows/mobigpt-release-android.yml` | Optimized release matrix for ARM64 and x86_64 APKs, release AAB, bundletool inspection, checksums, mapping outputs, and optional prerelease publication. |
| `.github/workflows/pocketpal-lite-checks.yml` | Focused typecheck, lint, and Lite tests. |
| `.github/workflows/ci.yml` | Upstream-derived broader CI. Some tests assert features removed from Lite and must be interpreted accordingly. |
| `.github/workflows/e2e-tests.yml` | E2E/device-farm workflow. |
| `.github/workflows/release.yml` | Upstream release automation; do not let it silently publish a MobiGPT build without explicit review. |
| `.github/workflows/l10n-upload.yml` | Localization synchronization. |

The release workflow intentionally separates raw APK size, artifact archive size, and bundletool device-specific download size. These measurements are not interchangeable.

## 8. Modification ledger

| Area | Change | Compatibility impact |
|---|---|---|
| Lite scope | Removed optional Pals/personas, video/image chat, voice setup, and other optional surfaces from primary navigation. | Product-scope reduction; retained local chat/model flow. |
| Registration fix | Restored `app.json.name` to `PocketPal` after the Lite rebrand caused a mismatch with Android `MainActivity`. | Prevents React Native startup failure. |
| Visible branding | Changed display name, launcher label, documentation, workflow names, artifact names, and icon resources to MobiGPT. | User-visible only. |
| Package identity | Preserved `com.pocketpallite` and native package/namespace values. | Supports upgrade compatibility. |
| ABI selection | Added optional `-PtargetAbi=...`. | Enables separate release APKs without duplicating source or changing package identity. |
| Release optimization | Enabled release-only R8 code shrinking, resource shrinking, and optimized ProGuard baseline. | Smaller release binaries; requires CI/runtime validation and targeted keep rules. |
| Debug workflow | Made debug APK generation manual-only and retained unshrunk `prodDebug`. | Keeps development diagnostics and avoids unnecessary CI artifacts. |
| Release workflow | Added ARM64/x86_64 matrix, AAB, bundletool device specs, checksums, mapping outputs, and explicit release publication. | Reproducible release evidence; signing remains external/protected. |
| Documentation | Added `report.md`, `fut_support.md`, branding source note, and updated Lite README. | Improves maintenance and future feature planning. |

## 9. Build and release procedure

For development, use `yarn install`, `yarn typecheck`, `yarn lint`, and the focused model-recommendation tests. The debug workflow is launched manually from GitHub Actions.

For a release, trigger `MobiGPT Release APKs` manually or push a `mobigpt-v*` tag. The workflow first validates JavaScript, then builds one optimized `prodRelease` APK per ABI, then builds and inspects the release AAB with bundletool. Publication is explicit and prerelease-oriented unless the repository’s signing and release policy is changed deliberately.

Release signing credentials must be stored as protected repository secrets. No keystores, passwords, model files, or API keys belong in Git. Test-signed artifacts must be labeled as test builds and must not be represented as Google Play production packages.

## 10. Security, privacy, and licensing

Model files may have separate licenses from the application. Store provider URLs, licenses, checksums, and provenance with model metadata. Treat downloaded model files as untrusted data and validate checksums before use. Keep authentication/API settings out of source and logs. A future local inference server must bind to localhost by default and require explicit authentication and LAN exposure settings.

The supplied avatar is a personal portrait. Before distributing MobiGPT publicly, confirm permission to use it as an application icon. The source URL and saved asset are recorded in `assets/branding-source.md`.

## References

[1]: https://github.com/a-ghorbani/pocketpal-ai "Upstream PocketPal AI repository"
[2]: https://developer.android.com/guide/app-bundle "Android Developers — About Android App Bundles"
[3]: https://developer.android.com/topic/performance/app-optimization/enable-app-optimization "Android Developers — Enable app optimization with R8"
[4]: https://developer.android.com/tools/bundletool "Android Developers — bundletool"
[5]: https://github.com/google/bundletool/releases "Google bundletool releases"
