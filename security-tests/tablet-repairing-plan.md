# TransitTrack tablet re-pairing plan

Prepared 2026-10-04 UTC against c626800. Planning only: no tablet, account,
credential, queued item or live record was inspected or modified.

## Scope and current blockers

Use this plan for a separately authorized, supervised development-tablet migration.
Execution, frontend publication and removal of ID-only authentication are pending.
Atomic storage confirmation is on hold at the user's request. Pairing still has
a concurrent-consumption race; serial operator handling reduces accidental overlap
but does not fix that race or make the app production-ready.

The legacy branch accepts a paired active device with no DeviceCredential when
its creation timestamp predates 2026-10-03T23:35:39Z. All four copied authenticators
must be addressed together: pairKioskDevice, kioskHeartbeat, kioskCheckIn and
driverSession. Tokens already present are not bypassed by that branch.

Current new pairing: server-issued 12-character code, 15-minute expiry, device
token stored locally and only its hash stored in the protected ledger. Device
credentials expire after 90 days and bind company, vehicle, kiosk type and pairing
code fingerprint. Company passenger codes are permanent and independent of tablet
pairing codes.

## Before scheduling execution

1. Confirm authorization for the exact development tablets and maintenance window.
   Do not begin with every device at once. Choose one supervised pilot tablet.
2. Confirm the frontend/client build contains the protected pairing, Saved Work
   recovery and current backend request contracts. The frontend changes have not
   been published by this agent; coordinate rollout before migrating installed
   clients. Do not assume a backend checkpoint updates every installed client.
3. Prepare an operator inventory using metadata only. Have a human confirm each
   physical tablet's company, bus and kiosk type. No credential dump is needed.
4. Keep the tablet's device record and its existing company/vehicle/type during
   migration. Reassignment is a separate action with separate queue review.
5. Ensure the tablet can reach the app, has working browser storage, and the
   operator can access the authorized admin/company code-management screen.
6. Identify any open driver shift. Close and sync it under the original assignment
   before switching credentials, when operationally appropriate.

### Inventory template — fill during authorized execution

| Label / device ID | Company / vehicle / type | Installed build checked | Pending / review / archived work | Export verified | Re-paired + restart checked | Operator / time |
|---|---|---|---|---|---|---|
| Pilot — pending identification | Pending | Pending | Pending | Pending | Pending | Pending |
| Remaining tablet | Pending | Pending | Pending | Pending | Pending | Pending |

Record counts and status, not PINs, NFC UIDs, passenger codes, tokens or pairing
codes. Include retired/offline tablets; they must not be silently treated as migrated.

## For each tablet

1. Keep it on its original assignment and connect it to the internet.
2. Inspect Saved Work for check-ins, driver/mechanic jobs and GPS points. Let
   eligible work sync and verify acknowledgement. Export remaining originals
   before unpairing or replacing a pairing.
3. Verify the export exists, contains the expected item count/timestamps and retains
   inspection answers/photos when present. Store it privately; it contains
   operational and personal information even though known credentials are scrubbed.
   Do not paste exports into a public repository or support ticket.
4. Reconcile items needing review against saved server records through authorized
   screens. Do not resend them using invented IDs or a different assignment.
   Untagged legacy items must not be replayed under a newly paired tablet.
5. Require either no remaining pending work or a documented review/reconciliation
   disposition before proceeding. Archive/remove only through the existing
   exported/reconciled admin workflow, not by clearing browser storage.
6. In code management, confirm label/company/bus/type again. Request a new server
   pairing code immediately before pairing. Replacing an already-paired tablet
   requires explicit confirmation and disconnects its old pairing.
7. Unpair locally only when ready to reconnect. Avoid browser resets, app-data
   wipes, uninstalling the app or deleting device records. Existing unpair paths
   preserve queue stores; nevertheless, a verified export remains required.
8. Pair the one intended tablet, using the correct driver or kiosk screen. Do not
   share the code or attempt parallel pairing on another tablet. If it expires,
   request a fresh code; never extend expiry or set pairing fields directly.
