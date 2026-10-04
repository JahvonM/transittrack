# TransitTrack — Handoff

## 1) Goal

Fleet/transit tracking PWA (driver, staff, admin, company/manager, and now
mechanic roles) built on Base44. Recent work stream: turn the driver app's
messaging into a WhatsApp-style experience — one chat tab with separate
contacts (Staff / Own company / Dispatch / Mechanic), edit/delete on your own
messages, photo + voice notes, and an admin floating chat bubble — as part of
getting the app ready for real-world use and eventual Play Store / App Store
publishing.

## 2) Current state

- The WhatsApp-style chat merge is built and deployed (live at
  `https://eager-transit-track-go.base44.app`):
  - Driver app's old "Messages" (dispatch broadcasts) and "Chat" (staff)
    tabs are merged into one "Chat" tab → `DriverChats.jsx`, a contact list
    with 4 threads: **Staff**, **Own company**, **Dispatch**, **Mechanic**.
  - All four threads share one entity (`GroupMessage`) split by a new
    `channel` field, with edit/delete on your own messages, and photo/voice
    note support everywhere (driver, staff, admin, company, mechanic).
  - New **Mechanic** role: admin can create one under Users & roles; it logs
    into its own portal at `/mechanic`.
  - New **CompanyMessages** floating bubble on the Fleet Manager dashboard
    (company/owner login) — the other end of the driver's "Own company"
    contact.
  - Admin's `FloatingMessages` bubble now has a per-vehicle channel switcher
    (Staff / Company / Dispatch / Mechanic) instead of one flat thread.
  - Push notifications fire to admin (always) plus the channel-specific
    audience (company manager for "company" channel, mechanic team for
    "mechanic" channel), with the sender's own device excluded so people
    don't get pushed about their own message.
- Last user-facing ask in progress: admin's chat bubble should sit stacked
  **above** the AI copilot button (both bottom-right), not on opposite
  corners. This was implemented and verified directly in the deployed
  bundle/CSS (both buttons confirmed `right-4`, stacked at `bottom-4` /
  `bottom-24`) — **but the user is still seeing it on the left after a
  refresh**, unresolved as of this handoff. See "Failed attempts" below.

## 3) Active files

Backend (Base44 functions/entities):
- `base44/functions/driverSession/entry.ts` — driver's single backend
  entrypoint (device-paired, no login). Channel-aware `send_group_message`,
  new `send_chat_media` (base64 upload via `asServiceRole.integrations.Core.UploadFile`),
  `edit_group_message`/`delete_group_message`, `pushTokensForChannel` helper,
  legacy `send_broadcast`/`sos`/`update_location`/etc. unchanged.
- `base44/functions/notifyAdminMessage/entry.ts` — push trigger called by
  logged-in roles (staff/company/admin/mechanic) right after they create a
  `GroupMessage` directly via the client SDK (driver's own sends push inline
  from `driverSession` instead). Now channel-aware and excludes the sender's
  own device from the push.
- `base44/entities/GroupMessage.jsonc` — `channel` enum
  (staff/company/dispatch/mechanic), `sender_role` enum now includes
  company/mechanic, `message_type` (text/image/audio) + `media_url`, RLS
  updated per channel.
- `base44/entities/User.jsonc` — `role` enum now includes `mechanic`.
- `base44/entities/PushToken.jsonc` — unchanged schema, just now also holds
  `role: "company"` / `role: "mechanic"` rows.

Frontend — shared:
- `src/components/chat/ChatThread.jsx` — the one reusable chat UI (bubbles,
  edit/delete, image/audio rendering, input row with photo picker + voice
  recorder via `MediaRecorder`). Every role's chat UI wraps this.
