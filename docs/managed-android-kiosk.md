# Managed Android kiosk (app 1.7, build 8)

Adds persistent Android Lock Task, managed Home selection, lifecycle fullscreen, boot/update recovery, an owner-only watchdog, and private native offline maintenance to the combined driver/boarding/signing APK. Existing web caching, pairing, saved uploads, USB readers, GPS and camera ownership remain in their existing components.

## Installation and first setup

1. Build/install the combined APK as a same-package, same-signature upgrade. Do not uninstall, clear app data, or generate a replacement signing key. Installing build 8 does not enable permanent locking automatically.
2. Confirm Android 8+ and that **this app** is device owner. Device admin alone is insufficient. If FreeKiosk is device owner, plan a managed-device handover; this implementation never removes another owner's management or resets a device.
3. On the tablet, tap the native gear in the top-right corner. Set and confirm an 8–12 digit exit code, or enter the existing recovery PIN. Store the code securely. This flow works offline and requires no web dashboard request.
4. Choose **Start kiosk mode**. Verify Home, Overview, notification shade and Android Back cannot leave the app. Tap the gear and verify the code opens settings and **Exit kiosk mode** releases the lock. Test this offline before putting the tablet into use.
5. For driver hotspot startup, enable **Start hotspot automatically** in the same protected native settings and grant **Modify system settings**. Confirm actual hotspot power and connectivity, then test a reboot. See the device-support limits below.

Optional remote administration retains the existing `tabletControl`, `driverSession`, and `kioskHeartbeat` functions from app 1.6. No backend change or SQL migration is needed for 1.7. Admin setup/recovery requests still open the private native screen for two minutes and can replace a forgotten exit code. PINs never travel through the web page, API, heartbeat or audit record.

## Maintenance and release

- Tap the native gear and enter the exit code to open settings. The original top-right corner shortcut (**seven taps within four seconds**) also remains available.
- Offline PINs use a fresh 32-byte salt and PBKDF2-HMAC-SHA256 (150,000 iterations); five failures start a persisted, increasing lockout capped at 15 minutes. Rebooting does not erase the penalty. Recovery state is excluded from cloud backup and device transfer.
- Maintenance restores the previous lock-task packages/features and releases this app's managed Home selection for ten minutes. Android settings are accessible from the native maintenance screen. Return early with **Lock and return to kiosk**. Reboot ends the maintenance window. The watchdog returns the tablet after expiry, with a five-second polling interval.
- Admin can request **Unlock maintenance · 10 min** or **Turn off permanent kiosk** through the verified command path. Existing temporary-lock release remains independent.
- The power menu is retained for physical restart. A configured secure Android keyguard is respected. This does not disable hardware forced restart or bypass an Android PIN after reboot.

## Startup, scope and recovery

Permanent state persists locally and resumes without waiting for a server heartbeat. The managed Home role opens the existing app; `KioskAppBoundary` restores the saved driver/kiosk path. Boot recovery runs after user unlock, and after same-package upgrades. It does not read private pairing data before unlock, start tracking, or start a camera.

The foreground watchdog uses Android's device-owner `systemExempted` service type on API 34+. It runs only while the explicitly enabled kiosk remains device owner. It leaves the screen asleep when display-off is chosen, gives foreground dialogs a grace period, and limits ordinary recovery launches to one per minute. Android's persistent Home selection and Lock Task are the primary enforcement; watchdog restarts remain subject to OEM power restrictions and do not override force-stop.

Fullscreen uses the current WindowInsets API on Android 11+ and immersive flags on older devices. MainActivity re-applies it after focus/resume. Android Back is intercepted only in enabled permanent mode. The app's own navigation, PIN entry, inspection and signature buttons retain their existing behavior.

All four existing remote commands are fixed actions: `kiosk_prepare`, `kiosk_enable`, `kiosk_disable`, `kiosk_maintenance`. They retain admin-only issuance, recent capability/ownership checks, strong paired-device credentials, command expiry, requester-role revalidation, assignment binding and durable execution receipts. Neither arbitrary URLs nor PIN values can be supplied as native commands. Native code independently requires device ownership.

