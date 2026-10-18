# Kiosk release status — 18 October 2026

Cloud recording upload/storage is deferred at the owner's request. Rear-camera recordings remain on the tablet; admin playback transfers a selected clip on demand and still requires the tablet to be online. Supabase is not a video archive in this release.

## Verified in this finishing pass

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
| Renderer recovery and background watchdog | Confirmed WebView renderer death opens a native fallback and retries at most twice per ten minutes while visible; manual reopen after retry budget | Hardware renderer-kill acceptance remains; full-process/ANR watchdog and background GPS service are not implemented |
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

Renderer recovery never treats rate limits, slow requests or loss of Internet as a reason to restart. A dead WebView is removed/destroyed; the failed activity finishes into a non-exported native fallback. Retry budget is persisted before automatic relaunch, foreground-only and clock-rollback safe. Existing cookies, pairing, queues and recordings are not cleared. In-memory input that had never been saved cannot be recovered from an already-dead renderer. Background renderer loss waits for the user to bring the kiosk forward. Full-process death, Android force-stop, OS permission bypass and always-on background GPS are not covered by this mechanism.

To validate on a development tablet while parked, first ensure forms are saved and sync state is understood, then exercise a renderer termination through Android/WebView diagnostics. Confirm a native fallback, restored saved mode/pairing/queue, and a manual Reopen kiosk button after repeated failure. Do not add a production crash URL or a remotely triggerable renderer-kill command.

### Final PC handover

1. Publish the web changes from the Base44 dashboard after the repository sync completes.
2. On the Windows PC, open PowerShell in `C:\Users\Gameo\StudioProjects\transittrack`, run `git pull --ff-only`, then `npm install` and `npm run cap:android`. Keep the existing public Base44 environment values/project configuration.
3. In Android Studio, select the connected tablet and use the existing build/signing configuration to update it in place. Do not uninstall or replace its signing key. A signature mismatch needs the original signing environment, not a reset.
4. Check Driver settings or PIN-gated Boarding settings → Mobile connection and Startup & recovery. Admin → Kiosk tablets shows the new status after the existing heartbeat arrives.
5. Test Saved recordings admin playback after the previously fixed data-channel update. Recording upload/cloud retention remains out of scope.

No approved production-signed APK or native release-catalog entry was created by this pass. The package and signing configuration remain unchanged. Android version is now 1.1 / build 2 so Admin can distinguish this native update from build 1. The native release catalog remains empty.
