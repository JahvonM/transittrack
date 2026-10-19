# Verified admin tablet controls (2026-10-15)

> Current release status: [kiosk-release-status.md](kiosk-release-status.md) (18 October 2026). Earlier checkpoint results below are historical.

Status: implemented and checkpointed for the combined Android kiosk build; not physically accepted or released. Keep the existing helper and FreeKiosk. Install once at final handover.

## Admin experience

Admin → Operations → Kiosk tablets → Tablet controls:
- Test kiosk lock for ten minutes, then release automatically.
- Release only this app's own temporary test lock.
- Request restart, with a confirmation explaining the work/idle gates.
- Show waiting, expired, applied, blocked, failed, unknown or restart-requested results. A restart request is never labelled a confirmed restart.
- Manual status refresh uses the existing tablet-list read. There is no additional remote polling stream.

Buttons require reported integrated support and Android device ownership. A reported capability can become stale; native permission checks remain authoritative. No enrollment, reset or ownership transfer is performed.

## Authorization and delivery

`tabletControl` accepts admin requests, native claims and fixed completion receipts. Only the server creates the command ID, action, two-minute expiry, requester ID and original company/vehicle/kiosk assignment. The gateway exposes only `control_status`; neither the private command nor its requester authority can be edited through the gateway.

Existing heartbeats deliver an ID-only notice. Native `TabletControl.execute` receives only device ID, the existing device token and command ID. It independently posts to the fixed app HTTPS endpoint, verifies the returned ID/action/durations and refuses unverified commands. No JS-supplied action, role, URL, shell command or script authorizes an actuator. Normal TLS verification is retained, redirects refused, responses capped at 16KB and connection/read timeouts set to eight seconds. The existing token is used in memory over HTTPS, not persisted in the receipt ledger or diagnostics. Capacitor argument logging remains disabled.

Claims require a current device credential: active/paired device, token digest, unexpired credential, pairing digest and matching company/vehicle/type. There is no legacy-ID-only branch for these controls. The requesting user must still be an admin when native claims the command. Old development tablets and the legacy helper are otherwise unchanged.

Commands expire after two minutes. Retries do not extend the lock deadline. A completed command cannot be claimed again, and a duplicate receipt cannot rewrite completion. Server storage does not provide a transaction across simultaneous admin requests: do not claim distributed exactly-once execution or physical-device attestation.

## Native replay and recovery

A synchronized durable receipt ledger reserves the command before a side effect. Failed persistence blocks execution. Repeated or recovered requests return a stored outcome without running the action again. An interruption after reservation returns unknown/INTERRUPTED rather than guessing or retrying a power action. Pending receipts are forwarded on existing heartbeats after restart or a lost response. No extra network request is made when there are no pending receipts/notices.

The ledger retains up to 128 receipts for 24 hours. It never evicts fresh receipts to make room; a full or corrupt ledger blocks new actions. This is a gate within one app installation, not a distributed transaction across cloned installations.

## Bounded kiosk lock

- Device owner and Android 6+ required; ordinary screen pinning is not silently substituted.
- Refuse an existing lock or a package already allowlisted for lock task. Do not take over another kiosk policy.
- Save recovery information before changing Android policy.
- Require permission/capability for a native exact expiry alarm before starting.
- Use an elapsed-time wake alarm, app-native timer and persisted lease. A non-exported receiver removes this app from lock-task allowlisting independently of the webpage/network; boot recovery releases a saved test lease.
- Restore prior packages while preserving other packages subsequently added. Do not alter device ownership or another kiosk app.
- Foreground toast explains the temporary test. Timing is subject to Android/OEM scheduling; physical expiry, app-death, reboot and offline recovery must be tested before trusting it unattended.
- No permanent lockdown, remote wipe, ownership change or unrestricted remote console is provided.

## Restart safety

