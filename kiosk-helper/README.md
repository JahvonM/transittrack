# TransitTrack Kiosk Helper (Android)

Small Android app for the bus tablets. Replaces the Termux scripts:

- **Screen on/off with the ignition**: reacts instantly to the charger being plugged/unplugged
  and calls FreeKiosk's REST API (`/api/screen/on|off`). Unplug is delayed 5 s so an engine
  crank doesn't blank the screen.
- **ACR122U card reader** (boarding tablets): reads card UIDs over USB (CCID), sends them to the
  boarding page through FreeKiosk `/api/js` (`tt-badge` event), and lights the reader green
  (accepted) or red + 3 beeps (rejected) using the result the page reports to 127.0.0.1:8765.
- Starts at boot. Declares the ACR122U (VID 072F / PID 2200) as its USB device, so ticking
  "Use by default" once makes Android grant USB access automatically after every restart.

Config (optional) via adb:
`adb shell am start -n com.transittrack.kioskhelper/.MainActivity --es api_key KEY --es port 8080 --es ignition true --es reader true`

Build: see build.sh (aapt2 + javac + d8 + apksigner, no Gradle). The signing key is
kiosk-helper/signing.jks; keep it, updates must be signed with the same key.
