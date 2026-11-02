# Rollout plan

This update is the web app, the server functions and four additive database
changes. **No new kiosk APK is needed**: the tablets load the new screens
the next time they refresh. Existing pairing, PINs, kiosk settings and saved
offline work are kept.

## Already live

- The re-issued card fix (audit F18) went live on 1 Nov with the owner's
  approval: boarding tablets accept a card that was cancelled and issued
  again. All 3 active cards were affected.
- PR #16 was merged on 1 Nov (12:44 UTC) with the owner's approval. Checked
  afterwards: CI green on `main`; the four migrations applied (new columns
  and the `passenger_case` and `ride_exception` tables are present); all
  server functions redeployed at 12:45; Base44 synced, checkpointed and
  published. Not yet checked: the 15-minute device checks below, because no
  tablet had checked in since 30 Oct (the fleet was off). Do them when the
  first bus comes on.
- The follow-up items are on branch `more-updates` (see `FOLLOW-UP.md`).

## Stage 0: before merging

- Review the PR. CI must pass (Checks, Supabase readiness).
- Note the Cloudflare preview build fails on every non-`main` branch (audit
  F16, dashboard setting). Production builds from `main` are not affected.

## Stage 1: merge to `main` (owner approval)

What happens automatically:

1. Supabase applies the four migrations (`MIGRATIONS.md`). They only add
   columns, a table each for passenger requests and driver marks, and allowed
   values. Nothing is moved or deleted.
2. The Supabase functions deploy (GitHub action).
3. Cloudflare builds and deploys the web app.
4. Sync Base44 (github/sync, checkpoint, deploy), as for earlier releases.

Check within 15 minutes:

- Admin → Kiosk tablets: every tablet still shows recently seen; each shows
  a protection line.
- On one boarding tablet: tap a card. Tablet settings → Diagnostics shows the
  reader and card list.
- Admin → Passenger support opens; Fleet workspace opens.
- A passenger account: Home, My rides, Help.

Defaults keep today's behaviour: every reader stays **Boarding and getting
off (asks)**, no tablet needs an open shift, no camera is on.

## Stage 2: one bus for a week

- Pick one bus (St. Pauls, which has both tablets). Run `DEVICE-TESTS.md`
  on it and fill in the results.
- Turn kiosk lock on for that bus's boarding phone (Tablet settings →
  Startup → Kiosk lock & exit code) and confirm Admin says "active".
- Optional: set its reader to "Boarding only" if it is at the front door.
- Watch Passenger support and the Sign-in log for flagged taps.

## Stage 3: the rest of the fleet

- Turn kiosk lock on for the other tablets one at a time (Grenville driver
  tablet, both signing tablets). The T10 can't be locked until it is set up
  as a managed device.
- Set up boarding tablets for Grenville and St. George (they have none, so
  cards can't reach them).
- Only after the camera trial is tested on one tablet with the owner: use
  it more widely. A relay (TURN) may be needed on mobile networks; a view
  that says "Direct connection mode" has none.

## If something goes wrong

- **App problem**: redeploy the previous `main` commit (Cloudflare → Workers
  → transittrack → Deployments → roll back, and re-run the Supabase functions
  action on the previous commit). The new database columns can stay; older
  code ignores them.
- **Database**: only if the new columns must go, use the undo SQL in
  `MIGRATIONS.md`, after the app rollback.
- **A tablet**: nothing in this update changes a device remotely. If a
  tablet misbehaves, use its exit code and Tablet settings as usual. Don't
  factory-reset or re-pair unless the device itself requires it.

## Not changed by this update

The driver phone app's passenger list had no on-board status (the tablet
has it); the follow-up adds it (`FOLLOW-UP.md`). The T10's scanner, LED and
buzzer stay blocked on the maker's SDK. Journey sharing for regular staff rides was reviewed and not added (see
`AUDIT.md`, "Journey sharing").