Native requires Android 7+, device owner, a foreground activity, a safety snapshot no older than ten seconds and at least three minutes without native interaction. Touch/key activity and direct NFC/Bluetooth input invalidate the native quiet period. A persisted reboot receipt also supplies a two-minute cooldown across process restart.

The page must independently report:
- Driver: PIN screen, loaded/online session, no open shift, tracking explicitly off and a numeric stationary speed.
- Boarding: locked idle screen, no code/card lookup, confirmation, form, settings or passenger list in use.
- All saved check-ins, jobs and GPS queues empty, including review/archive items. Unreadable storage blocks restart.

Other kiosk modes deliberately cannot assert reboot safety yet. No saved work is removed.

The server corroborates vehicle assignment, stationary speed, tracking off and no open shifts. Shift history is paged only during a restart claim, with a conservative cap of 1,000 rows; an incomplete check blocks restart. A server busy decision becomes a fixed TABLET_BUSY receipt so admin sees the block. Native checks again immediately before the Android call. These checks reduce interruption risk; they are not an atomic transaction with a driver starting work on another device.

Android's accepted reboot call is recorded as REBOOT_REQUESTED before invocation. A later check-in helps the admin inspect recovery, but it is not represented as proof the reboot completed.

## Validation

- Android compileDebugJavaWithJavac and testDebugUnitTest passed: 38 JVM tests, including eight new policy/ledger tests. Tests exercise parallel reservation, process-restart replay, persistence failure, bounded retention, clock rollback, device-bound receipt delivery, proof bounds and stale/busy safety.
- 54 targeted JavaScript/backend tests passed, including 13 new control-policy/bridge tests. Real endpoint handlers run against isolated synthetic stores; no live records are written.
- 18 targeted browser scenarios passed: seven admin/launch checks and eleven NFC/BLE/network/recovery/control checks. The new boarding scenario advances three minutes, proves saved work still blocks reboot safety, then checks idle-empty safety and invalidation on opening code entry.
- Production web build and crash-guard lint returned success; admin dialog screenshot inspected.
- Broader security suite: 110 passed, 5 failed. Re-running the same three failing test files against the previous checkpoint commit b20bdde210d10440ab107aec887c2af7c8f09070 reproduced all five failures (33 passed, 5 failed). Existing release blockers: concurrent pairing, duplicate driver shifts, duplicate driver inspection parents, duplicate mechanic inspection results, and the concurrent crash-report email budget. These tests remain unchanged and failing; this checkpoint is not production approval.
- An unauthenticated invalid-input HTTPS route probe received an HTML 403 gateway response before the new function could be verified. Canonical Base44 API probe was likewise rejected. Direct native-to-server connectivity remains unverified from this environment and must be checked on the tablet; no bypass or weakened verification was added.
- No physical lock/reboot/enrollment commands were sent, no live device/account records changed, no APK signed/published and no signing keys generated/replaced.

## Final combined-device acceptance

1. Install the combined update with the existing package/signing identity; confirm pairing, queues, PIN flow and chosen kiosk mode survive.
2. Verify direct native verification reaches tabletControl with the existing paired key. Confirm denied/expired/wrong-assignment/non-admin requests cannot act.
3. On a nearby spare/idle tablet with the necessary already-authorized device-owner setup, run the bounded lock. Verify native expiry while offline, app process recovery and boot recovery; preserve another kiosk's configuration.
4. Check that reboot is blocked for active shifts, tracking/motion, open code/QR/signature/settings flows, queued/review work, corrupt storage, background activity and recent NFC/BLE/touch input.
5. Verify one idle restart, receipt recovery after reboot/lost response, and no repeat action for the same command.
6. Keep original helper/FreeKiosk until all required parity rows pass. Do not factory-reset or generate a replacement signing key as a shortcut.

Remaining work includes signed native update delivery, background/watchdog and SIM/carrier parity, separately authenticated visible screen/camera support, the separate passenger binary and release-blocking concurrency fixes. Web content updates and native APK updates remain distinct.