The feature applies to the combined Android kiosk package only. Passenger builds must continue to exclude the combined kiosk plugins and manifest; it is not a passenger-phone restriction.

## Release verification

Automated tests cover command authorization, old-install capability rejection, action-specific receipts, credential/assignment binding, status sanitization, default-off installation, native enrollment/maintenance deadlines, reboot invalidation, PIN hashing and offline lockout. These do not prove an OEM's SystemUI or taskbar behavior.

Before release, on the actual Android 10 tablet and kiosk phone verify: same-key upgrade preserves pairing and queued work; set/recover PIN; reject wrong PIN and throttle; Home/Overview/Back/shade/swipe gestures; keyboard and camera permissions; QR camera; USB permission/reader; sleep/wake; reboot and APK replacement; network unavailable; renderer/process recovery; maintenance expiry while Android Settings is open; permanent disable; and existing GPS/dashcam behavior. Do not promise a physical test has passed from unit tests alone.

Implementation reference: FreeKiosk upstream (MIT), reviewed commit f5a1ce367f02a7165b35b0a834af8e6e49f98050. This implementation uses TransitTrack's Capacitor bridge and existing verified commands; no upstream source files were copied.

## Tablet-local controls — app 1.7 / build 8

The tablet now has a native gear button in the top-right corner, available even before the website loads or pairing completes. The existing seven-tap shortcut remains. Tablet settings → Kiosk lock & exit code also opens the same native screen on an updated APK.

First setup: tap the gear, set and confirm an 8–12 digit exit code, then choose **Start kiosk mode** on the tablet. No dashboard request, internet connection or server command is required for this flow. Existing saved recovery PINs remain the exit code; opening settings with an existing PIN always asks for it, even while permanent mode is off. Initial local setup cannot overwrite a saved code. An authenticated user can change the code, start/re-lock, exit kiosk mode or open Android settings. Local authentication expires after two minutes; managed maintenance remains bounded by the existing ten-minute native watchdog. Back returns to the app and ends maintenance. Device-owner access is still required by Android for full Lock Task enforcement.

Fullscreen is applied natively at startup, before JavaScript loads; WebView route cleanup cannot expose navigation bars. On older Android, revealed system bars are hidden again through a native visibility listener. Lock Task enforces Home/Overview/notification restrictions; transient/OEM SystemUI still requires physical-device acceptance. The user is shown actual lock state and any Android error when starting it.

### Driver hotspot at boot

The previous network plugin stored the hotspot switch but not the driver mode, and its watchdog required a foreground driver page. App 1.7 saves that mode and starts an owner-only native hotspot service from boot, package replacement and app opening. Saved startup policy runs only for an opted-in driver tablet with integrated controls enabled. Boot does not enable a hotspot on boarding or unconfigured devices.

A local **Start hotspot automatically** switch appears in the native settings for driver mode, with an Android **Modify system settings** permission shortcut and live actual status. The requested policy is saved independently of successful activation. Permission failures, low battery, unsupported APIs and an unconfirmed start remain visible, rather than being reported as On. The service pauses at the existing low-battery threshold, retries failed starts at thirty-second intervals, and stops after three failed attempts. Reopening the app retries an opted-in policy. Disabling automatic maintenance leaves current physical hotspot power unchanged, matching the existing network controls.

This uses the existing Android-10 OEM tethering path. It does not manufacture Android's privileged tethering permissions or bypass an OEM/carrier restriction. Device-owner access alone does not guarantee tethering support. Verify first on the actual tablet: grant Modify system settings, enable startup, check On, reboot offline and confirm a second device can join and use mobile data. Repeat with the screen off, low battery/charging and the option disabled. Pairing, GPS leases and stored work are retained by a same-key APK upgrade.
