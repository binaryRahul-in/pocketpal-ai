# Android ONNX Runtime packaging and provider spike

This is an **Android-only proof of concept**. It does not change the React Native UI, add a JavaScript API, or bundle a production model. `OrtAndroidSpikeTest` exercises the supported `onnxruntime-android` Java API from an instrumentation test. The test writes a minimal ONNX `ModelProto` into the app-private files directory at runtime, loads it through CPU execution, runs `3.5 -> 3.5`, enumerates providers, and closes the tensor, result, session, and environment-owned resources through the Java API.

## Dependency and integration boundary

The app declares `com.microsoft.onnxruntime:onnxruntime-android:1.24.3`, matching the resolved `onnxruntime-react-native` 1.24.3 family in `yarn.lock`. The existing React Native patch remains unchanged: it applies Android 15 16 KB page alignment to the React Native module’s native target. The spike uses the app’s existing external CMake project only indirectly; no new C++ target, ABI filter, or JavaScript registration is introduced.

The app’s ABI selector remains authoritative. Without `-PtargetAbi`, debug and release variants retain `arm64-v8a` and `x86_64`; with `-PtargetAbi=arm64-v8a` or `-PtargetAbi=x86_64`, Gradle emits a single-ABI artifact. This keeps the spike aligned with the release workflow and avoids silently widening the shipped ABI matrix.

## Smoke commands

From the repository root:

```bash
# Build one ABI and print APK bytes plus packaged native libraries.
./scripts/android-ort-spike.sh debug arm64-v8a
./scripts/android-ort-spike.sh debug x86_64
./scripts/android-ort-spike.sh release arm64-v8a
./scripts/android-ort-spike.sh release x86_64

# Install/run the deterministic instrumentation test on a matching device.
cd android
./gradlew connectedProdDebugAndroidTest -PtargetAbi=arm64-v8a
./gradlew connectedProdReleaseAndroidTest -PtargetAbi=arm64-v8a
```

The test report is written to the target package’s private files directory as `ort-spike-report.txt` and is also emitted under the `OrtAndroidSpike` log tag. A device/emulator must match the selected ABI. Optional XNNPACK and NNAPI providers are informational: their availability is recorded, while session creation deliberately uses the default CPU path so an unavailable optional provider cannot crash the smoke test.

## Measurement record

The following table is intentionally a checked-in record format rather than guessed numbers. Populate the result cells from the commands above and CI artifacts; no model binary or credentials belong in this repository.

| Measurement | arm64-v8a | x86_64 | Method |
| --- | ---: | ---: | --- |
| ORT Android dependency | 1.24.3 | 1.24.3 | Gradle dependency resolution |
| Debug APK bytes | pending device/build | pending device/build | `stat -c %s`; unavailable locally because the sandbox has no Android SDK |
| Release APK bytes | pending device/build | pending device/build | `stat -c %s`; unavailable locally because the sandbox has no Android SDK |
| ORT native libraries | 25,831,632 + 111,976 bytes | 31,316,520 + 100,424 bytes | Pinned AAR entries: `libonnxruntime.so` + `libonnxruntime4j_jni.so`; verify final APK with `zipinfo` |
| Startup + one inference | pending device run | pending device run | `ort-spike-report.txt`; requires a connected ABI-matched device |
| CPU inference | pending | pending | Instrumentation assertion `3.5f == 3.5f` |
| XNNPACK discovered | pending | pending | `providers` in report |
| NNAPI discovered | pending | pending | `providers` in report |
| Failure/fallback behavior | CPU fallback expected | CPU fallback expected | Test must remain green when optional providers are absent |

## R8 and native compatibility

No additional R8 keep rule was added for the spike. The existing app-scoped keep rules and the ONNX Runtime Android artifact’s own consumer rules are used first. If a release instrumentation run demonstrates a reflection/shrinker failure, add only the smallest rule required by that failure and record the evidence here. The existing CMake configuration and 16 KB page-alignment patch are not broadened by this spike.

## Acceptance evidence

A successful arm64-v8a instrumentation run proves deterministic CPU inference and provider discovery without requiring a committed model. The two ABI-specific builds prove that the existing Gradle selector still emits the requested native-library set. Release and debug APK byte counts, provider output, and elapsed time must be copied from the generated artifacts or device report into the table before using this document as a final benchmark.
