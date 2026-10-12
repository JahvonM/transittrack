# TransitTrack stability update — 12 October 2026 UTC

## Confirmed evidence
A recent filtered server-log sample contained 21 HTTP responses: 13 were 429 (8 entityAccess, 5 driverSession). This is a small sample, not a capacity benchmark. The exact platform quota and its scope remain unverified.

## Changes saved together
- Admin keeps one mounted console across its section routes, retaining request cache and avoiding subscription restarts on every tab change.
- Shared cooldown waits have a 45-second budget. A repeated cooldown exceeding the remaining budget reports a recoverable busy error; it does not send early or replay a mutation. This bounds cooldown waiting, not network request duration.
- Background entity polling yields to foreground reads, makes no immediate retry burst, and backs off after failures.
- Passenger directory opens without waiting for Admin fleet startup; its own reads are sequential, and failed card-ledger reads cannot become false no-card results.
- Activity and broadcast panels use supplied change events instead of fetching their lists again for each event.

## Validation
- Complete unit suite: 91 files, 789 tests passed.
- Clean Admin browser run: 7 tests passed (batch loading, health metrics, outage recovery, partial recovery, independent directory, activity update, retained navigation cache).
- Clean targeted passenger/kiosk browser run: 4 tests passed (unknown cards and throttling, pairing-link cleanup, nearby status, stale-location handling).
- Changed frontend lint, crash-guard lint and build passed.
- A larger browser run was contaminated by overlapping runners after a tool timeout; its clean failures were rerun separately. Do not present that run as an unqualified full-suite pass.

## Remaining verification
Publish the combined checkpoint through Base44 Builder and open a fresh app session. Confirm direct Passenger directory access, repeated Admin section changes, passenger Home/Journey/My card, driver tablet session, and a boarding tablet refresh. Read logs and request metrics for continuing 429s and measured durations. No live check-in, user edit, device revocation, credential rotation or live traffic stress test was performed.

If throttling persists, obtain the applicable Base44 quota and its scope before choosing a capacity change. Local mocks cannot establish hosted throughput or prove the whole live app is fixed.
