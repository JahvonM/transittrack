# Security regression and release-readiness status

TransitTrack is pre-production. Step 7 first reproduced 33 failing release
criteria. The authorized remediation batch satisfied 12. Step 8 added five
additional criteria. The notification/booking follow-up now brings the strict
suite to 16 passing and 22 failing out of 38. The server-code issuance follow-up brings it to 21 passing and 17 failing out of 38. Step 8 audit is complete; the
first production release remains blocked. See step8-audit.md.
These are checks, not 17 distinct vulnerabilities.

Testing replaces the SDK with in-memory entities, fake sessions and captured
email calls. Browser tests intercept every API request. No live API attack,
account mutation, notification delivery or development-tablet revocation was run.
Application/backend/entity fixes were made during remediation; backend resources
auto-sync in Base44. The frontend was not published.

## Current results

| Command | Result | Meaning |
|---|---|---|
| npm test | 255 passed | Implemented behavior and recovery regressions |
| npm run lint | Passed | Source and tests |
| npm run build | Passed | Frontend compiles |
| npm run test:e2e | 13 checks passed | Mocked company/mechanic/tablet/recovery browser contracts |
| npm run test:security:release | 21 passed, 17 failed; exits 1 | Release blockers remain |

The strict suite uses ordinary assertions. Failures are not skipped, marked
expected, swallowed or treated as success. GitHub Actions has a separate
security-release-readiness job. Its actual execution and repository required-check
settings have not been verified/configured. A workflow is not an enforced gate.
No deployment workflow was added.

Default Playwright discovery includes only company-isolation.spec.js,
tablet-context.spec.js, saved-work.spec.js, message-notifications.spec.js and server-codes.spec.js.
Older live specs remain excluded.
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
| One-time code consumption | 1 | Interleaved consumers obtain grants from one code |
| Boarding grant use/card revocation | 2 | Another request can reuse a grant; revoked cards still board using an earlier grant |
| Concurrent mechanic inspection replay | 1 | Interleaved identical IDs create duplicate result rows |
| Concurrent check-in/shift/driver inspection/GPS | 4 | Duplicate rows and older live-position overwrite |
| Atomic public crash email budget | 1 | Twenty interleaved reports capture twenty emails despite budget five |

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
| 1: permanent codes | New codes are twelve digits, checked against protected and legacy codes, and hashed for both User and Contact. Legacy plaintext, lifetime, global budget and atomic uniqueness remain |
| 2: legacy device login | Deliberate development exception; needs authorized migration before release |
| 3: concurrent pairing | Unresolved; atomic storage guarantee needed |
| 4: pairing rules in UI | Server issuance, expiry and security-field restrictions implemented; throttle and atomic uniqueness remain |
| 5: attempt-limit races | Unresolved; failure/success policy and backoff also need design |
| 6: weak join codes | Server-issued twelve-character codes with expiry; multi-account budget and atomic uniqueness remain |
| 7: OTP/grant reuse | Unresolved; completed retries must still safely acknowledge |
| 8: maintenance recipients | Fixed with approved membership selection; isolated email assertions pass |
| 9: advertisement ownership/drafts | Policy decision; public reads and authorized admin/company writes retained |
| 10: PIN reset | Fixed with credential-bound grants; old grants require online PIN unlock |
| 11: 30-day membership | Availability/policy decision; renewal or permanent approval not chosen |
| 12: passenger audit-log writes | Policy decision; actor attribution remains server-controlled |
| 13: mechanic deletion rights | Policy decision; global maintenance visibility preserved |

Step 8 confirmed stale push-recipient selection, dispatch notification mismatch,
public crash-email budget races and non-taxi booking acceptance. Follow-up fixes
now satisfy the two recipient checks, dispatch check and taxi check. The crash
email budget still fails. Real push delivery and trustworthy scheduler identity
remain unverified. See step8-audit.md for historical evidence and follow-up status.
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


## Notification and booking follow-up — 2026-10-04 UTC

Four additional strict criteria now pass. Both chat recipient selectors (and SOS
through the driver selector) resolve current User roles and active approved manager
memberships; historical PushToken roles/company fields do not authorize delivery.
Recipient queries paginate and fail closed if the 10,000-row bound is reached or
lookups fail. Eligible admins and global mechanics remain reachable, and promoted
users do not need old token role metadata to match their current role.

