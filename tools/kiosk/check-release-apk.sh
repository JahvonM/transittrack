#!/usr/bin/env bash
# Checks a McSween Kiosk tablet file before it goes on a bus: a release build
# (not debuggable) that keeps no backups. A debuggable file, or one that allows
# backups, would let a laptop on a USB cable copy the tablet's data, including
# its sign-in key.
#
#   bash tools/kiosk/check-release-apk.sh <Android build-tools folder> <file.apk>
set -euo pipefail
tools="$1"
apk="$2"

if "$tools/aapt2" dump badging "$apk" | grep -q '^application-debuggable'; then
  echo "::error::$apk is a debug build. Build :app:assembleKioskRelease instead."
  exit 1
fi

backup=$("$tools/aapt2" dump xmltree "$apk" --file AndroidManifest.xml | grep -m1 ':allowBackup(' || true)
echo "Manifest: ${backup:-allowBackup not set}"
if ! printf '%s' "$backup" | grep -Eq '=false|\)0x0+$'; then
  echo "::error::$apk allows backups (android:allowBackup must be false)."
  exit 1
fi

echo "Tablet file checks passed: release build, no backups."
