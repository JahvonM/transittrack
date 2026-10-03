#!/bin/sh
# Builds TransitTrack-Kiosk-Helper.apk without Gradle.
# Needs: JDK 17 (JAVA_BIN), Android build-tools 34 (BT), android.jar from platform 33 (AJ).
set -e
cd "$(dirname "$0")"
: "${JAVA_BIN:?set JAVA_BIN to the JDK bin folder}" "${BT:?set BT to build-tools}" "${AJ:?set AJ to android.jar}"
# Supply an existing private keystore; this script never creates signing keys.
: "${HELPER_KEYSTORE:?set HELPER_KEYSTORE to an existing private keystore}" \
  "${HELPER_KEY_ALIAS:?set HELPER_KEY_ALIAS}" \
  "${HELPER_STORE_PASSWORD:?set HELPER_STORE_PASSWORD}" \
  "${HELPER_KEY_PASSWORD:?set HELPER_KEY_PASSWORD}"
[ -f "$HELPER_KEYSTORE" ] || { echo "Signing keystore not found" >&2; exit 1; }
case "$HELPER_KEYSTORE" in
  /*) ;;
  *) echo "HELPER_KEYSTORE must be an absolute path" >&2; exit 1 ;;
esac
export HELPER_STORE_PASSWORD HELPER_KEY_PASSWORD
export PATH="$JAVA_BIN:$PATH"
rm -rf build && mkdir -p build/gen build/classes
"$BT/aapt2" compile --dir res -o build/res.zip
"$BT/aapt2" link -o build/base.apk -I "$AJ" --manifest AndroidManifest.xml --java build/gen build/res.zip
javac -nowarn -source 1.8 -target 1.8 -bootclasspath "$AJ" -d build/classes $(find src build/gen -name '*.java')
"$BT/d8" --release --min-api 24 --lib "$AJ" --output build $(find build/classes -name '*.class')
python3 - << 'PY'
import shutil, zipfile
shutil.copy("build/base.apk", "build/unsigned.apk")
with zipfile.ZipFile("build/unsigned.apk", "a", zipfile.ZIP_DEFLATED) as z:
    z.write("build/classes.dex", "classes.dex")
PY
"$BT/zipalign" -f 4 build/unsigned.apk build/aligned.apk
"$BT/apksigner" sign --ks "$HELPER_KEYSTORE" --ks-key-alias "$HELPER_KEY_ALIAS" \
  --ks-pass env:HELPER_STORE_PASSWORD --key-pass env:HELPER_KEY_PASSWORD \
  --out build/TransitTrack-Kiosk-Helper.apk build/aligned.apk
"$BT/apksigner" verify build/TransitTrack-Kiosk-Helper.apk
echo "Built build/TransitTrack-Kiosk-Helper.apk"
