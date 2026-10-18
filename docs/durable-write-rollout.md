# Durable write rollout — 15 October 2026

Status: code prepared and isolated tests passing; hosted activation is NOT verified or enabled by this work.

## What changed
- Pairing: one permanent database claim for a device/code. Only the winner can issue a credential. Raw tokens are never stored in the receipt table or returned to losing callers.
- Driver shift start, inspection parents/children and mechanic replay records: request identity plus payload hash reserves one create operation across workers. Completed operations return the existing record; changed payloads conflict.
- Crash reporting: shared database budgets limit records, repeated messages and each actual email recipient. Unknown email delivery still consumes budget; automatic retries are not performed. Notification logs distinguish skipped from sent.
- Admin-only checkDurableWrites verifies a synthetic claim/completion in private storage without changing application/device records. It does not activate anything.

## Important limits
These receipts do not make Base44 and PostgreSQL one transaction. If a create commits but its response is lost, a later authorized request can reconcile the existing Base44 record. If no record can be proven, the receipt remains pending and the request returns 503. Do not delete/reclaim the receipt or reset saved tablet work to force a retry. Human reconciliation is required for a permanently uncertain operation. There is no automatic timeout takeover.

Pairing interrupted after claiming may require a new admin-issued code. No existing tablet was re-paired or revoked here. Different shift request IDs can still race to start separate shifts; this guard protects identical retry identities, not a transactional one-open-shift-per-bus invariant. Requests without replay IDs and other process-local helpers are not given blanket cross-worker guarantees. This is not full production approval.

## Prepared activation sequence — at final handover
1. Preserve current app data and the existing signing identity. Finish required kiosk coding first; do not install/reset tablets during this setup.
2. In the chosen development Supabase project, confirm 001_attempt_budget.sql is installed, then apply infra/postgres/002_operation_receipts.sql. This only adds private operation receipts/RPCs.
3. Keep TT_DURABLE_WRITES_ENABLED absent or false until verification. Existing backend TT_ATOMIC_STORE_URL and TT_ATOMIC_SERVICE_ROLE_KEY remain server-side; no replacement credentials are generated.
4. As an authenticated admin, invoke checkDurableWrites with POST and an empty object. Expect ok:true, accepted:1, total:5, replayStable:true, noAutomaticReclaim:true, applicationActivated:false. This creates one synthetic private receipt per invocation; no app records or email.
5. Pause new pairing/shift/inspection submissions and drain in-flight old requests before changing the flag. Otherwise a request already running without the guard could overlap a protected request.
6. Set the backend secret TT_DURABLE_WRITES_ENABLED to true only after the diagnostic passes. Invalid flag values fail closed. Verify the diagnostic now reports applicationActivated:true.
7. Exercise paired-device and approved mechanic flows with designated development records, including lost responses and retained offline work. Resume normal testing once verified.
8. Do not disable the guard or delete receipts to resolve an unknown write. Pause affected submissions and reconcile instead; reverting to unguarded writes can reintroduce duplicates.
9. Complete the one combined APK handover and physical acceptance separately. No keys, APKs, live account/device records or hosted database settings were changed in this stage.

The absent/false flag intentionally preserves the existing development write paths. Consequently four duplicate-write protections are NOT active merely because these files auto-sync. Crash-budget protection uses the already configured request-budget RPC and has no new activation flag.

## Evidence
- Full strict security suite: 131 passed / 0 failed, including the original five failures and new cross-worker, unknown-outcome, payload-conflict, recipient-budget and diagnostic cases.
- Security fixtures explicitly enable the staged write guard with synthetic credentials. Passing them is not evidence of hosted activation.
- 88 relevant notification/offline/recovery unit tests passed across the initial run and focused policy re-test. A formatting-sensitive policy test was satisfied without weakening its assertion.
- Production web build/crash guard passed.
- Disposable local PostgreSQL 15: 20 independent processes/connections produce one operation winner, no timeout/restart takeover, owner-bound immutable completion, and browser-role/table access denial. Null completion credentials are rejected. Existing request-budget checks also pass.
- The existing PostgreSQL 16 CI job now includes operation-receipt checks via tools/postgres-budget-check.mjs; remote CI execution has not been observed.
- No hosted diagnostic, migration, secret change, notification delivery or physical tablet action was executed.
