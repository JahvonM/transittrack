# Managed Android kiosk (app 1.6, build 7)

Adds persistent Android Lock Task, managed Home selection, lifecycle fullscreen, boot/update recovery, an owner-only watchdog, and private native offline maintenance to the combined driver/boarding/signing APK. Existing web caching, pairing, saved uploads, USB readers, GPS and camera ownership remain in their existing components.

## Installation and first setup

1. Deploy the matching frontend and `tabletControl`, `driverSession`, and `kioskHeartbeat` functions together. There is no SQL migration: status uses boolean fields in the existing `helper_health` JSON column.
2. Build/install the combined APK as a same-package, same-signature upgrade, with a higher version code. Do not uninstall, clear app data, or generate a replacement signing key. Installing build 7 does not enable permanent locking automatically.
3. Confirm Android 8+ and that **this app** is device owner. Device admin alone is insufficient. If FreeKiosk is device owner, stop here and plan a managed-device handover; this implementation never removes another owner's management or resets a device. Do not factory-reset a tablet merely to try this feature.
4. Open the paired tablet. In Admin → Kiosk tablets → Tablet controls, refresh until the new kiosk capability and ownership are reported.
5. While parked with the tablet nearby, request **Set recovery PIN**. Complete the private native screen on the tablet within two minutes using a confirmed 8–12 digit PIN. Store it securely. A fresh admin setup request can replace a forgotten recovery PIN. PINs never travel through the web page, API, heartbeat or audit record.
6. Refresh tablet status, then request **Enable permanent kiosk**. Existing commands have a two-minute issuance cooldown; allow the earlier setup request to age before issuing enable.
7. Verify Home, Overview, notification shade and Android Back cannot leave the app. Test the offline escape before putting the tablet into use.

## Maintenance and release

- Tap the top-right 48dp corner of the main kiosk screen **seven times within four seconds**. Enter the recovery PIN to open native maintenance.
- Offline PINs use a fresh 32-byte salt and PBKDF2-HMAC-SHA256 (150,000 iterations); five failures start a persisted, increasing lockout capped at 15 minutes. Rebooting does not erase the penalty. Recovery state is excluded from cloud backup and device transfer.
- Maintenance restores the previous lock-task packages/features and releases this app's managed Home selection for ten minutes. Android settings are accessible from the native maintenance screen. Return early with **Lock and return to kiosk**. Reboot ends the maintenance window. The watchdog returns the tablet after expiry, with a five-second polling interval.
- Admin can request **Unlock maintenance · 10 min** or **Turn off permanent kiosk** through the verified command path. Existing temporary-lock release remains independent.
- The power menu is retained for physical restart. A configured secure Android keyguard is respected. This does not disable hardware forced restart or bypass an Android PIN after reboot.

## Startup, scope and recovery

Permanent state persists locally and resumes without waiting for a server heartbeat. The managed Home role opens the existing app; `KioskAppBoundary` restores the saved driver/kiosk path. Boot recovery runs after user unlock, and after same-package upgrades. It does not read private pairing data before unlock, start tracking, or start a camera.

The foreground watchdog uses Android's device-owner `systemExempted` service type on API 34+. It runs only while the explicitly enabled kiosk remains device owner. It leaves the screen asleep when display-off is chosen, gives foreground dialogs a grace period, and limits ordinary recovery launches to one per minute. Android's persistent Home selection and Lock Task are the primary enforcement; watchdog restarts remain subject to OEM power restrictions and do not override force-stop.

Fullscreen uses the current WindowInsets API on Android 11+ and immersive flags on older devices. MainActivity re-applies it after focus/resume. Android Back is intercepted only in enabled permanent mode. The app's own navigation, PIN entry, inspection and signature buttons retain their existing behavior.

All four new commands are fixed actions: `kiosk_prepare`, `kiosk_enable`, `kiosk_disable`, `kiosk_maintenance`. They retain admin-only issuance, recent capability/ownership checks, strong paired-device credentials, command expiry, requester-role revalidation, assignment binding and durable execution receipts. Neither arbitrary URLs nor PIN values can be supplied as native commands. Native code independently requires device ownership.

The feature applies to the combined Android kiosk package only. Passenger builds must continue to exclude the combined kiosk plugins and manifest; it is not a passenger-phone restriction.

## Release verification

Automated tests cover command authorization, old-install capability rejection, action-specific receipts, credential/assignment binding, status sanitization, default-off installation, native enrollment/maintenance deadlines, reboot invalidation, PIN hashing and offline lockout. These do not prove an OEM's SystemUI or taskbar behavior.

Before release, on the actual Android 10 tablet and kiosk phone verify: same-key upgrade preserves pairing and queued work; set/recover PIN; reject wrong PIN and throttle; Home/Overview/Back/shade/swipe gestures; keyboard and camera permissions; QR camera; USB permission/reader; sleep/wake; reboot and APK replacement; network unavailable; renderer/process recovery; maintenance expiry while Android Settings is open; permanent disable; and existing GPS/dashcam behavior. Do not promise a physical test has passed from unit tests alone.

Implementation reference: FreeKiosk upstream (MIT), reviewed commit f5a1ce367f02a7165b35b0a834af8e6e49f98050. This implementation uses TransitTrack's Capacitor bridge and existing verified commands; no upstream source files were copied.
