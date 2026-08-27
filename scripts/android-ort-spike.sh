#!/usr/bin/env bash
set -euo pipefail

# Build and inspect the Android-only ORT spike. No model is bundled; the
# instrumentation test generates its tiny fixture in app-private storage.
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BUILD_TYPE="${1:-debug}"
ABI="${2:-arm64-v8a}"

case "$BUILD_TYPE" in
  debug) TASK="assembleProdDebug"; APK="$ROOT_DIR/android/app/build/outputs/apk/prod/debug/app-prod-debug.apk" ;;
  release) TASK="assembleProdRelease"; APK="$ROOT_DIR/android/app/build/outputs/apk/prod/release/app-prod-release.apk" ;;
  *) echo "usage: $0 debug|release [arm64-v8a|x86_64]" >&2; exit 2 ;;
esac

cd "$ROOT_DIR/android"
./gradlew "$TASK" "-PtargetAbi=$ABI"

if [[ ! -s "$APK" ]]; then
  echo "APK not found: $APK" >&2
  exit 1
fi

printf 'artifact=%s\nabi=%s\nbytes=%s\n' "$APK" "$ABI" "$(stat -c '%s' "$APK")"
if command -v zipinfo >/dev/null 2>&1; then
  echo 'native-libraries:'
  zipinfo -1 "$APK" | grep '^lib/' | sort || true
fi
