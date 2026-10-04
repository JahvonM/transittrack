# Step 7 security regression and release-readiness status

Step 7 adds tests, test configuration and documentation. Application functions,
entity permissions, live records, tablets, credentials and frontend publication
were not changed in this step. Testing is isolated: the SDK is replaced with
in-memory entities, fake sessions and captured email calls. No live API attack
or notification is performed.

## Commands and results

| Command | Result | Meaning |
|---|---|---|
| npm test | 178 passed | Current isolation, projection, credentials, offline recovery and other regressions |
| npm run lint | Passed | Source and new tests |
| npm run build | Passed | Frontend compiles |
| npm run test:e2e | 4 passed | Mocked company/mechanic/tablet browser contracts |
| npm run test:security:release | 33 failed; exits 1 | Known production requirements are not satisfied |

The strict suite uses ordinary assertions. Failures are not skipped, marked
expected, swallowed or treated as success. The separate GitHub Actions job
security-release-readiness runs it and should stay red until fixes satisfy it.
Repository branch protection/required-check settings have not been configured
or verified by this change; adding a workflow is not the same as enforcing a
merge or deployment gate. No deployment workflow was added.

Default Playwright discovery now includes only company-isolation.spec.js and
tablet-context.spec.js. Both intercept every API call with mocks. Older live
device specs are excluded, and need contract migration plus separately
authorized verified sessions before use. Test outputs/traces are ignored.

## Strict failures grouped by root cause

| Requirement | Failing checks | Evidence in isolated tests |
|---|---:|---|
| Atomic attempt limits | 4 | All 20 concurrent requests accepted with limit 5 in each reserveAttempt copy |
| End development ID-only authentication before production | 3 | Tokenless pre-cutoff tablets still authenticate; deliberately unchanged |
| Exclusive pairing claim | 1 | Five simultaneous pairing requests return success |
| Server-controlled pairing rules | 2 | No-expiry short codes pair; managers can write pairing security fields |
| Strong company join codes | 1 | Manager can set ABCD |
| Permanent keypad code strength and collision checks | 2 | Generator emits five digits and reissues a protected credential fingerprint |
| One-time code consumption | 1 | Five interleaved consumers get grants from one code |
| Boarding grant use and card revocation | 2 | Grant authorizes another request; revoked card still boards using earlier grant |
| PIN-reset revocation | 1 | Previously issued driver unlock remains valid after reset |
| Maintenance recipient membership | 1 | Manager approved for A receives B mail after profile company_id is B |
| Concurrent inspection replay | 1 | Five interleaved identical IDs create five mechanic result rows |

The concurrency fixtures return snapshots and explicitly interleave vulnerable
reads before writes. They model a valid non-transactional schedule even with
immediate read-after-write consistency; they do not prove Base44's exact live
scheduling, isolation or consistency guarantees. A burst without explicit
interleaving sometimes passes by luck. That is why the OTP and inspection tests
use barriers. No claim/read-back or append/count technique is assumed atomic.
A future transactional implementation must supply a faithful atomic test adapter.

The ten-character permanent-code test is a proposed minimum production criterion,
not a complete entropy/expiry design. These tests do not prove exhaustive security.

## Claude's 13 findings against this checkpoint

