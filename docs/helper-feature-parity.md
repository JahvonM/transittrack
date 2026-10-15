# Combined app: helper parity and improvement checklist

Baseline: current helper source, manifest version 1.14 / code 15. This is the minimum replacement scope, not a declaration that all items are integrated.

| Existing capability | Combined app status | Replacement verification |
| --- | --- | --- |
| VFAN/PL2303/u-blox/CDC USB GPS, baud search, reconnect/rescan | Integrated, opt-in | Native compilation + parser/source tests pass; actual receiver test pending |
| USB prompt auto-OK | Integrated, optional user-enabled accessibility service | Native compilation, 5 prompt policy tests and settings browser test pass; actual Android dialog test pending |
| Always-on screen on charger and battery | Existing native keep-awake hook | Physical battery/charger/wake test pending; does not equal kiosk lockdown |
| ACR122U CCID card reading and reconnect after detach/wake | Separate helper still required | Must port before helper removal |
| Accepted/rejected reader lights and buzzer based on page acknowledgement | Separate helper still required | Preserve tap-ID acknowledgement and no-UID logging |
| Tap buffering/retry while page starts or wakes | Separate helper still required | Preserve stable IDs, expiry, exactly one accepted boarding acknowledgement |
| Bluetooth boarding advertisement and code delivery | Separate helper still required | Preserve service/characteristic UUIDs, name, validation and attempt limits |
| Per-minute health report and local diagnostics | Separate helper still required for full health | Port battery/power/network/reader/GPS/hotspot/BLE/delivery diagnostics using existing heartbeat |
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
- Restricted to Android System UI, a pending GPS USB permission request issued by this app within 45 seconds, the app label and the receiver product name (or explicit USB wording if no product name is available).
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
