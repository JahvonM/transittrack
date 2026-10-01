# TransitTrack Kiosk Helper (Android)

Small Android app for the bus tablets. Replaces the Termux scripts:

- **Screen on/off with the ignition**: reacts instantly to the charger being plugged/unplugged
  and calls FreeKiosk's REST API (`/api/screen/on|off`). Unplug is delayed 5 s so an engine
  crank doesn't blank the screen.
- **ACR122U card reader** (boarding tablets): reads card UIDs over USB (CCID), sends them to the
  boarding page through FreeKiosk `/api/js` (`tt-badge` event), and lights the reader green
  (accepted) or red + 3 beeps (rejected) using the result the page reports to 127.0.0.1:8765.
- **USB GPS** (driver tablets): reads a VFAN / Prolific / u-blox / CDC serial GPS and gives the
  position to Android as the "gps" provider (needs `appops set ... android:mock_location allow`).
- **Parked mode**: 2 min after power is lost (or battery <= 15 % while unplugged) the reader and GPS
  pause and the wake lock is released. Everything resumes when power returns.
- **Page refresh**: FreeKiosk `/api/reload` when the bus starts after 2+ h parked, or at 3 AM if
  the tablet was never unplugged.
- **Health report**: every minute sets `window.__ttHelperHealth` in the page; the kiosk/driver
  heartbeat relays it to KioskDevice.helper_health (Admin -> Kiosk Tablets).
- **Auto-OK**: accessibility service taps OK on Android's USB access popup when it mentions
  TransitTrack Helper (needs `pm grant ... android.permission.WRITE_SECURE_SETTINGS`).
- **Hotspot** (driver tablets, `--es hotspot true`): Wi-Fi hotspot on while the bus runs, off when
  parked, so the boarding tablet can use the bus SIM. Android 10 has no public API: needs
  `appops set ... WRITE_SETTINGS allow` and `settings put global hidden_api_policy 1`.
- Starts at boot. Declares the ACR122U (VID 072F / PID 2200) as its USB device, so ticking
  "Use by default" once makes Android grant USB access automatically after every restart.

Config (optional) via adb:
`adb shell am start -n com.transittrack.kioskhelper/.MainActivity --es api_key KEY --es port 8080 --es ignition true --es reader true --es gps true --es hotspot false`

Build: see build.sh (aapt2 + javac + d8 + apksigner, no Gradle). The signing key is
kiosk-helper/signing.jks; keep it, updates must be signed with the same key.