notifyAdminMessage now accepts message_id. It fetches the current actor, verifies
saved message ownership/channel/vehicle scope, and derives notification content
from server records. Company/staff/mechanic text and media callers pass the ID
returned by the message write. A missing/deleted/foreign message cannot trigger
an arbitrary notification. Taxi booking validates eligible taxi service, action,
required strings and optional paired coordinates; signed-in non-members may still
book an actual public taxi operator. No publication or live mutation was performed.

36 new baseline unit tests cover legitimate routing, stale recipients, membership
expiry/code changes, fail-closed lookup, forged notification fields, ownership,
channel/tenant scope, media and taxi validation. Three mock browser checks cover
text/photo notifications from all three client chat screens, alongside the eight
existing checks. Voice-note metadata is covered in a backend test; the live
microphone/FCM path was not exercised. Lint/build pass.

Limits: recipient checks are current snapshots, not atomic with FCM delivery.
Deletion/demotion after authorization cannot retract an already submitted push.
Token rows were not deleted and tablets were not revoked. Valid message IDs can
still replay notification requests: no atomic notification claim/budget was added.
Taxi booking abuse limits/idempotency and anonymous crash-email limits remain
future work. Backend functions auto-sync; older unpublished client versions using
raw notification text are refused by the new endpoint while stored chat messages
still work. Coordinate client rollout before real tablet/operator use.


## Server-controlled code issuance follow-up — 2026-10-04 UTC

Five additional strict checks pass: pairing expiry, blocked pairing-field writes,
blocked weak company-code writes, permanent keypad strength and protected-code
collision rejection. The strict suite is 21 pass / 17 fail (38 checks), exit 1.
This does not solve concurrent issuance, pairing claims, attempt-limit races or
one-time/grant consumption.

manageAccessCodes fetches the current actor and requires admin or an active
approved manager membership for the target company. It generates twelve-character
pairing codes (15-minute expiry) and company join codes (30-day new-join expiry).
The generic gateway rejects caller-controlled company code/expiry and device
pairing/expiry/paired/status fields. Company/device creation issues codes server-side.
Existing paired-device replacement requires explicit confirmation. Browser issuance,
revocation and reactivation controls use the protected function.

Both passenger issuance paths generate twelve random digits, check protected
fingerprints and legacy Contact codes, and store fingerprints in the protected
ledger. Reissuing a Contact clears its legacy plaintext code. Card directory
responses indicate whether a code exists without returning it. Lookup rejects
ambiguity between legacy and protected records; the keypad accepts twelve digits.
Collision queries are sequential checks, not a unique constraint or transaction.

No records were queried or rotated live. Existing paired tablet authentication
is unchanged, including the deliberately retained ID-only development exception.
Old unpaired short/no-expiry pairing codes require operator reissue before pairing.
Old company codes lacking a future expiry cannot authorize new joins. Existing
code-bound memberships/context grants retain their own expiry when only join-code
expiry elapses; replacing the code invalidates those code-bound grants under the
existing policy. Explicit admin-approved memberships are unaffected by replacement.
Legacy Contact plaintext codes remain until individually reissued; no bulk migration
was performed. Permanent passenger codes still need a lifetime/rotation policy.
Company join codes remain server-stored and are returned only to authorized
admin/company operators for sharing; mechanics/passengers cannot read them.

255 unit tests (21 new issuance checks), 13 mocked browser checks, lint/build pass.
No live account changes, actual tablet revocation, production credential rotation,
signing keys or frontend publication. Backend/entity files auto-sync; older browser
code-management writes now fail closed, so client rollout must be coordinated.


## Atomic storage verification — 2026-10-04 UTC

The pinned backend SDK exposes updateMany with conditional queries and update
operators. This is a candidate for existing-record claims and bounded counters;
its cross-request atomicity remains unverified. No concurrency criteria were
cleared. See atomic-storage-verification.md for exact evidence, SDK version
boundaries, prepared platform questions and remaining recovery/uniqueness needs.
This review changed documentation only; no live mutation probes or SDK upgrades.
