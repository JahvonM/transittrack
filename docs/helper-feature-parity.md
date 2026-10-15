# Combined app: helper parity and improvement checklist

Baseline: current helper source, manifest version 1.14 / code 15. This is the minimum replacement scope, not a declaration that all items are integrated.

| Existing capability | Combined app status | Replacement verification |
| --- | --- | --- |
| VFAN/PL2303/u-blox/CDC USB GPS, baud search, reconnect/rescan | Integrated, opt-in | Native compilation + parser/source tests pass; actual receiver test pending |
| USB prompt auto-OK | Integrated, optional user-enabled accessibility service | Native compilation, 5 prompt policy tests and settings browser test pass; actual Android dialog test pending |
| Always-on screen on charger and battery | Existing native keep-awake hook | Physical battery/charger/wake test pending; does not equal kiosk lockdown |
| ACR122U CCID card reading and reconnect after detach/wake | Integrated, opt-in on boarding tablet | Native compilation and mocked boarding tests pass; physical USB/wake test pending |
| Accepted/rejected reader lights and buzzer based on page acknowledgement | Integrated with per-tap receipts | Late/wrong/duplicate/expired response tests pass; actual lights/buzzer require hardware |
| Tap buffering/retry while page starts or wakes | Integrated reader waits for page readiness; retries same ID, memory only, 30-second expiry | Browser tests confirm one lookup/boarding on delivery retry; no UID persistence |
| Bluetooth boarding advertisement and code delivery | Separate helper still required | Preserve service/characteristic UUIDs, name, validation and attempt limits |
| Per-minute health report and local diagnostics | Native battery/power/temperature/storage/network/USB/GPS/NFC status integrated; bounded local timeline | Existing heartbeat carries allowlisted metadata to admin. Full hotspot/BLE/carrier health still pending |
| Wi-Fi scan/join/reconnect/power and local network PIN | Separate helper still required | Android 10 helper relies on API-28 Wi-Fi behaviour; modern target needs managed-device or OS-supported path, verified on tablet |
| Hotspot enable/disable, always-on mode and timeout handling | Separate helper still required | Firmware/ADB-grant dependent; must report blocked operations honestly |
| Mobile data/SIM/carrier/signal health | Separate helper still required | Preserve unknown/permission-denied states and avoid repeated permission requests |
| Low-battery parking and power transitions | Separate helper still required | Preserve 5% GPS/hotspot parking, reader/screen behaviour; do not reintroduce ignition-based sleep |
| Boot/USB-attach recovery and persistent service | Separate helper still required | Integrate with current Android foreground-service rules; test real reboot and USB attachment |
| Scheduled/wake page refresh | Separate helper still required | Improve by checking active trip and unsynced work before any reload |
| FreeKiosk REST transport, localhost command/result endpoints and random page key | Existing helper transport | Replace with typed in-process native calls/events; retain authorization and correlated results |
| Admin-command relay over authenticated heartbeat | Existing helper still executes network actions | New native endpoint must preserve server-approved actions and acknowledgements |
| Private signed helper release/setup workflow | Existing helper release remains valid | Combined app updates must use its existing signing identity; never generate replacement keys or ship a secret in the public repo |

## USB auto-accept in the combined app

- Driver More > Tablet & reader > USB GPS receiver > Set up USB auto-accept opens Android Accessibility settings.
- User enables TransitTrack USB auto-accept once. It can be disabled in the same settings.
- Restricted to Android System UI, a pending GPS or NFC USB permission request issued by this app within 45 seconds, the app label and the receiver product name (or explicit USB wording if no product name is available).
- Does not approve other applications, old helper prompts, camera/microphone/screen-sharing prompts or stale requests.
- No screen content is recorded, stored, transmitted or exposed remotely.
- Pending state clears on a USB permission result, successful auto-confirmation, or switching integrated GPS off.
- Real tablet UI matching still needs testing. Android/OEM dialog changes can require manual acceptance.
- A public-store release using this service needs the applicable accessibility declaration/disclosure review; this checkpoint is not store approval.

## Prioritized improvements beyond parity

