# Kiosk release status — 18 October 2026

Current combined test candidate: Android **1.4 / build 5** (reader starts by itself like the Helper; see helper-feature-parity.md, 19 October). Start with [kiosk-one-big-test.md](kiosk-one-big-test.md) for one Windows build command and one ordered tablet test. The rejected mint driver theme has been removed; functional work remains. Background tracking details and acceptance limits: [background-driver-gps.md](background-driver-gps.md).

Cloud recording upload/storage is deferred at the owner's request. Rear-camera recordings remain on the tablet; admin playback transfers a selected clip on demand and still requires the tablet to be online. Supabase is not a video archive in this release.

## Earlier automated evidence (superseded by the combined run below)

- Security release suite: 188 tests passed across 17 files, including concurrent operation and credential/session boundary checks. These are isolated tests with synthetic RPC fixtures; hosted Supabase migrations, flags and production atomicity were not verified.
- Corrected three stale test fixtures: pairing now loads the actual shared durable-operation helpers; driver messages carry a company and explicitly exclude another company's messages; direct entity access tests recognize server-only support/recording sessions and forbid both through the generic gateway for every role, including admin.
- Focused regression run: 45 tests passed. Full src/lib unit suite after the finishing changes: 985 tests passed across 109 files. npm run build (crash-guard lint and frontend production build) exited successfully.
- No application security rules were loosened. No accounts, tablet assignments, PINs, credentials, saved queues or server settings were changed.

## Feature and acceptance status

| Area | Current status | Remaining evidence/work |
| --- | --- | --- |
| Driver and boarding/sign-in modes | Integrated into the kiosk build | Physical shift, PIN and boarding acceptance |
| USB GPS, NFC, reconnect and optional USB prompt helper | Implemented | Actual receiver/reader detach, wake and reconnect tests |
| Keep screen awake, Home/USB launch recovery | Implemented while activity is visible; optional Android defaults | Charger removal, wake and reboot on this OEM; no persistent watchdog guarantee |
| Offline saved work and retry handling | Implemented and covered by isolated tests | Offline/restart/reconnect test on a paired tablet |
| Admin health, network and tablet controls | Implemented with native permission/capability gates | Android device-owner/OEM permission checks; Wi-Fi/hotspot behavior on this tablet |
| Direct screen/camera viewing | User reported working after relay firewall setup | Recheck after final same-key update; camera use must not conflict with dashcam |
| Rear dashcam and local playback | User reported rear recording works | Confirm saved clip playback, rotation and protected-clip behavior on installed build |
| Admin saved-recording playback | Implemented; latest native data-channel ICE fix passed prior native tests | User has not confirmed playback after that update |
| Native update delivery | Guarded same-package/same-signer updater implemented; release catalog intentionally empty | Existing signing environment, immutable signed artifact and safe physical upgrade acceptance |
| SIM/carrier health | Read-only SIM state, carrier and cached signal integrated into driver, boarding and admin health; no new phone permission prompts or identifiers | Physical SIM, no-SIM, Wi-Fi-only and OEM-restricted readings still need acceptance |
| Renderer recovery and background watchdog | Confirmed WebView renderer death opens a native fallback and retries at most twice per ten minutes while visible; manual reopen after retry budget | Hardware renderer-kill acceptance remains; native foreground GPS and Android 10 restart recovery are implemented; whole-process ANR/force-stop recovery is not guaranteed |
| Separate passenger installation | Kiosk routes are restricted; separate passenger binary not packaged | Passenger package must exclude kiosk permissions/plugins |

The finishing native build passed Kotlin/Java compilation and 79 JVM tests on 18 October. Three focused mocked browser checks passed for NFC delivery, PIN-gated recovery/mobile status and admin health. The security suite passed all 188 tests with one test worker; a parallel run during toolchain installation hit a test timeout. Recording capability tests now load actual shared helpers rather than dropping imports. No signed production APK was produced and no native release catalog entry was activated.

## Final tablet acceptance sequence

Use the existing Windows checkout and existing signing identity. Do not uninstall, reset, re-pair or generate replacement signing keys to resolve an update failure. Keep the old helper and FreeKiosk until the required hardware checks pass.

1. Update the development tablet in place; confirm its saved pairing and kiosk mode remain.
2. Driver: unlock by PIN, start/end a shift, select the next stop and verify GPS/map recentering.
3. Boarding: tap a known card, verify one check-in and correct feedback; unplug/reconnect the reader and repeat after wake.
4. Save work offline, restart the app, reconnect and verify sync without duplicate or lost work. Do not clear saved queues.
5. Record a short rear-camera clip, stop, play/seek locally, then use Admin → Kiosk tablets → Tablet controls → Saved recordings to browse and play it.
6. Verify admin live viewing and that camera ownership is released when a viewing/recording session ends.
7. Check unplugged screen behavior, GPS recovery and explicit Android Home/USB defaults after reboot. Test Wi-Fi/hotspot only where the tablet reports the required capability.
8. Before fleet rollout, test a non-debuggable newer same-key APK update preserving pairing, PIN flow, settings and queued work. Publish a reviewed native catalog entry only after the exact artifact and update flow pass.