| Finding | Status | Coverage / remaining work |
|---|---|---|
| 1: permanent code strength/collisions | Reproduced in mocks | Two strict failures; plaintext Contact codes and company-wide failure budget also remain code-review gaps |
| 2: legacy ID login | Deliberate release exception | Three strict failures; migrate/re-pair only with explicit user authorization |
| 3: pairing race | Reproduced in mocks | Strict concurrent pairing failure; needs verified atomic storage |
| 4: pairing rules only in UI | Reproduced in mocks | Strict no-expiry and manager-write failures; missing pairing throttle/uniqueness also visible in code |
| 5: attempt-limit races | Reproduced in mocks | Four strict failures; success-attempt policy/backoff needs design |
| 6: weak join codes/account-only budget | Partly reproduced; remainder confirmed in code | Strict weak manager-code failure; multi-account abuse/global budget still needs design |
| 7: OTP/grants reusable after revocation | Reproduced in mocks | Three strict failures; completed Step 6 retries must still ACK without creating a new action |
| 8: maintenance recipients trust User.company_id | Reproduced in mocks | Captured emails show cross-company recipient; no actual email sent |
| 9: ad ownership and inactive drafts | Policy decision; behavior confirmed in code | User authorized public ads and admin/company writes; company ownership and draft visibility were not settled |
| 10: PIN reset leaves unlock valid | Reproduced in mocks | Strict grant revocation failure |
| 11: 30-day passenger membership | Availability/policy decision | Existing tests verify expiry enforcement; renewal or permanent admin approval requires a chosen policy |
| 12: passenger audit-log creation | Behavior confirmed in code; policy decision | Actor attribution is server-controlled; audit creation returns before role restriction |
| 13: mechanic deletes across companies | Behavior confirmed in code; policy decision | Central maintenance visibility was authorized; deletion policy needs an explicit decision |

Push-token recipient freshness and a trustworthy scheduled-job identity remain
unverified. The four scheduled functions reject anonymous calls before any data
read, job write or email; 20 new tests cover unauthorized roles and forged
scheduler/admin payloads. They do not validate an authenticated automated schedule.
Live credential inventories and live non-admin platform User/direct-entity rules
remain untested here. No test account was created or modified.

## Before first production

Resolve strict failures; settle advertisement ownership/drafts, mechanic deletion,
membership lifetime and audit-write policies; migrate legacy credentials/devices;
configure verified service authentication for scheduled jobs; review old queued
work lacking original assignment/replay identifiers; then run separately
authorized live role tests with verified accounts and reliable cleanup.
Do not infer production readiness from npm test alone.

Step 8 has not started.

## Step 6 independent-review follow-up

Rechecked the report against the latest repository, not only Claude's reviewed
690963f snapshot. Added offline-readiness.test.js with 14 additional ordinary
production assertions. All 14 fail for the reported reasons; the full strict
suite now has 33 failing checks. This is a larger coverage set, not 33 distinct bugs.

| Review gap | Added failing checks | Reproduced behavior |
|---|---:|---|
| B1: stuck queues | 3 | Expired boarding, rejected independent jobs and mixed old/fresh GPS prevent later uploads |
| B2: old end requests | 1 | An unsent old end closes a newer shift opened on another tablet |
| B4: photos | 2 | Failed upload or oversized photo is acknowledged with 200 |
| Persistence before first send | 1 | New shift payload is absent from persistent storage at its first invoke |
| Legacy assignment | 1 | Unbound legacy shift is accepted using current pairing |
| Admin assignment metadata | 1 | No device plus expected_device_id returns 500 |
| GPS history scaling | 1 | One-point batch requires 13 reads over 6,000 unrelated historical rows |
| B3: concurrent replay and GPS | 4 | Same-ID check-ins, shifts and inspection parents duplicate; older GPS overwrites newer |

The previous passing end-shift test was narrower: an exact request ID already
completed on the server is recognized. It did not cover an unsent old end event,
a different request ID, or another tablet opening a newer shift. Its name now
states that narrow guarantee.

The persist-before-send test confirms the shift path. Check-in, driver-template
and mechanic first-send persistence gaps remain confirmed by code review; those
UI crash cases need additional coverage when the persistence workflow is revised.
Photo-count caps and cross-user mechanic replay remain code-review gaps too.

These requirements do not mean blindly skipping every 4xx. Global authorization
errors and 429 throttling need backoff/re-authentication. Permanent item-specific
rejections need a visible recoverable quarantine/export workflow, and independent
work can continue without reordering dependent events. Rejected legacy work must
be preserved and resolved/exported before re-pairing; do not empty tablet storage
as a workaround. The GPS mixed-batch case must separate invalid/expired points
without silently deleting them.

No application fix was made in this follow-up. Production is still blocked.
The next remediation should address queue recovery/persist-before-send, targeted
shift closure, photo acknowledgement, bounded GPS history and the controlled
admin error, while atomic storage guarantees are investigated separately.
Step 8 remains paused.
