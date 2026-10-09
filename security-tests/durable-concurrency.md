# S06 — durable concurrency foundation

Status (9 October 2026): shared reserveAttempt request budgets activated in seven backend handlers. Specialized wrong-PIN/wrong-code counters and application write recovery are not migrated. Existing application release blockers remain open.

The existing Maps serialize only requests inside the same JS module instance. They do not survive worker restarts and do not enforce a shared budget across workers. A new strict regression uses twenty separately evaluated backend modules against shared storage to expose that gap.

## Prepared files

- `infra/postgres/001_attempt_budget.sql`: unique policy and reservation identities, a PostgreSQL row lock, rolling-window accounting using database time, and replay of a reservation decision using an immutable backend request UUID. Private schema and no browser-role execution privileges.
- `base44/shared/durableAttemptBudget.ts`: HTTPS Supabase RPC transport, hashed scope keys, explicit backend credential configuration, timeout and fail-closed handling. It never falls back to a local mutex. Active shared request budgets import this transport through configuredAttemptBudget.ts and atomicOps.ts.
- `tools/postgres-budget-check.mjs`: integration acceptance against a disposable localhost PostgreSQL database. Separate processes/connections race twenty attempts; tests retries/recreated callers, policy conflicts, window expiry, and denied browser roles.
- `.github/workflows/atomic-storage.yml`: runs that database acceptance check against PostgreSQL 16.

## Required setup before activation

Create the dedicated Supabase project previously selected for TransitTrack. Apply the SQL migration to it. Configure `TT_ATOMIC_STORE_URL` and `TT_ATOMIC_SERVICE_ROLE_KEY` as Base44 backend secrets, never frontend VITE variables, source files or chat messages. Do not enable the adapter until the real service integration passes and the relevant handlers are migrated. The current adapter supports hosted `*.supabase.co` origins only.

Scope keys must be derived by trusted backend code from operation/tenant/device or actor identity; they must not be accepted verbatim from anonymous clients. Each backend operation must keep the same reservation UUID when recovering an unknown RPC outcome. A retry must not execute downstream work twice merely because its prior budget decision is true. On budget storage failure, the endpoint must return a temporary-unavailable result before any protected side effect.

## Not solved by an external lock

A budget decision in PostgreSQL does NOT make a later Base44 write or email transactional. Unique pairing claims alone can strand a tablet after a crash; releasing a claim after an unknown outcome can duplicate credentials. Shift/inspection/boarding/GPS correctness needs canonical transactional records or a verified recoverable protocol, payload hashes, fencing and per-stage reconciliation. Never automatically reclaim an expired lock around an uncertain Base44 write.

Next implementation units: S01 recoverable pairing; S02–S04 unique canonical operation/result storage and recoverable child/photo writes; S05 backend budgets plus an email delivery outbox with explicit uncertain-delivery policy. Recheck credentials/company authorization at commit boundaries. No claim that all side effects are exactly-once should be made based on this foundation.

Migration preserves paired development tablets and saved work. No existing records, credentials, keys or APK signing identity are changed. Do not reset or re-pair devices as part of SQL setup.

Reservation rows require a reviewed retention and cleanup policy. Retain replay identities through the maximum supported retry period; pruning must never allow old request IDs to be replayed into fresh effects. Policy rows are retained as stable lock identities. No automatic deletion or dynamic limit change is included.

## Verification boundaries

Transport tests check the adapter contract, not deployed database atomicity. The real PostgreSQL acceptance check is a separate gate, not an in-memory emulator. Passing it does not establish hosted Supabase/Base44 connectivity, secrets configuration, endpoint integration, or crash recovery for application writes. S06 remains open until those checks and all affected handler migrations are complete.

Primary storage references: https://www.postgresql.org/docs/16/transaction-iso.html ; https://www.postgresql.org/docs/16/explicit-locking.html ; https://supabase.com/docs/guides/database/functions .

## Execution evidence — 8 October 2026, Grenada

- Adapter contract: 6 tests passed.
- Actual disposable PostgreSQL 15: independent-connection cap, recreated caller replay, policy conflict, browser-role rejection and rolling-window expiry all passed. Server was stopped after testing. No cloud/app records were used.
- Current app cross-worker regression: FAILED, 20 admitted against a five-attempt limit.
- Full strict suite: 39 passed / 6 failed / 45 total. Five existing failures remain; the additional failure is the newly covered cross-worker defect. No assertions were skipped or weakened.
- PostgreSQL 16 CI acceptance workflow is prepared; its remote GitHub execution has not been observed.
- At this historical checkpoint, hosted connectivity and runtime integration had not run.

## Execution evidence — 9 October 2026

- User applied the SQL migration and configured Base44 backend secrets. Hosted checkAtomicStore returned ok:true, accepted:5 of 20, replayStable:true, extraDenied:true. This proves the diagnostic connection and RPC behavior, not application side-effect recovery.
- Migrated shared reserveAttempt use in companyAccess, generateOneTimeCode, kioskCheckIn, driverSession, bookTaxi, busAssistant and notifyStaffPickup. Trusted backend scopes are namespaced and hashed; each incoming request gets a fresh UUID. Transport redirects retain that UUID. Unknown outcomes stop downstream work with 503; no entity or local fallback. A new client retry is a new charge, so an unknown committed reservation may conservatively consume budget.
- Separate handler workers and a recreated caller share the budget boundary: five accepted, fifteen denied, and an additional restarted caller denied. This handler fixture is synthetic HTTP storage; actual database atomicity evidence remains the separate PostgreSQL checks and hosted diagnostic.
- Missing secrets, publishable credentials, network/provider failure and invalid provider responses stop company verification with 503 and no grants/membership writes. Unsigned callers never reserve.
- Full strict suite: 68 passed / 5 failed / 73 total. Remaining failures: concurrent pairing, duplicate shifts, duplicate inspection parents, duplicate mechanic results, and public crash-report email cap. Assertions were not skipped or weakened.
- Driver wrong-PIN and kiosk wrong-code counters still use separate entity logic. Local createOnce/claimOnce/stamp helpers do not provide cross-worker guarantees. Production release remains blocked.
