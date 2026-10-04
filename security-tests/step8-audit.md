# Step 8 — Pre-production security and reliability audit

Date: 2026-10-04 UTC. Application source reviewed: 67ed322.
Decision: NOT READY for the first production release.
Step 8's audit is complete; completion does not authorize publishing or certify
security. This step changes tests and documentation only. No application functions,
entities, live records, accounts, devices or credentials were changed in Step 8.

## Evidence and limits

Reviewed the scoped frontend client/gateway, custom entity schema permissions,
device authentication and tablet projections, protected PIN/OTP/company workflows,
role/account functions, notification paths, AI fleet projections, scheduled-job
authorization, saved-work/replay fixes and repository check configuration.
The current tracked-source signature scan found no matching private-key material,
GitHub-token or AWS-key signatures. Baseline tests also enforce absence of tracked
signing files and real environment files. This limited scan is not exhaustive,
does not scan git history and does not prove previously exposed credentials safe.
No replacement keys or rotations were performed.

Unit/strict tests use an in-memory SDK; notification/email integrations are captured.
Browser checks mock every API request. No real push, email, taxi trip or live role
attack was performed. Mocked interleaving proves code-level race possibilities,
not Base44's actual storage isolation. Live User self-edit/direct-entity rules,
credential inventories, scheduler identity, blob access controls and production
GitHub branch protection remain unverified. No production environment exists yet.

## Established boundaries

| Boundary | Reviewed result | Evidence |
|---|---|---|
| Mechanics across companies | Maintenance entities and Company are globally readable; vehicle writes limited to maintenance fields | entityAccess MAINTENANCE/visible/prepare; existing unit/browser tests |
| Mechanic credentials and privilege changes | Gateway strips credentials; protected ledgers omitted; privileged User edits and credential functions deny mechanic access | Credential projections and existing boundary tests |
| Approved company scope | Membership scope/expiry/code binding, not mutable profile company_id, determines gateway access | context/memberships/liveMembership; company isolation tests |
| Advertisement | Public reads retained; anonymous writes denied; admin/approved-company writes allowed | Entity RLS and all four anonymous write-operation tests |
| Direct custom entities | Admin-only read/create/update/delete except public Advertisement reads | Every custom schema checked; built-in User explicitly excluded |
| Maintenance email recipients | Approved active manager membership selects company recipients | Remediation captured-email test |
| PIN reset | Credential-version mismatch rejects an earlier driver unlock | Remediation grant test |
| Queue recovery | Original work persists before first send; rejection is reviewable/exportable; unpair preserves GPS | Recovery unit tests and mocked browser checks |
| Scheduled jobs | Anonymous/low-privilege requests rejected before reads or side effects | Existing 20 boundary tests; automatic scheduler compatibility unverified |
| Repository workflow | Separate strict release job with ordinary failing assertions; read-only workflow token permissions | checks.yml; required-check enforcement unverified |

Mechanics' maintenance visibility does not settle their deletion rights. Public
advertisement reads currently include inactive records. Any approved manager can
modify/delete any ad because ownership is absent. Those policies remain decisions.

## Additional findings confirmed in Step 8

### A8-1 — Stale privileged push recipients (HIGH)

Both notifyAdminMessage.pushTokensForChannel and driverSession.pushTokensForChannel
select recipients using PushToken.role/company_id without checking the current
User or an active approved manager membership. Deleted/demoted admins and removed
managers remain selected if their historical token rows persist. Group-message
push includes message text, vehicle/sender title and channel, so this is a possible
information leak, not only an obsolete notification badge.

Two isolated strict checks seed a deleted admin and a removed manager; both
selectors return their tokens instead of an empty list. Real FCM delivery was not
attempted and still depends on a valid token/runtime secret. SOS also selects
stored admin-token roles; review that route as part of the same fix.

Fix: select eligible recipients from fresh server-side users and approved live
memberships, then resolve tokens; remove/invalidate registrations on role change,
membership removal and account deletion. Test demotion, deletion, removed/expired
membership and unchanged legitimate global mechanic/admin routing.

### A8-2 — Dispatch notification authorization differs from message authorization (MEDIUM)

A passenger with an approved company membership can call notifyAdminMessage with
channel=dispatch. The endpoint returns 200 even though entityAccess disallows that
passenger creating a dispatch GroupMessage. It also accepts caller-supplied sender,
vehicle label and text without requiring a corresponding stored message. The
isolated assertion expects 403 and fails with 200. No real push was sent.

Fix: accept a stored message ID, verify its actor, channel and approved scope, and
build notification content from that record. Enforce the same channel permissions
as the write path; use an atomic notification claim/budget to prevent replay spam.