9. Confirm company, vehicle and kiosk type from the server context, then restart
   the app/browser and confirm it reconnects. Pairing should not be considered
   complete merely because the first response returned success.
10. For driver tablets, perform a fresh online PIN unlock. Old driver/boarding
    grants can no longer authorize new actions after a pairing change. Obtain fresh
    boarding verification rather than editing a queued payload to force acceptance.
11. Mark the inventory entry complete only after the acceptance checks below.
    Move to the next tablet after the pilot is stable.

No active queue/grant should be assumed reusable simply because company and bus
are unchanged. Pairing-code binding changes during re-pairing. Rejected originals
must remain reviewable/exportable, and completed matching retries must still
acknowledge their existing record without creating another one.

## Acceptance checks — planned, not run

| Check | Expected result | Side effects |
|---|---|---|
| Heartbeat/context after restart with newly stored token | Correct company, bus and type | Heartbeat metadata may update |
| Newly tokenized device with only device ID | Denied | No business record should be created |
| Wrong/old token, changed assignment, revoked/expired credential | Denied | Negative checks need supervised test setup |
| Correct driver PIN after pairing | Fresh unlock; no PIN returned | Creates verification metadata |
| One designated synthetic boarding/shift/inspection flow | Works under correct scope | Requires separately authorized test records and cleanup |
| Completed same-ID retry | Acknowledged, no extra business row | Verify counts |
| Rejected old/untagged queue item | Retained for review; original binding preserved | Local review state can update |
| Mechanic/company permissions | Mechanics retain global maintenance access; no credentials; company scope retained | Role tests may need approved test accounts |

Do not run these live checks under this planning authorization. The negative
revocation/expiry/assignment checks can alter a device; use a designated test
device and obtain explicit execution authorization.

## Failure handling

- If local token storage fails, stop. Do not pretend that pairing succeeded or
  clear saved work. Check whether the server now considers the device paired.
- If a response is lost, do not launch concurrent retries or re-use a code on
  another tablet. An authorized operator can inspect paired status without
  exposing the token. If the token is lost, use the protected replacement
  workflow again only after preserving saved work.
- If the pilot fails acceptance, pause later tablets. Keep export and inventory
  status. Request a fresh supervised pairing when the cause is resolved.
- Do not restore tokenless ID-only access, publish a bypass, replace signing keys,
  or silently delete DeviceCredential rows as a rollback.
- If work cannot be safely reconciled, leave the tablet marked incomplete.
  An export is not automatic import or replay authorization.

## After all intended tablets are verified

Review unmatched offline/retired device records before removing the legacy branch.
A later code change must remove or permanently disable ID-only acceptance in all
four authenticators together. Run the three legacy-ID release assertions and
broader unit checks; they should become passing only when code actually rejects
legacy ID-only requests. Run separately authorized device tests before rollout.

Track the earliest 90-day token expiry and plan supervised renewal with the same
saved-work safeguards. No reminder, automation or credential renewal was created.

Even after migration, other concurrency blockers remain. The last strict suite
is 22 passing / 16 failing of 38; this planning document clears no release checks.

## Setup tool Update mode hardening (2026-10-04)

Update mode now requires a trusted locally supplied TransitTrack-Kiosk-Helper.apk
and the existing FreeKiosk PIN. It selects one USB tablet and binds all update
commands to its serial. Each ADB command exit status is checked; failures stop
the script. Older helper apps remain installed. FreeKiosk activity launch does
not establish configuration acceptance, so the operator must verify managed
apps and no PIN error before restarting. After restart, verify the expected
Helper version, fresh heartbeat, peripherals, pairing and Saved Work. No update
success is recorded before those checks. Setup logs no longer include pairing
codes; historical CSV files may still contain codes and were not modified.

Static control-flow/CRLF checks, lint and build passed. Windows CMD, Android,
wrong-PIN and failed-install device execution remain untested. No tablets were
changed, no signing keys generated, and no frontend publication performed.
This does not clear any of the 16 outstanding security release assertions.
