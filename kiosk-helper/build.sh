#!/bin/sh
# Builds TransitTrack-Kiosk-Helper.apk without Gradle.
# Needs: JDK 17 (JAVA_BIN), Android build-tools 34 (BT), android.jar from platform 33 (AJ).
set -e
cd "$(dirname "$0")"
: "${JAVA_BIN:?set JAVA_BIN to the JDK bin folder}" "${BT:?set BT to build-tools}" "${AJ:?set AJ to android.jar}"
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
if [ ! -f signing.jks ]; then
  keytool -genkeypair -keystore signing.jks -storepass transittrack -keypass transittrack \
    -alias helper -keyalg RSA -keysize 2048 -validity 10000 -dname "CN=TransitTrack Kiosk Helper"
fi
"$BT/apksigner" sign --ks signing.jks --ks-pass pass:transittrack --key-pass pass:transittrack \
  --out build/TransitTrack-Kiosk-Helper.apk build/aligned.apk
"$BT/apksigner" verify build/TransitTrack-Kiosk-Helper.apk
echo "Built build/TransitTrack-Kiosk-Helper.apk"