1. Unified tablet setup and permission checklist with useful recovery actions.
2. One diagnostic timeline correlating app, USB, GPS, network and upload failures, with secrets/card UIDs excluded.
3. Escalating automatic recovery with backoff and an admin alert when recovery fails.
4. GPS signal quality, jump rejection, source status and outage warnings.
5. Visible offline queue counts, oldest pending item and selective retry/export without losing saved work.
6. Admin-only remote diagnostics, signed updates and rollback, reboot/managed kiosk controls where provisioned.
7. Network outage handling, saved preferred networks and clear SIM/hotspot failure reporting.
8. USB disconnect/charging/overheating warnings with hardware capability reporting.
9. Approved, visible, expiring screen/camera support sessions with access logs.
10. Safe maintenance windows that respect active shifts, check-ins and pending uploads.

Do not remove the separate helper or FreeKiosk until every needed parity row has passed real-device acceptance tests.


## NFC and health checkpoint (2026-10-15)

Implemented:
- Native UsbNfc plugin reuses the existing ACR122U CCID/APDU reader. Off by default; boarding page readiness and foreground lifecycle control access. Detach/wake recovers by rescanning/reopening.
- Direct native events replace FreeKiosk HTTP delivery for this source. A native tap ID remains attached to its card lookup and acknowledgement; success means card recognition, as with the existing helper, not completed boarding.
- Matching receipts control reader lights/buzzer; wrong, contradictory, expired and cancelled receipts cannot approve another tap. One retry uses the same ID. Missing confirmation is not success.
- GPS/NFC USB auto-accept is restricted to the app's pending request and enabled source. Existing helper prompts and other Android permissions remain outside its scope.
- Boarding settings retain the server/offline bus-PIN gate and now include the integrated reader and health card. Driver settings include health alongside GPS.
- Health includes battery/charging, battery temperature, free storage, network validation, attached USB count, model/Android version and GPS/NFC status. No serial numbers/card IDs/credentials are sent as diagnostics.
- A 60-event memory-only timeline records fixed event codes. It is visible locally; remote timeline retrieval is not implemented.
- Metadata is relayed through existing authenticated heartbeats, with a server allowlist and bounds. Admin tablet cards show temperature/storage/network; fleet health flags heat/low storage.
- Android Wi-Fi/hotspot settings shortcuts are available behind tablet settings. These are OS settings shortcuts, not automatic remote Wi-Fi/hotspot control.

Validation:
- Android compileDebugJavaWithJavac and testDebugUnitTest passed: 14 relevant native tests (4 NMEA, 5 USB prompt policy, 5 tap receipt), plus the existing template test.
- 35 targeted JavaScript tests passed: native NFC/health, metadata handoff, helper compatibility, offline directory, driver GPS and existing GPS behavior snapshot.
- Five browser scenarios passed: existing card boarding, typed-code offline queue, native accepted/duplicate taps, native rejected taps, and PIN-gated reader/health/settings controls. The settings scenario passed again after hiding a misleading legacy Wi-Fi-off card in native mode.
- Production web build, changed-file lint and diff whitespace check passed. Settings screenshot inspected.
- No live records, accounts, tablets, credentials or signing keys changed. No APK was signed or published. VFAN/ACR122U hardware validation remains necessary.

Remaining replacement work includes Bluetooth boarding, automatic managed Wi-Fi/hotspot operations, SIM/carrier health, low-battery policy, boot/background service/watchdog recovery, remote command execution/diagnostics, native update delivery and managed kiosk lockdown. Camera/screen support remains a separate authenticated-session integration. The separate helper and FreeKiosk must remain installed until the required rows are physically verified.


## Kiosk-only launch checkpoint (2026-10-15)

The installed Android helper build now opens driver or boarding/signing screens, remembers the selected mode, resumes a single existing pairing on upgrade and redirects passenger/account links to the tablet flow. Driver settings and PIN-gated boarding settings include a deliberate screen chooser. Phone OAuth and notification navigation listeners are disabled for this build. Android launcher label is TransitTrack Kiosk; application ID, signing identity, saved credentials/queues and server records are unchanged. See kiosk-app-boundary.md for validation and upgrade checks. A separately packaged passenger binary without helper plugins is still pending. This checkpoint does not complete the helper parity rows above.
