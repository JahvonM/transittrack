# TransitTrack Kiosk app boundary

The Android install containing TabletHealth and UsbGps/UsbNfc is the kiosk build. It opens only driver tablet, boarding/job-signing tablet, tablet chooser and legal screens. It does not enter passenger/driver-phone/account/admin navigation or consume phone OAuth/push-navigation callbacks.

This is client navigation isolation, not a replacement for server-side authorization. Existing device authentication, driver PIN checks and admin membership checks remain authoritative. A separate passenger binary with a different application ID and without helper plugins/permissions has NOT been created at this checkpoint. Do not describe the two-package split as complete.

## Startup and upgrade

- Existing Android application ID remains com.transittrack.app. Launcher label is TransitTrack Kiosk. Existing app signing identity must be retained.
- No uninstall, storage clearing, new signing keys, device revocation or re-pairing is part of this update.
- Startup at the existing hosted root is intercepted only in installed Android helper builds.
- An explicitly saved tt_tablet_mode wins. Otherwise exactly one existing driver/kiosk pairing is resumed.
- With no existing pairing, or both pairings and no selected mode, /tablet asks which screen to use.
- /tablet?choose=1 shows the chooser deliberately. Entry is available through driver settings or PIN-gated boarding settings.
- Choosing a screen writes only tt_tablet_mode. It does not reassign a bus/company, change a tablet type, remove credentials, touch records or flush/delete queues. The server pairing code still decides assignment/type.
- Ordinary web, iOS and Android builds without helper plugins retain existing navigation.
- No new server polling or telemetry stream was added.

## Validation

Six launch policy unit tests, six native NFC unit tests and five native health tests passed.
Five isolated mocked browser scenarios passed: first launch/driver preference, boarding preference, paired upgrade/data preservation and passenger/auth deep-link redirection, deliberate chooser/legal access, unchanged web sign-in.
Two existing native-NFC boarding browser cases passed (accepted/retry without duplicate lookup, rejected tap).
Portrait launcher screenshot inspected. Web production build, changed-file ESLint and whitespace check passed.
No physical tablet acceptance test or native APK build was performed for this checkpoint; native change is Android launcher string resources only. The USB auto-accept service reads the current Android app label dynamically.

## Apply

Publish frontend through Base44 dashboard. On the existing Windows checkout:

    git pull --ff-only
    npm run build
    npx cap sync android

Run the Android app from Android Studio onto the existing tablet using the same signing identity. Do not uninstall first.

Physical acceptance:
1. Existing paired driver tablet opens driver/PIN screen on relaunch.
2. Existing boarding tablet opens its saved boarding screen on relaunch.
3. New install offers driver or boarding/signing and remembers choice.
4. Driver PIN and boarding settings PIN still protect their settings.
5. NFC/USB GPS/auto-accept still work after label update, detach/reattach and sleep/wake.
6. Pending check-ins and saved directory remain present.
7. Check charger/battery keep-awake behaviour.

The separate helper and FreeKiosk must remain installed until required feature parity and physical tests pass. Remaining scope is tracked in helper-feature-parity.md.
