## Security hardening test status (2026-10-03)

Run the current mocked regression checks with:

```bash
npx playwright test e2e/tablet-context.spec.js e2e/company-isolation.spec.js
```

These block raw custom entity access, verify tablet credential cache cleanup,
backend PIN verification, centralized mechanic vehicles and scoped company context.
SDK analytics may access its own built-in User/me endpoint. Other authenticated
role checks require verified test sessions. Older live device tests below describe
legacy ID/PIN contracts and need migration before use with enrolled token devices.
TransitTrack is pre-production; references below to production mean the hosted
Base44 backend, not an active production release.

# E2E tests

Playwright tests that run against the real production backend (`https://base44.app`),
using a locally-served build of the current `dist/` (see `vite.config.js`'s `preview.proxy`,
which forwards `/api/*` to the real backend since `vite preview` only serves static files).

## Running

```bash
npm run build
npm run test:e2e
```

`playwright.config.js`'s `webServer` starts `vite preview` automatically if nothing is
already listening on port 4173.

## What's covered

- **Public pages** (`public.spec.js`) — Welcome/Login/Register render. No auth needed.
- **Kiosk steady-state** (`kiosk-bus-boarding.spec.js`) — an already-paired bus-boarding
  kiosk heartbeats and reaches its lock screen with the right vehicle.
- **Driver steady-state + PIN unlock** (`driver-pairing.spec.js`) — an already-paired
  driver device loads its session, then PIN-gate unlock with the vehicle's `driver_pin`.

Both device tests seed `localStorage` with a fixture device's id before the app boots,
rather than replaying the `?code=` one-time pairing flow — `pairKioskDevice` explicitly
rejects re-pairing an already-paired device (409), so replaying that flow would only
pass once. Seeding localStorage instead reproduces the actual steady state a real
tablet is in every ordinary day after its one-time pairing, and is what makes these
tests repeatable. Kiosk/driver auth is device-based (a `KioskDevice` record + id), not
user login, which is why these three could be built and verified end-to-end in this
session without hitting the blocker below.

## What's NOT covered, and why

Admin, mechanic, and company-role flows (Run Inspection, the admin tabs, the mechanic
dashboard, company self-service) all sit behind `base44.auth`'s real email/password
login, which requires completing an emailed one-time verification code before the
account can log in at all. That can't be done programmatically — there's no bypass,
by design, and this session's own privileged tooling explicitly refuses to touch `User`
records to route around it (`update_entities` errors: "Users are managed through the
app's authentication system").

To extend coverage to those flows:
1. Create (or use an existing) verified test account per role — Admin → Users & roles →
   "Create account" — and complete its one-time email verification once.
2. Add a Playwright `storageState` fixture that logs in with those credentials via the
   real `/login` form (or seeds `localStorage`'s `access_token` directly, mirroring what
   `base44.auth.loginViaEmailPassword` stores) and reuse it across that role's tests.
3. Write the actual flow tests (e.g. Run Inspection end-to-end, admin CRUD tabs) the
   same way the three above were built — real UI interaction against the real backend,
   no mocking.

## Test fixtures

Two `KioskDevice` records were seeded directly (via privileged tooling, not through the
app), both `paired: true` permanently so the tests above can seed localStorage and rely
on the steady-state (already-paired) code path every run:
- `6ab72f96a01e01329ada39dc` — "E2E Bus Boarding Test Kiosk", vehicle "hvyurtet" (Island
  Transit Co., a pre-existing demo/test vehicle used elsewhere this session).
- `6ab72f96a01e01329ada39dd` — "E2E Driver Test Device", same vehicle (driver_pin `1111`).

Don't unpair or delete these — the tests depend on them staying paired.

Step 6 adds offlineDurability.test.js and offlineBackend.test.js for retained HTTP failures, storage corruption/quota errors, stable replay IDs, partial inspections, shift retries, stale GPS and assignment mismatches. These are mock-only and do not seed live entities. Atomic concurrent deduplication and legacy unbound queues remain release limits in handoff.md.
