# Kiosk release status — 18 October 2026

Cloud recording upload/storage is deferred at the owner's request. Rear-camera recordings remain on the tablet; admin playback transfers a selected clip on demand and still requires the tablet to be online. Supabase is not a video archive in this release.

## Verified in this finishing pass

- Security release suite: 188 tests passed across 17 files, including concurrent operation and credential/session boundary checks. These are isolated tests with synthetic RPC fixtures; hosted Supabase migrations, flags and production atomicity were not verified.
- Corrected three stale test fixtures: pairing now loads the actual shared durable-operation helpers; driver messages carry a company and explicitly exclude another company's messages; direct entity access tests recognize server-only support/recording sessions and forbid both through the generic gateway for every role, including admin.
- Focused regression run: 45 tests passed. Full src/lib unit suite: 974 tests passed across 108 files. npm run build (crash-guard lint and frontend production build) exited successfully.
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
| SIM/carrier health and background watchdog | Incomplete helper parity | Implementation and OEM acceptance remain separate work |
| Separate passenger installation | Kiosk routes are restricted; separate passenger binary not packaged | Passenger package must exclude kiosk permissions/plugins |

The previous native build passed Kotlin/Java compilation and 76 JVM tests on 17 October. Native sources were not changed or recompiled in this finishing pass. No signed production APK was produced and no native release catalog entry was activated.

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
