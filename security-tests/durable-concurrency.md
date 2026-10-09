# S06 — durable concurrency foundation

Status: implementation prepared; NOT activated. Existing application release blockers remain open.

The existing Maps serialize only requests inside the same JS module instance. They do not survive worker restarts and do not enforce a shared budget across workers. A new strict regression uses twenty separately evaluated backend modules against shared storage to expose that gap.

## Prepared files

- `infra/postgres/001_attempt_budget.sql`: unique policy and reservation identities, a PostgreSQL row lock, rolling-window accounting using database time, and replay of a reservation decision using an immutable backend request UUID. Private schema and no browser-role execution privileges.
- `base44/shared/durableAttemptBudget.ts`: HTTPS Supabase RPC transport, hashed scope keys, explicit backend credential configuration, timeout and fail-closed handling. It never falls back to a local mutex. This module is not yet imported by active handlers.
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
