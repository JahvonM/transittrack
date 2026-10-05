# TransitTrack Kiosk Helper (Android)

Small Android app for the bus tablets. Replaces the Termux scripts:

- **Always-on screen (1.7)**: holds an Android screen wake lock on charger and battery,
  sets the screen timeout to its maximum and asks FreeKiosk to keep the display on.
  Legacy ignition sleep settings are ignored. Scanner availability does not control display sleep.
- **ACR122U card reader** (boarding tablets): reads card UIDs over USB (CCID), sends them to the
  boarding page through FreeKiosk `/api/js` (`tt-badge` event), and lights the reader green
  (accepted) or red + 3 beeps (rejected) using the result the page reports to 127.0.0.1:8765.
- **USB GPS** (driver tablets): reads a VFAN / Prolific / u-blox / CDC serial GPS and gives the
  position to Android as the "gps" provider (needs `appops set ... android:mock_location allow`).
- **Scanner reconnection (1.7)**: a detached reader is closed, then USB devices are checked
  every two seconds. The USB connection is reopened after a screen wake. Android must still
  grant USB access. This continues on battery and while GPS is parked.
- **Tap delivery (1.7)**: taps are held in page memory for at most 30 seconds while the page
  starts or wakes. One retry uses the same tap ID to prevent duplicate card lookups. Green
  feedback requires the page's acknowledgement; a REST response alone is not success.
  The helper status screen shows whether the page acknowledged the tap. UIDs are not logged.
- **Low battery**: at 5 % on battery, GPS and hotspot park. The screen and enabled scanner
  remain awake until Android powers down or the helper stops.
- **Page refresh**: FreeKiosk `/api/reload` when the bus starts after 2+ h parked, or at 3 AM if
  the tablet was never unplugged.
- **Health report**: every minute sets `window.__ttHelperHealth` in the page; the kiosk/driver
  heartbeat relays it to KioskDevice.helper_health (Admin -> Kiosk Tablets).
- **Auto-OK**: accessibility service taps OK on Android's USB access popup when it mentions
  TransitTrack Helper (needs `pm grant ... android.permission.WRITE_SECURE_SETTINGS`).
- **Hotspot** (driver tablets, `--es hotspot true`): Wi-Fi hotspot on while the bus runs, off when
  parked, so the boarding tablet can use the bus SIM. Android 10 has no public API: needs
  `appops set ... WRITE_SETTINGS allow` and `settings put global hidden_api_policy 1`.
- **Bus Wi-Fi** (boarding tablets, `--es join_ssid TT-BUS12 --es join_pass PASSWORD`): saves the
  bus hotspot, keeps Wi-Fi on and reconnects while the bus runs (classic Wi-Fi API; helper
  targets API 28 for this). Needs `pm grant ... android.permission.ACCESS_FINE_LOCATION`.
- Starts at boot. Declares the ACR122U (VID 072F / PID 2200) as its USB device, so ticking
  "Use by default" once makes Android grant USB access automatically after every restart.

Config (optional) via adb:
`adb shell am start -n com.transittrack.kioskhelper/.MainActivity --es api_key KEY --es port 8080 --es ignition false --es reader true --es gps true --es hotspot false`

Build: see build.sh (aapt2 + javac + d8 + apksigner, no Gradle).
Supply an existing signing keystore using an absolute `HELPER_KEYSTORE` path,
`HELPER_KEY_ALIAS`, `HELPER_STORE_PASSWORD`, and `HELPER_KEY_PASSWORD` in the local
environment. The build fails if these are missing and never generates a key.
Keep signing material outside version control in secure private storage; updates
must use the same signing key as the installed app. Do not commit signed APKs.

FreeKiosk has no built-in API key fallback. Configure the tablet's own REST API
key through the existing `--es api_key` option. The setup script asks for the
exit PIN, API key, and bus hotspot password locally; it contains no fleet-wide
credential defaults. Use 16–128 letters/numbers for API keys, 8–63 letters/numbers for hotspot
passwords, and 6–12 digits for the exit PIN. Inputs are validated before ADB use.
Place a trusted, privately supplied `TransitTrack-Kiosk-Helper.apk` beside the
Windows setup script. It no longer downloads the old public APK.

Release delivery: the signed APK is served only through the admin-only
`helperRelease` backend function (Admin -> Kiosk Tablets -> Helper app), never
under /public. To release a new version, build with build.sh and replace
VERSION, VERSION_CODE, SHA256 and APK_BASE64 in base44/functions/helperRelease/entry.ts.

Pre-production STEP 1 preserved the existing development signing key as an
ignored local file and moved the legacy APK into ignored
`kiosk-helper/legacy-development/`. Back up development signing material securely
outside the sandbox before it is reset. Existing tablets were not updated or
revoked. No replacement keys were generated.

Removing secrets from the current tree does not erase earlier Git commits or
previously published files. History cleanup and publishing are separate tasks;
do not treat the removed credentials as suitable for the first production release.

1.7 validation: unplug/replug the scanner while powered and on battery; present a card immediately
after the boarding page starts; wake the tablet and tap again. The passenger identity should
appear, and the helper should say the page recognized or rejected the card. Verify the display
stays awake without a charger and with the scanner unplugged. Compilation and mocked browser
tests do not replace this physical test. The current downloadable APK remains 1.6 until 1.7 is
signed with the existing private key and released; publishing the website does not update it.