This is a current handover checklist, not a declaration that every hardware feature or production deployment has passed.

## 18 October implementation update

Fixed a confirmed driver endpoint issue: it discarded native model, Android version, network, temperature, storage and USB metadata while boarding retained them. Both now use the same bounded hardware normalizer. Mobile status and screen recovery travel on the existing heartbeat; no additional server polling was introduced.

Renderer recovery never treats rate limits, slow requests or loss of Internet as a reason to restart. A dead WebView is removed/destroyed; the failed activity finishes into a non-exported native fallback. Retry budget is persisted before automatic relaunch, foreground-only and clock-rollback safe. Existing cookies, pairing, queues and recordings are not cleared. In-memory input that had never been saved cannot be recovered from an already-dead renderer. Background renderer loss waits for the user to bring the kiosk forward. That renderer-only mechanism does not itself cover full-process death or background GPS. The subsequent native foreground-service update is documented in background-driver-gps.md; Android force-stop and OS permission bypass remain outside its scope.

To validate on a development tablet while parked, first ensure forms are saved and sync state is understood, then exercise a renderer termination through Android/WebView diagnostics. Confirm a native fallback, restored saved mode/pairing/queue, and a manual Reopen kiosk button after repeated failure. Do not add a production crash URL or a remotely triggerable renderer-kill command.

### Final PC handover

1. Publish the web changes from the Base44 dashboard after the repository sync completes.
2. On the Windows PC, open PowerShell in `C:\Users\Gameo\StudioProjects\transittrack`, run `git pull --ff-only`, then `npm install` and `npm run cap:android`. Keep the existing public Base44 environment values/project configuration.
3. In Android Studio, select the connected tablet and use the existing build/signing configuration to update it in place. Do not uninstall or replace its signing key. A signature mismatch needs the original signing environment, not a reset.
4. Check Driver settings or PIN-gated Boarding settings → Mobile connection and Startup & recovery. Admin → Kiosk tablets shows the new status after the existing heartbeat arrives.
5. Test Saved recordings admin playback after the previously fixed data-channel update. Recording upload/cloud retention remains out of scope.

No approved production-signed APK or native release-catalog entry was created by this pass. The package and signing configuration remain unchanged. Android version is now 1.2 / build 3 so Admin can distinguish this native update from build 1. The native release catalog remains empty.

## Background GPS finishing pass

Added the opt-in native GPS service, private durable assigned queue, independent server authorization, current-binding export, native health reporting and restart recovery. Existing helper and FreeKiosk remain until hardware acceptance. The SQLite/Keystore tests include persisted rows across reopen, exact acknowledgement, review retention, ciphertext round-trip, wrong-key refusal and old-generation cleanup. See background-driver-gps.md for final verification results and limits.

## Keep screen on control

Driver tablet settings and PIN-gated boarding settings → Startup & recovery now include Keep screen on. Defaults on, persists per tablet, applies immediately and after resume/restart. Off uses the Android screen timeout; it does not force sleep or disable background GPS. The native recovery screen follows the preference. The separate rear-camera recording activity keeps its existing awake requirement. Older installed binaries show an update hint instead of a nonfunctional switch. Requires the rebuilt kiosk APK; physical timeout/power/restart acceptance is pending.

Display-switch validation: focused recovery helper tests passed (4), changed frontend files passed the crash-guard lint, Vite build exited successfully and diff whitespace checks passed. The refreshed sandbox has no Java/Android SDK, so this switch's native compilation was not rerun; the earlier 1.2 background GPS build results predate this switch. Compile and verify screen timeout, resume and persistence with the combined native update before rollout.

## Combined test candidate — 1.3 / build 4

Prepared for one owner-run parked tablet acceptance using [kiosk-one-big-test.md](kiosk-one-big-test.md) and tools/kiosk/Prepare-Tablet-Test.ps1. Removed the rejected driverRefined theme import and stylesheet; restored the previous driver appearance without rolling back screen power, background GPS, recordings, health or saved-work changes. Recovery state now reports whether native driver tracking is active instead of a constant false. Package/application ID and signing configuration are unchanged.

Verification on the final application code:

- JavaScript unit suite: 112 files / **1,004 passed**.
- Security suite: 17 files / **188 passed**, isolated synthetic fixtures; not a hosted database migration/atomicity certification.
- Web production build/crash guard and Capacitor Android sync passed. Verified rejected theme CSS is absent in web output and synced Android assets.
- Android debug Java/Kotlin compilation, **92 native tests (zero failures/errors)**, release compilation, vital release lint and assembleRelease passed. Three new tests exercise default-on display state, persistence across activity reopening, restoring on, and repeated resume application retaining off.
- Built unsigned release manifest verified with aapt: com.transittrack.app, versionName 1.3, versionCode 4, min SDK 22 / target SDK 36. Signature verification correctly rejects it as unsigned. It is build evidence, not an installable production update or approved catalog artifact. No signing key was created or replaced.
- Browser coverage: **102 distinct mocked scenarios passed across the broad run and final focused rerun**. Broad run: 94 passed, eight failures, one skipped. Corrected stale chooser/camera text, obsolete Navigation-tab paths and landscape tab counts while retaining functional assertions. Clarified that road geometry may load for the overview but turn-by-turn step requests wait for Navigate. The isolated final rerun passed all nine selected tests (the eight previous failures plus an overlapping portrait scenario). One initial PIN-screen readiness timeout under concurrent native/build load passed in isolation without changing its timeout or application logic.
- One real synthetic WebRTC media-transport browser scenario remains skipped because the sandbox lacks usable ICE interfaces. Mocked admin viewing/recording state, transfer verification and disconnect handling passed; actual tablet media transfer remains mandatory in physical acceptance.
- PowerShell parser accepted the preparation script. Windows SDK discovery, Android Studio opening, existing-signer installation and physical tablet tests were not executed remotely. Whitespace checks passed.

A first focused rerun overlapped the broad browser runner and lost its shared preview server when that runner exited; its connection-refused result was not treated as an app failure. The final focused rerun ran alone and passed. No further full-suite rerun was needed after test-only selector/fixture corrections.

Remaining handoff: publish web through the existing Base44 dashboard, pull the synced source on Windows, run the preparation script, update in place using the original signing identity, then run the single checklist. Do not uninstall, reset, clear saved work or use a replacement key. Cloud video storage, separate passenger packaging and a provisioned signed native update catalog are not part of this test candidate.

### Windows JDK correction

The owner’s Windows build selected Java 25 and failed with Unsupported class file major version 69 before installation. The preparation script now validates JDK metadata and requires an installed JDK 17 or 21, scanning normal installation paths instead of trusting JAVA_HOME blindly. It pins the selected home for this PowerShell process and for the Gradle invocation, including when a global Gradle Java-home property is set. No global Java settings, Gradle wrapper version, signing identity or tablet data is changed. Five PowerShell selection scenarios passed (reject 25/select 17, select 21, reject 25 only, reject missing paths, reject a JRE without javac), and both scripts parsed. Android Studio’s separate Gradle-JDK setting must use the printed compatible path.

### Windows recording-path safety correction

The owner's Windows native suite reached 92 tests and failed the original DashcamFilesTest.refusesTraversalAndOutsideSymlink assertion: File.getCanonicalFile can normalize a Windows link name without resolving its target. Production DashcamFiles now rejects a leaf whose canonical path differs from its expected absolute path, and explicitly checks symbolic links through NIO where available. Public NIO methods are resolved once through reflection so the class still loads on Android API 22–25; existing canonical containment applies there. Reflection/verification failures on a supported host reject the file. No test was disabled or converted to an assumption.

The original outside-link test remains. Added inside-folder-link tests ensuring find/delete/protect refuse the alias without changing its target, and dangling-link rejection. Compiled production class plus the real JUnit test with JDK 17: **11 recording-file tests passed** on Linux. Full Android Gradle compilation and Windows filesystem acceptance were not rerun in this refreshed sandbox. The Windows native suite should now contain 94 tests; the owner must pull and rerun it before installation. No tablet, clip or signing data was modified remotely.


### 20 October — combined Android test handoff

Android remains 1.4 / build 5. Added the missing WRITE_SECURE_SETTINGS manifest declaration required by the documented owner-run adb grant. This enables only the existing USB setup path; it does not automatically grant camera/screen consent.

Prepare-Tablet-Test.ps1 now runs native tests and assembleDebug, then copies the local test APK and SHA-256 checksum to Windows Downloads. Install-Tablet-Test.ps1 verifies that checksum, requires one authorized tablet or an explicit serial, uses adb install -r without uninstall/downgrade/data clearing, attempts optional USB setup and opens the kiosk. Signature errors stop before setup or launch. Use the original local signing environment. The remote packaging check produced an unsigned release APK only, not an installable signed download.

Current verification: 126 JavaScript files / 1,085 tests passed. Security suite: 185 passed initially; three five-second timeouts occurred alongside other build work, then both affected files passed all 14 checks independently with no assertion or timeout changes (188 distinct checks passed across runs). Android debug/release compilation, 96 native tests (zero skipped/failed), vital release lint and assembleRelease passed under JDK 17 / Gradle 8.13. All three PowerShell files parsed under PowerShell 7 on Linux; mocked installer success, multiple-device refusal, signature-failure stop and checksum rejection passed. Real Windows/USB installation remains unverified here. Web build emitted current dist/index.html. Real tablet acceptance, hosted web publication and same-key installation remain required. No tablet data, signing key or hosted records were changed.