### A8-3 — Anonymous crash-report email budget is not atomic (MEDIUM)

reportClientError counts/list-checks, then creates the report and sends email.
Twenty explicitly interleaved anonymous reports with different messages capture
20 emails to one fake admin despite the advertised five-email hourly budget.
The record budget has the same count-before-write design (code review; not a
separate live or strict test). Report bodies are clipped but this does not enforce
a concurrent budget.

Fix: enforce an atomic server budget before creating records/sending email; add
source/device/account/IP abuse controls where a trusted signal is available.
Public telemetry may remain possible, but must not offer unbounded email/storage
side effects. A process-local lock or count-after-write is not a platform-wide fix.

### A8-4 — Taxi booking accepts non-taxi companies (MEDIUM, integrity/abuse)

bookTaxi checks that a company exists but does not require service_types to include
taxi. A signed-in passenger without company-B membership can create a scheduled
trip for company B even when B only offers staff-bus service. The isolated strict
check expects rejection before writes; the current function returns 200 and creates
a trip. This does not demonstrate reading B's private data. Public taxi booking
into an actual taxi operator can remain intentional.

Fix: require an eligible taxi operator, validate booking action/coordinates and
add booking abuse limits/request IDs. Test accepted public taxi bookings plus
rejection for non-taxi companies and malformed inputs.

## Audit-time release gate

The strict suite now has 38 criteria: 12 pass and 26 fail, exit 1. Five new failing
checks cover the four additional findings above; the original 21 failures remain.
This increase is expanded audit coverage, not regression of the remediation fixes.
Baseline: 198 unit tests pass. Eight mock browser checks, lint and build were
verified on the remediation source; Step 8 changes no frontend application source.
Lint and baseline tests were rerun for the audit test addition.

Remaining categories: atomic attempt limits, pairing/OTP consumption, concurrent
check-in/shift/inspection/GPS replay, legacy ID-only tablet login, server-enforced
pairing/company/permanent code strength/uniqueness, boarding grant reuse/revocation,
and the new notification/telemetry/booking findings.

## Work needed before release

1. Resolve atomic storage/backend guarantees and choose a supported implementation.
   Do not accept claim-row rereads, process locks or append/count as atomic without
   a documented platform guarantee. Claude can investigate this read-only.
2. Fix notification recipient freshness/channel authorization and non-taxi booking
   validation; preserve intended public advertisements and public taxi booking.
3. Move pairing/company/permanent code rules to server issuance with expiry,
   uniqueness and effective failure budgets; hash remaining Contact codes.
4. Implement single-use grant/OTP consumption with correct completed-retry ACKs and
   current card/membership checks; fix concurrent replay and position updates.
5. Settle ad ownership/drafts, mechanic deletes, passenger membership renewal and
   audit-log writer policy. No policy was silently changed during this audit.
6. Review/export old work before a separately authorized legacy-device migration;
   then eliminate ID-only authentication before first production. Do not clear
   queues, revoke development tablets or generate signing keys as an audit action.
7. Verify scheduled caller identity, live role/User/RLS behavior, file privacy and
   GitHub gate enforcement with appropriate access and authorized test accounts.
8. Coordinate backend/client rollout, pass the strict suite and complete live
   migration/recovery tests before any first-production publish decision.

Frontend unpublished. No live devices/accounts changed. No production credentials
rotated and no replacement signing keys generated or committed.


## Follow-up remediation status — 2026-10-04 UTC

A8-1, A8-2 and A8-4 now have code fixes and passing isolated release assertions.
A8-3 remains unresolved. Original audit evidence above describes 67ed322 and is
retained as history. Current strict results: 16 pass, 22 fail out of 38. Baseline:
234 unit tests, 11 mocked browser checks, lint and build pass. The first production
release remains blocked. See README.md's follow-up section for the new contract,
test coverage, rollout requirements and non-atomic notification replay limits.


## Server-code issuance follow-up — 2026-10-04 UTC

Subsequent authorized application changes satisfy five more strict criteria.
Pairing/company issuance is server-controlled with fixed strength and expiry;
generic credential-field writes are blocked. Newly issued Contact/User passenger
codes are hashed and checked against existing protected and legacy codes.
Current results supersede historical counts: 255 unit tests, 13 mock browser
checks, lint/build pass; strict suite 21 pass / 17 fail, exit 1. Concurrent uniqueness,
legacy migration and budgets remain unresolved. See security-tests/README.md
for expiry, membership and coordinated rollout boundaries. No live mutations,
tablet revocation, signing changes or frontend publication were performed.

