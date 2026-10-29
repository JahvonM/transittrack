# T10 Hardware Test

Standalone, offline Android diagnostic app. This is not a replacement kiosk APK.
Package: `com.mcsween.t10test`; label: **T10 Hardware Test**.
No production source/build files are changed. No network permission, server URL,
login, check-in, device-owner setup, auto-updater, card writes or persistent UID storage.

## Build on Windows
Open this `tools/t10-test` directory as a separate Android Studio project.
Let Gradle sync, install Android SDK 36 when prompted, select the T10 and click Run.
Alternatively, from the repository root (with ANDROID_HOME set):

```powershell
.\android\gradlew.bat -p tools/t10-test :app:assembleDebug
```

APK: `tools/t10-test/app/build/outputs/apk/debug/app-debug.apk`.
Install only on the T10. Its separate package allows it to coexist with the kiosk.
No `cap sync`, website publish, production update or device-owner change is needed.

## Hardware checks
1. Open T10 Hardware Test. Confirm NFC reader mode is requested.
2. Present the same card used on a working phone. Record whether UID/technology appears.
3. Remove the card, background the app, return and tap again.
4. Tap Start / next camera, grant Camera permission, and check the preview.
5. Tap again to try each Android camera ID. Record the displayed error for failures.
6. Stop the camera and leave the app; camera and NFC reader mode are released.

NFC uses Android reader mode with SKIP_NDEF_CHECK to test UID detection without
NDEF probing or card authentication. A successful tap does not prove all card
operations work. Camera uses the legacy Android camera API as a basic preview
probe; success does not prove WebView scanning or a dedicated QR module works.
Card identifiers are displayed locally: redact them from shared screenshots.

This diagnostic does not yet integrate the reader into boarding/check-in. Its
results determine the next isolated integration step. Hardware validation needs
the physical T10; do not treat an untested APK as a proven fix.
