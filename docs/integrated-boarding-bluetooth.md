# Integrated kiosk Bluetooth boarding

Implemented in the Android kiosk app, off by default. The separate helper remains installed for remaining parity features. No live tablet, pairing, account or passenger record was changed during implementation.

## Behaviour

- Boarding screen only: BusBoardingKiosk installs its native event listener before declaring readiness and supplies the current assigned bus name. Driver, job-signing, chooser and passenger screens do not start this receiver.
- Enable from the existing bus-PIN-protected boarding settings (hold the top company/status bar for three seconds, enter the bus PIN). Includes status, retry and Android Bluetooth settings.
- Android 12+ requests Nearby devices advertise/connect permissions only after the switch is enabled. Android 10 uses the declared legacy Bluetooth permissions. This receiver does not scan, request location for Bluetooth or silently turn Bluetooth on.
- Existing service UUID 7a1c0d3e-5b6f-4c2a-9e41-2f7d8b6a1c01 and writable code characteristic ...1c02 are unchanged. Current passenger phone clients remain compatible.
- Bus name is printable ASCII, at most 24 characters, with TransitTrack bus fallback. Android uses its adapter name in the scan response; enabling can rename the tablet's Bluetooth adapter. Original name is restored best-effort when disabled/destroyed if the adapter still has the app-assigned name. Process termination may prevent restoration.
- Waits for the local name and successful GATT service registration before advertising. Per-session callbacks are invalidated on stop. No late callback can restart a stopped receiver.
- Stops advertising and discards partial writes when backgrounded or when the boarding page leaves. Resumes while enabled, foreground and ready; adapter-state changes trigger recovery. There is no background service or boot recovery in this checkpoint.
- A Bluetooth transport acknowledgement means the code was delivered locally. It does not mean the passenger boarded or the server approved it.
- The existing lookup_code call verifies the credential, then shows Boarding/Exiting confirmation. The existing check-in/offline queue implementation remains authoritative.
- A rejected Bluetooth code now shows an error instead of leaving the message hidden behind the locked tap screen.
- Bluetooth state is in the local native health snapshot/settings. Remote Bluetooth telemetry was not added.

## Transport bounds

- Codes must be printable ASCII, begin tt-code:, have a nonempty payload and fit within 200 bytes.
- Prepared/long writes require contiguous offsets. A bad chunk discards the partial buffer; cancel, disconnect, expiry and stop clear it.
- At most eight partial messages, each expiring after 10 seconds.
- Complete message attempts, including malformed complete messages, share a synchronized 20/minute budget and a three-second per-phone gap. These are local in-memory transport limits, not replacements for backend limits or persistent limits across process restarts.
- Native events contain random delivery IDs and timestamps. JS rejects stale/future/malformed deliveries and ignores repeated IDs using a bounded, expiring in-memory set.
- No codes, phone addresses or GATT payloads are logged, added to diagnostic events or saved to disk.

## Android / hardware acceptance

1. Publish the frontend in Base44; pull the repository on the existing PC, run npm run build and npx cap sync android, then Android Studio Run using the existing signing identity. Do not uninstall or clear storage.
2. Keep the old helper installed. Stop its Bluetooth receiver (or stop the separate helper for this test) before enabling the integrated receiver, to avoid competing advertisements.
3. Enable Android Bluetooth, then enable integrated Bluetooth boarding in the PIN-gated settings. Accept Nearby devices on Android 12+ if requested.
4. Confirm status Ready as the assigned bus name. If the tablet cannot advertise BLE, it must say so; use NFC/QR/code instead.
5. From a passenger phone choose Board by Bluetooth, select this bus, and verify the correct name appears on the tablet. No check-in should occur until Boarding/Exiting is tapped.
6. Try a rejected code, expired credential, two phones, and a code longer than the negotiated ATT payload to exercise long writes.
7. Background/wake the tablet, switch Android Bluetooth off/on, leave/reopen the boarding page and restart the app. Confirm advertising stops/resumes appropriately with no duplicate check-in.
8. Disable integrated Bluetooth, restart the old helper if required, and confirm existing NFC/GPS workflows still work.

These physical checks are still pending. Cheap Android tablets may support Bluetooth scanning without supporting peripheral advertising.

## Validation

- Actual Android debug Java compilation and unit-test task passed. Eight new protocol tests cover syntax/size, long writes, bad offsets, cancel/disconnect/expiry/stop, bounded peers, sliding minute/phone limits, concurrent admission and bus naming.
- 21 targeted JavaScript tests passed: six receiver bridge tests, nine existing phone Bluetooth tests and six kiosk launch tests.
- Six mocked browser cases passed: accepted Bluetooth with duplicate event and explicit boarding confirmation; rejected/expired Bluetooth; PIN-gated toggle/retry/settings/route cleanup; existing NFC success/retry, NFC rejection and reader/health settings.
- Production web build, changed-file ESLint and whitespace validation passed. Settings screenshot inspected.
- Tests use isolated mocked API calls and native bridge mocks; no live check-ins or accounts were created. No APK was signed or published.

## References

- https://developer.android.com/develop/connectivity/bluetooth/bt-permissions
- https://developer.android.com/reference/android/bluetooth/BluetoothGattServer