## Boarding grant revocation follow-up — 2026-10-04 UTC

New card grants bind the source identity, associated app user, protected card
record ID (when present), card UID fingerprint and verification kind. Keypad
grants bind source identity, associated app user and kind. No added identity
metadata or fingerprint is returned to tablets.

Before a new verified check-in, the server reads current directory assignment,
app role and approved membership, and verifies card activity, revocation,
expiry, company and holder against the original grant. A registered card ledger
takes precedence over a copied legacy Contact tag. Replacing a card, deleting its
ledger or reassigning its holder cannot preserve a new grant. Transient user reads
fail with a server error rather than treating the outage as permanent revocation.
Standalone legacy Contact tags remain development-compatible when no ledger
exists; bulk migration and legacy authentication were not changed.

Unbound grants issued before this update cannot authorize new verified check-ins:
the rider must perform a fresh online lookup. Existing saved-work handling keeps
rejected queued originals for review/export. A completed retry with the same
request ID and payload still returns the whitelisted acknowledgement before
eligibility revalidation, without making another write. Changed payloads keep
their conflict response. No live grants/cards/accounts/tablets were modified
through function calls; authorization checks are backend code changes that auto-sync.

20 new unit cases cover revocation, timestamps, invalid/expired card dates,
owner/company changes, deleted/duplicate ledgers, assignment/membership/role
changes, replacement cards, method binding, missing grant binding, keypad
membership, safe completed retries, transient read failure and response scrubbing.
275 unit tests and lint pass. The strict suite is 22 pass / 16 fail of 38, exit 1.
Fixtures now obtain real mocked lookup grants so concurrency and reuse criteria
continue to exercise valid authorization. This adds one passing release criterion.
The 13 prior mocked browser checks were not repeated for this backend-only change.

This is authorization revalidation at request processing time, not an atomic
revocation/write transaction. Card/member changes racing a write, single-use
boarding grants, OTP claims, attempt limits and concurrent replay remain unresolved.
Atomic platform questions are still prepared but unanswered; none were sent.
No SDK upgrade, production rotation, signing changes or frontend publication.

## Approved policy changes — 2026-10-04 UTC

User-approved rules: admins manage everything through the existing protected
workflows; mechanics work on maintenance across companies; maintenance deletion
is admin-only; companies manage their own public ads; company passenger access
uses one permanent company code with no 30-day expiry.

Company code issuance returns the existing compliant code by default, without
writing or rotating it. New codes and passenger company grants/memberships do not
carry a expiry. Legacy expiry metadata is ignored for code-bound passenger scope,
including existing active memberships and grants whose code still matches.
All duplicated membership helpers use this rule. Manager scope retains its
existing expiry checks; changing a code still invalidates code-bound passenger
access. Only an explicit admin rotate request can replace a compliant code.
No code was rotated or live membership/grant updated by the agent.

Context retrieval checks current active passenger membership and never
reactivates a removed membership. A person who still knows the shared code can
join again by entering it; membership removal is not a permanent user ban.
Explicit admin approval remains independent of a code. Short/noncompliant legacy
company codes still need an operator to request a compliant code once.

Advertisement gains company_id ownership. Companies create only under an approved
company and can update/delete only their own ads; ownership transfer is admin-only.
Missing ownership denotes an admin-managed global ad. Existing ads were not
backfilled or reassigned live. Admin controls can assign any existing ad to a
company or global scope. The company dashboard has an Advertisements tab showing
its own manageable ads. Public reads of all ads remain enabled, including the
existing inactive-read behavior. Public, passenger and mechanic writes are denied.

Maintenance deletion now requires admin for both mechanics and company managers.
Mechanics retain global maintenance reads, creates and updates within existing
field/tenant constraints. Admin access, protected credentials, role-management
workflows, tablet authentication and pairing expiry remain in place.

Validation: 296 unit tests, 14 API-mocked browser checks, lint and build pass.
21 new policy unit tests include cross-company/global ad denial, admin assignment,
permanent legacy grants, inactive membership handling, stable issuance,
explicit admin rotation, mechanic global access and helper consistency.
The strict suite remains 22 passing / 16 failing out of 38 and exits 1.
Old expiry assertions were changed to the approved permanent-access policy;
code mismatch, role/scope checks and revoked membership assertions remain.
The browser runtime needed Chromium restored before tests could start.

Backend/entity edits auto-sync; frontend was not published. No live accounts,
company codes, ads, memberships, grants or tablets were mutated through function
calls. No signing/production credential changes. Atomic guarantees remain
unconfirmed; the platform questions have not been sent.
