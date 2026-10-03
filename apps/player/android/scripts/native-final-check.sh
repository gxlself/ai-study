#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../../../.." && pwd)"
export pnpm_config_verify_deps_before_run=false
unset SPROUT_BUNDLED_FIXTURE
LOGS="${SPROUT_NATIVE_FINAL_LOGS:-$ROOT/release/t26-native-final}"
mkdir -p "$LOGS"
cd "$ROOT"

run_step() {
  local name="$1"
  shift
  printf '\n[%s] %s\n' "$(date '+%Y-%m-%d %H:%M:%S %z')" "$name"
  "$@" 2>&1 | tee "$LOGS/$name.log"
}

run_step source-snapshot node apps/player/android/scripts/native-final-metadata.mjs --capture-source
if [[ "${1:-all}" != "build-only" ]]; then
  run_step typecheck pnpm --filter @sprout/player typecheck
  run_step player-tests pnpm --filter @sprout/player test
  run_step native-tests pnpm --filter @sprout/player native:test
fi
run_step player-build pnpm --filter @sprout/player build
run_step android-build pnpm --filter @sprout/player android:all
run_step ios-build pnpm --filter @sprout/player ios:build
run_step native-metadata node apps/player/android/scripts/native-final-metadata.mjs
VERSION="$(node -p 'JSON.parse(require("fs").readFileSync("apps/player/package.json", "utf8")).version')"
cd "$ROOT/release"
run_step apk-checksums shasum -a 256 -c "sprout-player-$VERSION-debug.apk.sha256" -c "sprout-player-$VERSION-release.apk.sha256"