- `src/lib/chatMedia.js` — `blobToBase64()`, used only by the driver (no
  login → can't call `UploadFile` directly, so it base64-encodes and goes
  through `driverSession`'s `send_chat_media`).

Frontend — per role:
- `src/components/driver/DriverChats.jsx` — new; driver's 4-contact list.
- `src/pages/DriverApp.jsx` — tab bar reduced from 6 to 5 tabs (Messages tab
  removed), `DriverChats` wired into "Chat" tab, `handleAlertReply` now posts
  to `channel: "dispatch"` instead of the old `send_broadcast`.
- `src/components/staff/StaffGroupChat.jsx` — rewritten to use `ChatThread`,
  explicit `channel: "staff"` filter/create.
- `src/components/admin/FloatingMessages.jsx` — rewritten: vehicle list →
  channel list → thread, using `ChatThread`. Bubble position:
  `fixed bottom-24 right-4` (button), `fixed bottom-40 right-4` (panel) —
  stacked above `FloatingChatbot` (`fixed bottom-4 right-4` /
  `fixed bottom-20 right-4`).
- `src/components/manager/CompanyMessages.jsx` — new; same pattern, single
  `channel: "company"` scope, wired into `ManagerDashboard.jsx` for
  `role === "company"` only (admin has its own richer panel already).
- `src/pages/MechanicPortal.jsx` — new; full-page vehicle list → thread,
  `channel: "mechanic"`, routed at `/mechanic` in `src/App.jsx`.
- `src/components/admin/UsersTab.jsx` — added "Mechanic" to the 3 role
  `<Select>`s (invite, create-account dialog, per-user row).
- `src/pages/Welcome.jsx` — added `mechanic` to the `ROLES` map (icon
  `Wrench`, routes to `/mechanic`) so login redirect works.
- `src/pages/StaffPortal.jsx` — added a `role === "mechanic"` redirect guard
  alongside the existing driver/company ones.

Deleted (now dead, folded into `DriverChats`):
- `src/components/DriverMessages.jsx`
- `src/components/driver/DriverGroupChat.jsx`

## 4) Changes made

In order, across this stream of work:

1. `GroupMessage` + `User` entity schemas extended (channel/media fields,
   mechanic role); backfilled existing `GroupMessage` rows with
   `channel: "staff"`.
2. `driverSession/entry.ts`: channel param on send/edit/delete, new
   `send_chat_media` action, `pushTokensForChannel` helper, dispatch reply
   path switched from `Broadcast` to `GroupMessage(channel: "dispatch")`.
3. `notifyAdminMessage/entry.ts` generalized to be channel-aware (was
   staff-only before) and to exclude the sender's own push tokens.
4. Built `ChatThread.jsx` (shared UI) and `chatMedia.js` (base64 helper).
5. Built `DriverChats.jsx`, rewired `DriverApp.jsx`, deleted the two old
   driver chat components.
6. Rewrote `StaffGroupChat.jsx` on top of `ChatThread` with `channel:
   "staff"`.
7. Rewrote `FloatingMessages.jsx` (admin) with the vehicle → channel →
   thread drill-down.
8. Built `CompanyMessages.jsx`, wired into `ManagerDashboard.jsx`.
9. Built `MechanicPortal.jsx`, added the `/mechanic` route, `mechanic` role
   everywhere it needed to be recognized (User schema, Welcome redirect,
   StaffPortal guard, UsersTab role pickers).
10. Build verified clean (`npx vite build`), checkpointed, deployed.
11. Follow-up: moved admin's `FloatingMessages` bubble from
    `bottom-4 left-4` to `bottom-24 right-4` (stacked above
    `FloatingChatbot`), panel from `bottom-20 left-4` to `bottom-40
    right-4`. Rebuilt, checkpointed, deployed again.

## 5) Failed attempts

- **Chat bubble still reported on the left after the reposition deploy.**
  Verified directly against the live served files (not just local
  source) that the fix is actually live:
  - Fetched the deployed `Admin-*.js` chunk and confirmed the literal
    classes `fixed bottom-24 right-4 ... shadow-lg relative` and
    `fixed bottom-40 right-4 ...` are present, and `bottom-4 left-4` is
    gone.
  - Fetched the deployed CSS bundle and confirmed `.bottom-24`,
    `.bottom-40`, `.right-4` all have real rules generated (ruled out a
    Tailwind purge/stale-CSS gap).
  - Confirmed no custom domain is configured for this app (`GET
    .../custom-domains` → `[]`), so there's no second, possibly-stale
    origin the user could be hitting.
  - Told the user this points to a client-side cache (most likely an
    installed PWA/home-screen icon not picking up a plain in-tab refresh)
    and asked them to fully close-and-reopen the app or test in an
    incognito window. **No confirmation back yet that this resolved it** —
    this is the one open thread from this session.

## 6) Next step

- Get confirmation from the user on whether a full close-and-reopen (or
  incognito test) fixes the chat-bubble-position issue. If incognito also
  still shows it on the left, the "verified live" assumption above is wrong
  somewhere (e.g. a second published URL/branch, or a CDN edge that hadn't
  invalidated yet) and needs re-investigation — don't just re-apply the same
  positioning change again.
- Get user feedback on the WhatsApp-style chat merge itself (Staff / Own
  company / Dispatch / Mechanic contacts, photo/voice notes, edit/delete) —
  none received yet since it shipped.
- Still open from earlier in the session, never answered: how should the
  kiosk check-in/sign-in flow actually work (`StaffCheckIn`/
  `FrontDeskSignIns` entities have admin-facing log UI but nothing creates
  records — kiosks only show a static "paired" confirmation). Needs NFC vs
  QR vs manual-entry decision from the user.
- Native push notifications inside the Capacitor-wrapped iOS/Android shells
  (as opposed to today's web push, which works) still need two files from
  the user: `google-services.json` (Android) and `GoogleService-Info.plist`
  (iOS) — documented in `MOBILE.md`, not yet requested/provided.
- App Store / Play Store submission itself (signed binaries, store
  listings, real `appId` in place of the placeholder `com.transittrack.app`)
  is explicitly on hold per the user until "a few more things to debug" are
  done.

## Pre-production security — STEP 1 (2026-10-03)

User authorized STEP 1 only. No production resources exist. Mechanics require
maintenance access across companies, without credentials or ownership/role
controls. Advertisements stay publicly readable with authorized writes only.

Removed tracked helper signing material and the public legacy helper APK. The
existing development key remains at kiosk-helper/signing.jks as an ignored local
file (0600); legacy APK moved to ignored kiosk-helper/legacy-development/. Secure
external backup is still required before sandbox reset. No key generation, device
revocation, credential rotation, database rule changes, or deployment performed.

Helper build now requires an existing absolute-path keystore, alias and password
environment variables and never creates keys. FreeKiosk key fallback removed;
setup asks for validated local PIN/API-key/Wi-Fi credentials and explicitly passes
the API key to the helper. Setup uses a privately supplied local APK.

Earlier Git history and previously published files still contain old material;
this step changes the current repository only. Do not use exposed development
credentials for production. STEP 2 is not authorized yet. V1 remains unresolved:
built-in User security cannot be changed according to Base44 docs, and custom
profile fields are self-editable. Authenticated non-admin tests remain needed.

## Pre-production security — STEP 2 (2026-10-03)

User authorized STEP 2 with "Next". Kiosk display reads now use the existing
30-second kioskHeartbeat context (vehicle/route whitelist, active public ads,
server occupancy/today counts). Check-in returns a whitelisted display record
and optional refreshed counts; summary errors never turn a saved write into a
failure. Driver heartbeat omits PIN/entry code/card UIDs, provides server counts
and whitelisted company emergency phones, validates vehicle/company assignment,
and rejects broadcasts scoped to other companies. Driver SOS/occupancy no longer
read Company/StaffCheckIn directly. Driver PIN verification moved server-side as
required to remove the PIN from heartbeat; this is not yet a server-enforced
driver action session. Existing daily unlock flag and reviewer sandbox remain.

Legacy driver session cache is scrubbed on read/write, including offline startup.
Kiosk offline_directory remains a known credential exposure pending STEP 4;
do not claim all tablet credential responses are fixed. STEP 3 must replace
device-ID-as-credential. PIN hashing/attempt limits and company membership model
are still pending. Database rules and Advertisement write permissions unchanged.

Verification: lint/build, 73 unit tests including 10 backend/cache regressions;
2 mocked Chromium tests with direct entity access blocked. Tests use no live
credentials and create no development records. No tablet revocation or signing
key work. Frontend has not been published. Base44 automatically syncs backend
function edits, so publish the updated frontend as a coordinated development
rollout before relying on existing tablet PIN screens. Old frontend builds
expect a raw driver PIN and are incompatible with the new heartbeat contract.
STEP 3 subsequently authorized; see below.


## Pre-production security — STEP 3 (2026-10-03)

User authorized STEP 3. New pairing issues a cryptographically random 256-bit
bearer token once; only its SHA-256 hash is saved in admin-only DeviceCredential.
Backend heartbeat/check-in/driver paths verify token, 90-day expiry, active paired
state, company/vehicle/type binding and current pairing-code hash. New records
cannot authenticate using only an ID. Existing devices created before the fixed
2026-10-03T23:35:39Z cutoff with no credential remain legacy-compatible, as the
user forbids revoking development tablets. Once enrolled they cannot fall back
merely by omitting a token. Re-pair all legacy devices before production; legacy
ID authentication is still present deliberately. No live device records changed.

Tablet clients store the bearer token in a dedicated localStorage entry, attach
it at request time (including offline replay), and omit it from profiles/session
caches and queued payload overrides. Tokens remain client bearer secrets; XSS
can access localStorage. Pairing codes now use crypto randomness (12 characters)
and expire after 15 minutes when created/regenerated. Existing codes are not
rewritten. Sequential reuse returns 409, but simultaneous pairing is NOT proven
atomic: a transactional consume/unique guard is still required before production.
Expired tokens require admin-assisted re-pairing. Unused kioskDirectory endpoint
retired with 410. Offline queues retain 401 failures for recovery instead of
silently deleting them; broader queue/idempotency work remains STEP 6.

Verification: lint/build, 82 unit tests (including 9 token regressions), and two
mocked Chromium tablet tests pass. Tests create no live accounts/devices. Tests
cover duplicated backend auth helpers, hash-only pairing, sequential replay,
expiry/bindings/no downgrade, protected schema and clean caches/current tokens.
Live non-admin RLS tests and actual tablet rollout remain unverified. Backend
resources auto-sync; frontend has not been explicitly published. Coordinate
frontend rollout before re-pairing devices. No signing-key generation or existing
tablet revocation. STEP 4 has not started. Earlier company isolation, PIN attempts,
credential directory and public entity risks remain pending their planned steps.


## Pre-production security — STEP 4 (2026-10-03 America/Grenada)

User authorized STEP 4. Driver actions (apart from heartbeat, PIN verification,
push registration and emergency SOS) now require a protected 12-hour server grant
issued after PIN verification. Grants bind device/company/vehicle/pairing/purpose;
client daily unlock flags never authorize backend writes and startup requests PIN
again. Current grant attaches at send time, including queued driver actions.
PIN verification is limited to 5 attempts per vehicle per 15 minutes. New/reset
PINs go through admin-only manageDriverPin and use PBKDF2-SHA256, 600,000 iterations,
a random salt, protected DriverPinCredential, and clear Vehicle.driver_pin. A
successful verification lazily migrates an existing development PIN. Unused old
PINs remain plaintext until reset/migration; migrate every one before production.
Admin PIN UI is write-only. PIN grants are bearer secrets in dedicated localStorage;
XSS resistance and session invalidation after PIN reset remain rollout concerns.

Kiosk offline_directory no longer returns card UIDs or permanent/temporary codes.
Legacy kiosk directory/setup caches are scrubbed on offline startup too. Card/code
verification now requires a network connection; UI explains it. A verified lookup
returns a 24-hour boarding grant (not the presented credential) so its confirmation
can queue if the network drops. The tablet rate limit is 20 lookups per minute.
Badge/code check-ins require the grant; manual check-ins remain a deliberate paired
operator capability. Broad offline reliability/idempotency remains STEP 6. Queue
401/403/429 failures stay queued for recovery, rather than silently disappearing.

Temporary code issuance requires a staff login, allows 3 requests per 30 minutes,
uses crypto random 6 digits, stores only SHA-256 in protected
PassengerOneTimeCredential, expires after 30 minutes, invalidates older codes,
and consumes at successful lookup (cancelling confirmation requires a new code).
Self-editable legacy User.one_time_code is ignored. Permanent keypad issuing now
uses crypto randomness and fails when collision allocation exhausts. New company
codes are crypto random 12 characters; existing codes unchanged. Company code
verification/restoration goes through companyAccess with 5 attempts per account
per 15 minutes, protected 30-day access grants, display-only company response,
and invalidation on code change. CodeGate/StaffPortal no longer download code lists,
cache raw join codes, or write User.company_id. Company access grants grant only
passenger display access, never user roles, company ownership or trusted membership.

Release blockers: rate-limit count+append and temporary code consumption are
persistent but not transactional; concurrent requests can pass their checks.
Atomic consumption/attempt reservation and cleanup of expired grant/attempt rows
must be supplied before first production. Schema company isolation and legacy
credential fields/direct entity reads remain STEP 5 (including User.company_id
and self-editable badge fields); this step does not claim all public data exposure
is resolved. Existing Advertisement rules unchanged. New schemas admin-only;
service-role backend access bypasses them. Live non-admin RLS tests still needed.
No live accounts created, signing keys generated, or development devices revoked.
Backend auto-syncs; frontend not published; coordinate development rollout before
using changed PIN/boarding/code contracts. Existing temporary codes must be
regenerated; existing raw cached join codes require re-entry after rollout.
STEP 5 is not started.

Verification: lint/build, 91 unit tests including 11 new verification regressions,
and 2 mocked Chromium tablet tests pass. Browser tests verify old credential cache
cleanup and that a daily unlock flag cannot skip PIN startup. The five new schemas
were confirmed synced with admin-only permissions. Tests use mock data, not live
credentials or device records. STEP 4 checkpoint saved after verification.

## Coordination note — second agent, STEP 0 live results (2026-10-04)

Two agents now work on this app. The agent writing STEPs 1–5 above owns the
security rollout; the second agent ran only the user's "STEP 0" verification
and changed no app code, schemas, devices or credentials. Results, so STEP 5
does not need to repeat them:

- Method: plain HTTP as a real non-admin user, no browser. One development
  account exists for this: tt-dev-passenger-a@example.com (role staff, no
  company, created via users/provisions so no email was sent; removable via
  the API). A session token comes from POST /api/apps/{app_id}/embed-tokens
  (single-use, 60 s) — opening the live site with ?ott=<token> answers 302 to
  /?access_token=<jwt>, which then works as a Bearer token. Reuse this for the
  "live non-admin RLS tests" listed as still needed above.
- V2 (user listing): SAFE. GET /entities/User as that user returns 403; no
  other users visible.
- V1 (self-edit): VULNERABLE at the time of testing (before STEP 5). Both
  auth.updateMe (PUT /entities/User/me) and PUT /entities/User/{own id}
  returned 200 and changed company_id, access_code, one_time_code (+expiry)
  and nfc_tag_id. Changing role to admin or company returned 403 and did not
  change. The account was restored afterwards (staff, those fields null).
- Impact after STEP 4 (code read, not re-tested): kioskCheckIn no longer
  trusts User.access_code / User.one_time_code / User.nfc_tag_id for
  matching (NfcCard, Contact and Passenger*Credential are used instead), so
  those self-edits look harmless now. loadStaffDirectory still copies
  User.one_time_code into directory rows (unused; can be dropped).
  User.company_id must not be trusted anywhere — STEP 5's CompanyMembership
  approach covers this; re-run the V1 test against it to prove it.
- At the time of testing, as that passenger: Vehicle, Contact, Company and
  StaffCheckIn rows were readable (public); KioskDevice, NfcCard, AuditLog
  returned nothing. Re-run after STEP 5 to confirm they are closed.
- GitHub secret scanning, push protection and Dependabot alerts could NOT be
  enabled from here (proxy refuses settings writes). The user must turn them
  on in the repo settings.


## Pre-production security — STEP 5 (2026-10-03 America/Grenada)

User authorized STEP 5 with "Let's go". CompanyMembership is an admin-controlled
approval ledger; User.company_id is never trusted for company authorization.
Manager memberships require explicit admin assignment in User management. Existing
profile assignments were NOT automatically approved and no live user/device/account
records were changed by this work. Admin User lists show approved company membership,
not raw profile values; company users without approval see an approval message.
Staff entering a verified company code obtain passenger scope only, with a 30-day
expiry and code hash; expiry or company code changes invalidate it. Existing valid
server-issued company access grants can restore passenger scope without treating
self-edited profile fields as membership. No role or ownership is granted by codes.

entityAccess is the sole application entity gateway: fresh server-side User role,
approved company scope, per-role operation policies, explicit field projections,
credential scrubbing, record-ID checks, tenant filters, related-record validation,
and prevalidation of batches. All direct custom entity rules are admin-only except
Advertisement public reads. Built-in User permissions remain platform-controlled;
its schema was not assigned ineffective custom RLS. Public custom entity requests
return no rows; public gateway access is limited to Advertisement read operations.
Company writes use approved memberships via the gateway; advertisements remain
public with writes only for admin or approved company users. Mechanics have global
Vehicle/Fault/Inspection/InspectionResult/InspectionTemplate/Part/MaintenanceSchedule/
MaintenanceSettings access, plus company display names and their maintenance chat;
no driver PIN, passenger credential/card UID, join code, role or ownership access.
Mechanic Vehicle writes are limited to maintenance fields. Shared parts inventory
and global maintenance settings/templates remain available to the central team.

src/api/base44Client.js wraps entity calls in src/lib/scopedEntities.js and resolves
presentation auth context through the gateway. Subscriptions use scoped 10-second
snapshot polling rather than raw entity streams; 5,000-row cap is a known scaling
limit. SDK analytics still calls the signed-in account's built-in User/me endpoint;
it does not replace app authorization. Profile updates allow only safe fields.
Vehicle form no longer submits the unused raw entry-code field, which would bypass
protected credential management. Report/message ownership is server-attributed;
company broadcasts receive the approved company ID even when omitted by the UI.

nfcCards, notifyStaffPickup, notifyAdminMessage, generateOneTimeCode, driverSession,
kioskCheckIn, adminCopilot and busAssistant now check approved membership or scoped
server data. User-stored legacy UID/access-code/temporary-code fields are not
accepted as credentials. Existing controlled Contact badges still work; issued
User badges resolve through protected active NfcCard records, and User permanent
keypad codes now use protected hashed PassengerAccessCredential. Legacy User-only
badges/codes without canonical records need migration/reissue before rollout.
The four fleet-wide job functions weeklyReport/inspectionAlerts/maintenanceAlerts/
learnTravelTimes no longer mistake an anonymous request for a scheduler. They now
require an authorized account; automatic schedules are deliberately blocked until
a verified service authentication path is configured. This is a rollout requirement,
not a claim that anonymous scheduled execution is safe.

Validation: lint/build, 118 unit tests (27 company-isolation regressions), and four
mocked Chromium tablet/mechanic/company tests pass. Read-only live anonymous checks
returned zero rows for Vehicle, Company, Contact, StaffCheckIn, CompanyMembership,
NfcCard and DriverPinCredential; User returned 401. Live entityAccess returned 401
for Vehicle/User and 200 for Advertisement reads. Synced schema permissions were
checked separately. No live advertisement records exist for a positive content
read; public readability is verified by schema and mock contract. Authenticated
non-admin direct-API tests still require verified test sessions; no six test
accounts were created because unverified accounts would not enable those checks.

Rollout: explicitly approve managers in Admin → User management; passenger accounts
can re-enter a valid company code. Finish legacy credential migration (including
unused plaintext PINs), configure authenticated jobs, and exercise verified real
roles before first production. Frontend has not been published. Backend/resources
auto-sync, so older published clients will lose broad direct entity access until
coordinated frontend rollout. No development tablet revocation, key generation,
credential rotation or GitHub security setting changes. STEP 6 implementation and focused verification are complete; see below.


## STEP 6 — Offline queues, replay IDs and GPS integrity (2026-10-04)

Failed check-in, GPS and inspection/shift uploads retain saved work for all HTTP
errors and network failures. Queues stop at the first failed item to preserve order.
Storage failures no longer pretend that work was saved; corrupt queue storage is
preserved and reported instead of being replaced with an empty array. Mechanic
jobs save progress before and between requests; operator banners expose upload
errors. Driver inspection storage-full fallback no longer silently discards photos.

Check-ins use persistent client_request_id values before the first online request;
older queued check-ins receive and persist IDs before replay. Server retries are
scoped by device/company/vehicle and content hash. Completed writes can be
acknowledged after a boarding grant expires; new writes still require verification.
Changed data with the same ID returns 409. New IDs require explicit boarding status
and valid supplied timestamps. No new credential directory or offline PIN bypass.

Mechanic InspectionResult/Fault rows receive persistent individual IDs before any
request, with actor-scoped backend deduplication and content hashes. Driver basic
and template inspections reuse their saved parent on retry; per-item result/fault
IDs resume partial completion. Required fault-write failures now retain the job for
retry instead of acknowledging incomplete work. Driver start/end shifts have
persistent replay IDs so replaying an old end action cannot end a newer shift.
Queued replay uses current device tokens and current driver grants at send time.

GPS validates numeric coordinates, bounds, speed (0–100 m/s) and timestamps
(72 hours old through one minute ahead). Invalid/oversized batches are rejected
in full so the client retains them. Sequential retries check tenant-scoped history
with pagination; server read errors stop the write rather than guessing no
duplicates exist. Replayed older samples cannot replace a newer live position.
GPS uses sample time, not replay time. The existing 2,000-point local cap thins older
points and server history samples at approximately one minute; this is intentionally
reduced detail, not lossless storage of every GPS fix.

New queued boarding/GPS data carry original tablet/company/vehicle assignment
metadata, checked server-side before writing. Newly queued driver inspection/shift
jobs take binding from the matching cached session when available. Legacy queues
without binding cannot have their historical assignment inferred safely and need
operator review before re-pairing/rollout. No existing queue was cleared.

IMPORTANT RELEASE LIMITS: lookup then create/update is NOT an atomic transaction.
Sequential replay and partial recovery are covered, but concurrent requests/tabs
can still create duplicates or race live GPS updates. A platform-supported unique
constraint/transaction/CAS remains required before claiming exactly-once delivery.
Legacy check-ins already saved before replay IDs existed cannot be retroactively
deduplicated from a lost response. Expired driver grants require an online PIN
unlock; expired uncompleted boarding grants and GPS beyond the 72-hour window
remain retained for operator resolution. Corrupt/full browser storage requires
recovery; do not clear storage to dismiss the error. Authenticated live tablet/role
testing is still outstanding; this phase uses mocks and does not mutate live
development device records or publish the frontend.

Validation: 145 unit tests (27 new Step 6 regressions), lint/build and four mocked
Chromium tests pass. STEP 7 has not begun. No production credential rotation,
development tablet revocation, signing-key generation or frontend publication.


## STEP 7 — Regression tests and strict production criteria (2026-10-04 UTC)

Added 33 passing boundary/repository tests (178 baseline unit tests total),
mock-only default Playwright discovery, and a separate strict production suite
with 19 normal failing assertions. The failures reproduce current release blockers
in memory; they are not disguised as expected passes. See security-tests/README.md
for the grouped results, review of Claude's 13 findings and remaining policy choices.
GitHub workflow now runs baseline/mock browser checks and an independent failing
security-release-readiness job. Required branch protection and deployed GitHub
execution were not configured/verified. Tests replace SDK/services with fixtures;
no live record, account, tablet or credential was changed. Application functions
and entity resources were not edited in Step 7; no frontend publication.

Lint/build and 178 baseline unit tests pass; four mocked browser checks pass.
Production-readiness command exits 1 with all 19 requirements failing.
The legacy-device criteria are deliberately red until authorized migration;
concurrency, weak issuance, grant/card/PIN revocation and maintenance-recipient
issues remain unresolved. Generated Playwright reports are no longer tracked.
This checkpoint is a tested regression baseline with known release failures,
not a production-ready checkpoint. STEP 8 has not begun.


### Step 7 follow-up: independent Step 6 review

Added 14 strict production criteria in security-tests/offline-readiness.test.js;
all fail against current code, bringing the release suite to 33 failing checks.
Confirmed stuck queues, unpersisted first-send shift work, untargeted old shift
ends, photo loss, unbound legacy replay, full-history GPS reads, admin metadata
500, and further concurrent races. Corrected the overly broad earlier shift-test
description: only retry of an exact already-completed request ID was covered.
Application functions/resources remain unchanged. See security-tests/README.md
for the updated ledger and safe remediation scope. Do not clear queues as a
workaround, and do not treat 33 checks as 33 unique vulnerabilities. STEP 8 paused.


## Authorized remediation batch — 2026-10-04 UTC

Current results supersede the historical Step 7 counts above: 198 baseline unit
assertions and eight mocked Chromium checks pass; lint and build pass. Strict
production criteria: 12 pass, 21 fail (33 total), exit 1. Step 8 stays paused.
See security-tests/README.md for the current ledger and limits.

Implemented persist-before-first-send check-ins/shifts/driver and mechanic
inspections; visible retained rejection/export/retry/archive recovery; independent
queue progress and split GPS rejection handling; targeted end-shift; prevalidated
photo caps and failed-upload 503; replay assignment enforcement; bounded descending
GPS history reads; controlled admin assignment error. Unpairing a driver tablet no
longer clears GPS history. Queue originals and assignments are retained for review.
Exports omit known credential fields and preserve answers/photos. Archive/removal
are explicit online-admin reconciliation actions, tested only with mocked storage.

Maintenance alert managers now come from approved active CompanyMembership,
ignoring profile User.company_id. Driver unlock grants bind to the PIN credential
version, so reset invalidates previous grants. Existing unlock grants lacking that
version require an online PIN unlock; device records/tokens were not revoked.
Mechanic maintenance access and credential/role restrictions are preserved.

Backend/entity edits auto-sync. The frontend was not published, and backend/client
contracts need coordinated rollout before tablet use. No live accounts/records,
emails, schedules, tablet revocations, production credential rotations or signing
keys were used. Legacy ID-only development authentication remains deliberately
unchanged. Concurrent storage/backend replay remains unresolved; local guards are
not transactions. Large photos can exceed local-storage capacity and are refused
before send. Partial successful photo uploads can leave unused blobs on retry.
GPS dense windows hit a 10,000-row cap and retry with 503. Policy decisions and
live identity/RLS checks remain outstanding; this checkpoint is not release-ready.


## STEP 8 — Final pre-production audit (2026-10-04 UTC)

Completed the user-authorized audit of application source 67ed322. Decision:
NOT READY for the first production release. Full scope, evidence, findings and
release sequence are in security-tests/step8-audit.md. Step 8 edited tests/docs
only; no frontend/backend/entity application changes or live mutations.

Five new strict criteria reproduce four additional findings: stale privileged
push recipients in both notification selectors; passenger-triggered dispatch
notifications; concurrent anonymous crash-report email-budget bypass; taxi trips
accepted for non-taxi companies. Mocked recipient selection/captured emails do
not prove live FCM delivery. No real notification or booking was sent.

The strict gate now has 38 checks: 12 pass, 26 fail, exit 1. The former 21 failing
checks remain; the increase reflects coverage, not broken remediation. Baseline
198 unit tests and lint rerun and pass; prior eight mocked browser/build checks
remain applicable because this audit does not change application source. Current
tracked-source signature scan found no private-key/GitHub-token/AWS-key matches;
this is limited, not exhaustive and not a history scan. Live User/RLS, scheduler,
blob privacy, credential inventories and GitHub required checks remain unverified.
Step 8 audit completion does not authorize or establish production readiness.
No frontend publication, live account/device changes, tablet revocation, production
credential rotation or signing-key generation occurred.


## Notification security and taxi validation follow-up — 2026-10-04 UTC

Authorized after the Step 8 audit. Both chat push selectors now resolve recipients
from current users and approved live manager memberships; driver SOS uses that
selector too. Historical token role/company metadata cannot retain former access.
No token/device records were removed. Global mechanic/admin routing is preserved.

notifyAdminMessage requires a saved message_id, fetches the current actor, verifies
ownership/channel and vehicle company, and derives names/text/media from server
records. CompanyMessages, StaffGroupChat and MechanicPortal use the returned write
ID for text/photos/voice notes. Missing/foreign/deleted records and stale privileges
are refused. Older clients using raw notification bodies are refused until client
rollout; their chat writes remain independent. Backend edits auto-sync; frontend
not published. Taxi booking rejects non-taxi operators, unsupported actions,
invalid required strings and malformed/out-of-range/unpaired coordinates, while
preserving signed-in public booking without operator membership.

232 baseline unit tests (34 new), 11 mock browser checks, lint/build pass. Four
strict criteria now pass: both stale-recipient checks, passenger dispatch denial
and non-taxi rejection. Strict suite: 16 pass, 22 fail out of 38, exit 1. Dispatch
fixture now includes a saved owned dispatch row so it tests channel authorization
rather than merely missing-input validation. Current results supersede audit counts.

No real FCM, email, bookings, accounts, tablet revocations or signing changes were
performed. Current eligibility snapshots cannot retract an in-flight push. Valid
message notification replay still needs an atomic claim/budget; booking limits and
idempotency remain to implement. The public crash-report budget and original atomic
release blockers remain red. Required CI gate/live tests remain unverified. TransitTrack
is still not ready for first production. See security-tests/README.md and step8-audit.md.
