# Security regression and release-readiness status

TransitTrack is pre-production. Step 7 first reproduced 33 failing release
criteria. The authorized remediation batch now satisfies 12; 21 still fail.
Step 8 remains paused. These are checks, not 21 distinct vulnerabilities.

Testing replaces the SDK with in-memory entities, fake sessions and captured
email calls. Browser tests intercept every API request. No live API attack,
account mutation, notification delivery or development-tablet revocation was run.
Application/backend/entity fixes were made during remediation; backend resources
auto-sync in Base44. The frontend was not published.

## Current results

| Command | Result | Meaning |
|---|---|---|
| npm test | 198 passed | Implemented behavior and recovery regressions |
| npm run lint | Passed | Source and tests |
| npm run build | Passed | Frontend compiles |
| npm run test:e2e | 8 passed | Mocked company/mechanic/tablet/recovery browser contracts |
| npm run test:security:release | 12 passed, 21 failed; exits 1 | Release blockers remain |

The strict suite uses ordinary assertions. Failures are not skipped, marked
expected, swallowed or treated as success. GitHub Actions has a separate
security-release-readiness job. Its actual execution and repository required-check
settings have not been verified/configured. A workflow is not an enforced gate.
No deployment workflow was added.

Default Playwright discovery includes only company-isolation.spec.js,
tablet-context.spec.js and saved-work.spec.js. Older live specs remain excluded.
Test outputs/traces are ignored.

## Remediation covered by the 12 now-passing release criteria

| Requirement | Passing checks | Result |
|---|---:|---|
| Queue recovery | 3 | Rejected check-ins/jobs are retained for review; independent work proceeds; rejected GPS batches split into individual retained failures |
| Targeted end-shift | 1 | Named shift only; old timestamps cannot close a newer shift |
| Photo acknowledgement | 2 | Upload failure returns 503; oversized/count-invalid photos fail validation before creating inspection records |
| Persistence before first send | 1 | Shift job is durable before network invocation |
| Legacy assignment | 1 | Queued replay without original assignment is rejected for review |
| Admin assignment metadata | 1 | Missing device plus expected_device_id returns a controlled error instead of 500 |
| GPS history scaling | 1 | Descending tenant/vehicle history stops outside the requested window; unrelated old history needs one read in the fixture |
| PIN reset | 1 | Driver unlock binds to protected credential version and is rejected after reset |
| Maintenance recipients | 1 | Approved active manager memberships select recipients; profile company_id is ignored |

New check-in, driver shift, driver-template and mechanic submissions persist their
request IDs and payloads before their first send. Eight additional recovery unit
tests cover exact persistence, storage failure, dependency ordering, retained
photos, export scrubbing, archive/remove boundaries and unchanged retry binding.
Three browser checks verify export/admin archive/removal and fresh role checks;
another verifies that driver unpairing preserves GPS with its original assignment.

Saved Work shows rejected originals and exports them with photos/answers retained
and known credential fields omitted. Archive requires an online admin, an export
and reconciliation acknowledgement. Archived originals remain exportable and stop
blocking dependent work. Removing archived copies requires a second export,
acknowledgement and confirmation. Original assignments/IDs are never rewritten to
make a rejected replay pass. No saved queue was cleared during this work.

401, 429, 5xx and network failures pause uploading. Item validation/authorization
4xx failures are retained for review. Corrupt/full browser storage is surfaced;
new work is not sent if persistence fails. Local-storage capacity can refuse large
photo submissions. Exports contain operational/personal information and photos;
they are recovery records, not anonymous data. Local in-flight guards do not solve
cross-tab storage races. Photo retries can leave orphaned/duplicate uploaded blobs
if an earlier partial attempt uploaded successfully. GPS history has a bounded
10,000-row inspection cap; dense windows return 503, not a false acknowledgement.
GPS's existing active-point thinning remains intentionally reduced detail;
reviewed/archived originals are not thinned.

## Remaining strict failures grouped by root cause

| Requirement | Failing checks | Evidence in isolated tests |
|---|---:|---|
| Atomic attempt limits | 4 | Concurrent requests exceed each reserveAttempt limit |
| End development ID-only authentication before production | 3 | Tokenless pre-cutoff tablets still authenticate; deliberate development exception |
| Exclusive pairing claim | 1 | Concurrent pairing requests succeed together |
| Server-controlled pairing rules | 2 | No-expiry short codes pair; managers can write pairing security fields |
| Strong company join codes | 1 | Manager can set ABCD |
| Permanent keypad strength/collision checks | 2 | Five-digit generation and duplicate protected credential fingerprints |
| One-time code consumption | 1 | Interleaved consumers obtain grants from one code |
| Boarding grant use/card revocation | 2 | Another request can reuse a grant; revoked cards still board using an earlier grant |
| Concurrent mechanic inspection replay | 1 | Interleaved identical IDs create duplicate result rows |
| Concurrent check-in/shift/driver inspection/GPS | 4 | Duplicate rows and older live-position overwrite |

Concurrency fixtures return snapshots and explicitly interleave vulnerable reads
before writes. They model a valid non-transactional schedule even with immediate
read-after-write consistency; they do not prove Base44's live scheduling/isolation.
Claim/read-back and append/count are not assumed atomic. A transactional fix needs
a documented guarantee and faithful atomic test adapter. Ten-character permanent
codes are a proposed minimum criterion, not a complete entropy/expiry design.
These tests do not prove exhaustive security.

## Independent review ledger

| Finding | Current status |
|---|---|
| 1: permanent codes | Unresolved; plaintext Contact storage/global failure budget also remain |
| 2: legacy device login | Deliberate development exception; needs authorized migration before release |
| 3: concurrent pairing | Unresolved; atomic storage guarantee needed |
| 4: pairing rules in UI | Unresolved; server issuance, expiry, throttle and uniqueness needed |
| 5: attempt-limit races | Unresolved; failure/success policy and backoff also need design |
| 6: weak join codes | Unresolved; server issuance and multi-account abuse budget needed |
| 7: OTP/grant reuse | Unresolved; completed retries must still safely acknowledge |
| 8: maintenance recipients | Fixed with approved membership selection; isolated email assertions pass |
| 9: advertisement ownership/drafts | Policy decision; public reads and authorized admin/company writes retained |
| 10: PIN reset | Fixed with credential-bound grants; old grants require online PIN unlock |
| 11: 30-day membership | Availability/policy decision; renewal or permanent approval not chosen |
| 12: passenger audit-log writes | Policy decision; actor attribution remains server-controlled |
| 13: mechanic deletion rights | Policy decision; global maintenance visibility preserved |

Push-token recipient freshness and trustworthy scheduler identity remain unverified.
Scheduled functions reject anonymous calls before reads/writes/email. Tests do not
validate an authenticated automatic schedule. Live inventories, live platform User
self-edit rules and direct-entity RLS tests remain outstanding. No test account was
created or modified. No signing keys or production credentials were generated or
rotated. Development device credentials were not revoked.

Before first production: resolve remaining strict failures, settle policy choices,
authorize legacy credential/device migration, configure verified scheduler identity,
review old queued work, then perform separately authorized live role/device tests
with verified accounts and cleanup. Backend changes and the unpublished frontend
need a coordinated rollout. Passing baseline tests do not establish release readiness.
