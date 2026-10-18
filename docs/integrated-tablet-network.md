# Integrated kiosk network controls

Part of the combined final kiosk update; the user will publish/install once at final handover. No tablet permissions, Wi-Fi networks, hotspot state, device ownership, live accounts/records or signing identities were changed during implementation. Backend/entity resource changes sync through the normal Base44 workflow; no frontend publish or signed APK was produced.

## Supported paths and limits

| Action | Integrated behaviour |
| --- | --- |
| Wi-Fi scan | Explicit permission setup; Android Location must be on. Fresh scan results only, at most 25 unique SSIDs, throttled to one request per 30 seconds. Android can impose stricter scan limits. |
| Wi-Fi join / power | Classic APIs only when device-owner/system-app privileges or an older Android API permit them. Standard Android 10+ installations report blocked and offer Android settings. No enrollment, permission bypass or reset is performed. |
| Hotspot | Opt-in, best-effort OEM Android 10 tethering adapter reused from the helper. Needs Modify system settings and firmware support; other versions report unsupported. No global hidden-API policy is changed. |
| Keep hotspot on | Runs while integrated management is enabled, the driver screen is active and the app is foreground. Checks every 30 seconds; requires observed On before confirming. Stops retrying after two failed policy attempts. Not a background service or permanent-hotspot guarantee. |
| Low battery | At 5% unplugged, attempts to stop an observed hotspot this policy manages. Unknown/failed stop is reported honestly. Resumes at 8% or on power, subject to OS permission/confirmation. Does not control a hotspot it did not manage. |
| Turn policy off | Stops maintaining the hotspot; current hotspot power is left unchanged. Does not claim the old helper's ignition/depot policy exists natively. |

A passive DeviceAdminReceiver is declared for a separately authorized managed-device setup. Installing does not activate device admin, device owner or lock task. Device-owner enrollment may be unavailable on an already configured tablet and may involve destructive provisioning; no provisioning/reset commands are included in this checkpoint.

## Local tablet UI

Driver Tablet & reader and bus-PIN-gated boarding settings include Integrated Internet controls. Off by default. Provides explicit scan-access permission setup, scan list, supported join/power controls, Wi-Fi settings, driver hotspot policy and special-permission/settings shortcuts. Normal passenger builds without this plugin do not show the panel.

Stop the old helper's network automation before enabling native management. Keep the helper/FreeKiosk installed for remaining parity and rollback. Legacy command transport still works where its page key/FreeKiosk integration is available; this checkpoint does not make the old helper inject its key into the new native WebView.

Local Wi-Fi passwords are sent directly through the native bridge, cleared from the form, never put into localhost URLs or application storage, and saved as network credentials only by Android when adding a new network. Existing saved credentials are reused, not overwritten; update an existing password in Android settings.

Managed join observes the selected network ID/supplicant completion for up to 45 seconds. Failure removes only a newly created configuration and requests the previous network again; reconnection is not guaranteed. Previously disabled unrelated networks are not enabled. A connected result means Wi-Fi association, not confirmed internet access.

## Admin commands and completion

- Existing kioskNetwork endpoint remains admin-only. Tablet type checks and authenticated delivery of Wi-Fi passwords remain unchanged.
- Native enabled: typed in-process commands; no extra remote endpoint or localhost listener.
- Native disabled/unavailable: existing keyed helper path remains. Without the helper key it is not falsely acknowledged.
- Same-ID concurrent handoffs share one execution; bounded completion caches avoid sequential replay. Native completion cache is memory-only, not a platform transaction or cross-restart guarantee.
- Ack includes only matching command ID and a fixed result code. Backend maps known codes to server-owned applied/blocked/failed messages, checks action compatibility and hotspot desired value, then deletes the command/password. Tablet-supplied messages/extra fields are ignored.
- Legacy ack remains delivered (receipt only). Admin wording does not equate delivery with connection.
- Native network metadata uses the existing heartbeat. Readiness, current Wi-Fi, scans/join results, hotspot observed state and desired policy are allowlisted. Fresh disabled state wins over an older enabled snapshot.
- No new backend polling stream was added; scans are explicit. Local state broadcasts/watchdog are not network polling.

## Native log privacy

Installed Capacitor's Bridge.callPluginMethod logs methodData in debug mode. The Android source config now sets loggingBehavior to none, and the synced Android asset is checked by a regression test. This avoids Wi-Fi passwords and other native payloads entering Capacitor bridge logs in debug installs. Fixed app diagnostic codes and Android runtime crash reporting remain available. This is not a general guarantee that OEM/system Wi-Fi logs never contain network metadata.

## Validation

- Actual Android debug Java compilation and unit-test task passed, including four new input-policy tests and existing power/BLE/NMEA/tap/USB policy tests.
- 46 targeted JS/backend tests passed: native handoff/concurrency/ack matching, fixed server result text, health sanitization, explicit permission calls, source/synced log configuration, legacy compatibility, actual heartbeat handlers and admin-only authorization.
- Nine isolated mocked browser scenarios passed: integrated permission/scan/settings, managed local join/password clearing, remote completion on the existing heartbeat, NFC acceptance/retry/rejection, Bluetooth acceptance/duplicate/rejection/PIN gate and startup recovery.
- Production web build, changed-file ESLint and whitespace checks passed. Network settings screenshot inspected.
- Tests use mocked APIs/native bridges or isolated stores. Physical managed Wi-Fi/OEM hotspot behaviour is not verified.

## Final tablet acceptance

After the single combined install, confirm:
1. Existing NFC/GPS/boarding behaviour before stopping old automation.
2. Native management remains off until explicitly selected.
3. Scan permission and Location status produce useful results or a clear blocked status.
4. On a standard Android 10 tablet, direct join/power must say blocked; do not label it connected. Android settings remain usable.
5. On a separately provisioned supported managed tablet, test a successful join, wrong password, vanished network, previous-network rollback and saved disabled-network preservation.
6. Driver hotspot grant: verify actual On, denied/unsupported state, retry backoff, Android idle timeout, unplug/charge transitions and app background/foreground.
7. Admin sees matching applied/blocked/failed result; expired/disconnected commands and all Wi-Fi passwords disappear as designed.
8. Reboot, offline/captive-portal and OEM cases still require device testing. Keep old helper and FreeKiosk until required parity passes.

Remaining scope includes SIM/carrier health, background service/watchdog policy, full managed lockdown/reboot/remote support, signed update delivery and physical validation. Wi-Fi/hotspot access depends on OS privileges; adding a UI cannot confer them.

References:
- https://developer.android.com/develop/connectivity/wifi/wifi-scan
- https://developer.android.com/reference/android/net/wifi/WifiManager
- https://developer.android.com/reference/android/net/TetheringManager
