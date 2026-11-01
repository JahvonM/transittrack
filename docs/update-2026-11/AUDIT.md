# TransitTrack coordinated update: audit (phase 1)

Branch `coordinated-update`, started from `main` at `d0ac1c3` on 31 Oct 2026.
Everything here was checked against the code on that commit and, where
stated, against the live Supabase data (counts only, no personal data).
Earlier review notes were re-verified rather than copied.

Status column: **Fixed** (in this branch), **Planned** (later phase of this
branch), **Blocked** (needs hardware, documentation or an owner decision),
**OK** (checked, no change needed).

## 1. Confirmed architecture

| Part | What it is | Where |
|---|---|---|
| Web app (all roles) | React 18 + Vite PWA, one bundle, role decides screens | `src/` |
| Live hosting | Cloudflare Worker `transittrack` serves `dist/` for app.mcsweenstransport.com and mcsweenstransport.com (site chosen by hostname) | `cloudflare/wrangler.jsonc` |
| Live backend | Supabase (Postgres + Edge Functions). Functions are written once in `base44/functions/*` and copied by `tools/supabase/build-functions.mjs` | `supabase/` |
| Legacy backend | Base44 still hosts the same functions for old cached clients; some forward to Supabase | `base44/` |
| Data access | Browsers never read tables directly: every read/write goes through the `entityAccess` function, which checks role, company membership and fields | `base44/functions/entityAccess` |
| Schema | Base44 entity files generate Supabase migrations (`tools/supabase/gen-schema.mjs`); migrations apply on push to `main` | `base44/entities`, `supabase/migrations` |
| Android app | One APK (`com.transittrack.app`) for driver tablet, boarding kiosk and signing tablet; Capacitor WebView + native kiosk, GPS, NFC, hotspot, dashcam, WebRTC support | `android/` |
| Driver phone app | Store app (`com.mcsweenstransport.driver`), same web app at `/driver-phone` | `android/` flavour, `driver-app/ios` |
| Kiosk helper | Older companion app for FreeKiosk-based tablets (USB reader, GPS, hotspot) | `kiosk-helper/` |
| Desktop app | Electron shell for admin + USB tablet setup | `desktop/` |
| Device auth | Pairing code → per-device credential (hash stored in `DeviceCredential`), bound to company, bus and device type | `pairKioskDevice`, `kioskCheckIn`, `driverSession` |

## 2. Roles and their screens

| Role | Lands on | Main areas |
|---|---|---|
| Passenger (`staff`/`passenger`) | `/staff` | Home, Journey (map), My card (QR + NFC), More |
| Driver (phone account) | `/driver-phone` | Today, Messages, Report, Me; walk-around, shift start/end |
| Driver tablet (paired device) | `/driver` | Drive screen, stops, jobs, inspection, messages |
| Boarding kiosk (paired device) | `/kiosk` | Tap card / keypad / QR, info rail, protected settings |
| Signing tablet (paired device) | `/kiosk` | Job signatures, name sign, change bus |
| Company (hotel) | `/company` | Overview, Jobs, Live map, Buses, Routes, Passengers |
| Mechanic | `/mechanic` | Service queue, inspections, faults, parts |
| Admin | `/admin` | 44 sections (see route checklist) |
| Custom role | `/workspace` | Sections granted by an access role |
| Public | `/`, `/site`, `/track` | Website, booking, guest ride tracking |

## 3. Route inventory and automated check

`e2e/route-smoke.spec.js` opens **132 addresses** across 6 roles (public,
admin, company, mechanic, passenger, driver) against a realistic fixture
(`e2e/helpers/fleetFixture.js`). Each page must render without a crash
screen or uncaught error and land where it should; forbidden pages must
redirect. First run: **129 pass, 3 fail** (Notifications crash on a missing list, a passenger
reaching `/vehicle-registry`, and a test-data gap on `/driver-password`). After the phase 2
fixes and new checks: **140 addresses, 140 pass**. Results are in `ROUTE-CHECKLIST.md`.

## 4. Verified findings

| # | Area | Finding | Evidence | Severity | Status |
|---|---|---|---|---|---|
| F1 | Passenger | **More → More tools → Booked rides** opens `/passenger-bookings`, the admin dispatch page with "Assign vehicle" and approve controls. The server refuses a passenger's approve, but the page shows admin controls and its approve has no error handling (unhandled rejection). There is no personal rides screen. | `PassengerExperience.jsx:198`, `PassengerBookings.jsx` | High | Fixed (U2): link goes to a new personal **My rides**; page is admin-only |
| F2 | Permissions | Pages with no role check, reachable by typing the address: `/vehicle-registry` (admin edit tools), `/passenger-bookings`, `/service-history`, `/incident-report`, `/driver-profile`, `/driver-schedule`. Data is still filtered by the server, but admin controls are shown. Smoke test: passenger stays on `/vehicle-registry`. | `src/pages/*` | Medium | Fixed (U2): one `RoleGate` in the route table |
| F3 | Privacy | Passengers can list every trip of their company, **including dispatch jobs** (website/hotel guests' pickup and drop-off place names and times; names and phones are already hidden). | `entityAccess` `visible()`/`project()` for `PASSENGER_READ` | High | Fixed (U2): passengers see staff runs only |
| F4 | Robustness | Admin → Notifications crashes if the server reply lacks `recent` (`data.recent.filter`). The live server always sends it; found by the fixture. | `NotificationsTab.jsx:336` | Low | Fixed (U2) |
| F5 | Boarding | **Duplicate taps record twice.** 27 of 126 live check-ins (21%) repeat the same card and direction on the same bus within 10 minutes. Retries with the same request id are de-duplicated; a second tap is not. | Supabase `staff_check_in` | High | Fixed (U3): a repeat within 30 min in the same direction is answered "Already recorded" and not saved again, online and offline |
| F6 | Boarding | Check-ins are not linked to a run (shift/direction), so "onboard", "already recorded" and "two trips same day" can't be told apart. Direction is chosen by the rider on every tap, with the last status as the suggestion. There is no protected reader mode (boarding only / exit only). | `kioskCheckIn` `nextStatus`, `BusBoardingKiosk.jsx` confirm screen | High | Fixed (U3): taps carry the shift/day run; reader mode (both / boarding only / exit only) per tablet; "already recorded" screen. Admin setting in U6 |
| F7 | Boarding offline | A lost/revoked card stays usable **offline** until the tablet's card list refreshes; no defined policy, no review flag on replay. | `offline_directory`, `check_in` | Medium | Fixed (U3): live taps of a stopped card are refused; offline taps are kept and flagged for review (`revoked_card_used_offline` / `card_changed_after_tap`); stopping a card asks tablets to refresh. Offline tablets keep their list up to 24 h (documented, not hidden) |
| F8 | Passenger alerts | "Bus is close" alert de-duplicates per **bus per day** (`tt_bus_near_<bus>_<date>`), so a second journey on the same bus that day gets no alert. | `PassengerExperience.jsx` | Medium | Fixed (U4): alerts are keyed by passenger + ride (or the wait before it) + event, so two rides on one bus in a day each get their own; boarding, nearly-there and exit alerts added |
| F9 | NFC send | "Send to bus tablet" for a rider on **Grenville** or **St. George** reaches 0 tablets: those buses have no boarding tablet right now (only St. Pauls and a test device have one). St. Pauls did download its list. The screen doesn't show whether a tablet actually downloaded the list. | Supabase `kiosk_device`, `nfcCards.sendToBus` | Medium | Fixed (U6): Card issuing says when a bus has no set-up, paired boarding tablet, and shows when the tablet last **downloaded** its list (and how many cards), or that a newer list is still waiting. Main cause was F18 |
| F18 | Boarding | **A card issued again is refused by the tablets.** The tablet check gave up when a card number had more than one record, even if only one was active, so a card that was cancelled and issued again (or replaced and re-issued) was refused online ("Card no longer authorized") and left out of the tablet's offline list. Live on 31 Oct: **all 3 active cards** have older records for the same card (re-issued 28 Oct), and none has a check-in since, after 10–21 each before. This is the likely main cause of "I sent the card to the bus and it didn't send" (with F9). | `kioskCheckIn currentCard`, Supabase `nfc_card` counts | **High** | Fixed (U3): the one active record decides; two active records for one card are still refused. Not live until approved |
| F19 | Admin | **Admin → Passenger support showed the passenger lost-item form**, which saved the report as a company announcement (a `Broadcast`, seen by passengers, with the reporter's contact details). There was no place for passengers' requests with a reference or status. | `src/pages/PassengerSupport.jsx` | Medium | Fixed (U4): replaced by the Passenger support inbox (`passengerCases`); lost items stay under Lost items |
| F20 | Boarding counts | The "on board" count on the driver and boarding tablets used the time a tap **reached the server**, and never let a boarding with no exit lapse. A tap saved offline and sent later could flip someone back to "on board"; a forgotten exit counted all day. | `driverSession` and `kioskCheckIn` `boardingStats` | Medium | Fixed (U5): counted by when taps happened, with the 6-hour ride limit (shared rules) |
| F21 | Driver tablet | The passenger row's "Mark" button was wired to nothing (`onAttend={() => {}}`); it never showed because nothing set it to show. | `StaffRouteListItem`, `DriverApp` | Low | Kept hidden; the Passengers screen now has real marks (no-show, got on / off without a tap) |
| F22 | Boarding tablet | The phone boarding kiosk showed a **Full screen** button to passengers, outside the PIN-protected staff area. | `BusBoardingKiosk.jsx` | Low | Fixed (U6): moved to Tablet settings → Screen (bus PIN) |
| F10 | Card registry | The `NfcCard` ledger is already authoritative in practice: 15 cards, 3 active, 12 revoked, **0 duplicate active cards, 0 legacy Contact tags left**. `User.nfc_tag_id` is still set on 3 users and `Driver.nfc_card_uid` on none. Statuses are `is_active` + `revoked_at` + free-text reason; there is no explicit suspended/lost/replaced state. | Supabase counts | Medium | Fixed (U3): `status` (active / suspended / lost / revoked / replaced) with older records read from what they have; only suspended cards can be switched back on; all changes audited |
| F11 | Kiosk | The text **"Lockdown failed" is not produced by TransitTrack code**; our kiosk app reports named codes (`DEVICE_OWNER_REQUIRED`, `KIOSK_RECOVERY_REQUIRED`, `ALREADY_LOCKED`, `ANDROID_ERROR`, `STORAGE_ERROR`, `UNSUPPORTED`, `LOCK_RESTORE_FAILED`). **Live reports on 1 Nov (7 active tablets): only 2 are locked** (St. Pauls Bus 2 driver, St. George Bus 001 driver). The St. Pauls boarding phone (Coolpad K18, Android 14), the Grenville driver tablet and both signing tablets are managed (device owner) but kiosk mode is **off**. The T10 test unit (Android 12) is **not** a managed device, so the app cannot lock it (`DEVICE_OWNER_REQUIRED`), the likeliest source of a lock failure there. The reason code was not sent to the server before this update. | Supabase `kiosk_device.helper_health`, `KioskMode.java` | **High** | Fixed (U7): each tablet now reports its last lock result and start-up setting; Admin and the tablet's Diagnostics show protection in plain words (active / limited / setup required / not reported / failed, with the reason). Turning kiosk mode on is an owner action per tablet (nothing is changed remotely) |
| F12 | Hotspot | Grenville driver tablet: `HOTSPOT_API_UNAVAILABLE` while St. George (same model/firmware) works. Cause: Android hidden-API setting not relaxed on that tablet. Fixed on site by the operator on 30 Oct with `hidden_api_policy 1`. | `helper_health`, `TabletHotspotApi.java` | — | OK (operator fix); documented in operator guide |
| F13 | Admin tools | The USB "Set up a device" page shows a generic "Couldn't connect" when another program (ADB in Command Prompt) holds the device. | `src/lib/usbSetup.js connectProblem` | Low | Fixed (U2): names `adb kill-server` |
| F14 | Cameras | Tablet camera/screen viewing already exists (admin only, local approval, 10-minute limit, native Stop) and recording playback exists. No fleet multi-feed view; TURN relay configuration is "not applied". | `docs/tablet-remote-support.md`, `docs/tablet-recordings.md` | — | Done (U8): Admin → Fleet workspace reuses the existing viewer for up to 4 driver-tablet cameras, behind an off-by-default trial switch; boarding tablets' QR cameras are never offered. Untested on hardware; relay (TURN) still not set up |
| F15 | Hardware | T10 validator: NFC read confirmed by operator; barcode scanner interface, LED/buzzer API and exact model/firmware unknown. No vendor SDK in the repo. | repo search | — | Blocked (vendor SDK/docs) |
| F17 | Company portal | Passengers page still linked hotel users to `/company/cards` (removed with the NFC tab), which bounced to the overview. | `StaffDirectory.jsx` | Low | Fixed (U2): card tools shown to admins only |
| F16 | Release tooling | The preview-branch Cloudflare build fails on every non-`main` push (production builds pass). Likely the dashboard "Preview command" (`npx wrangler preview`, removed in Wrangler 4). | GitHub check runs | Low | Owner action (Cloudflare dashboard) |

## 5. What already works and is kept

* Passenger: live tracking with stale-location detection, ETA with stop count, pickup selection and shared stops, walking directions, alerts, QR pass, NFC card status and lost-card report, messages, announcements, running late / skip today.
* Boarding: explicit boarding/exit choice, request ids with request hash (retries are idempotent), event time stored separately from server receipt, offline queue that confirms the event is stored before showing success, per-device hashed card list for offline taps, wrong-bus refusal, keypad and QR.
* Devices: per-device credentials, managed kiosk with recovery PIN, maintenance window, watchdog, remote kiosk commands, hotspot/Wi-Fi control, GPS, dashcam pilot, remote screen/camera viewing.
* Admin: jobs, invoices, inspections, faults, maintenance, card issuing, company workspace, notification policy, audit log, app error reports.

## 6. Owner decisions and dependencies

* T10 manufacturer SDK, sample app and exact model/firmware (scanner, LED, buzzer).
* Screenshot of "Lockdown failed" if it appears on a tablet running another kiosk app (the McSween app now reports its own reason).
* Passengers now **request** changes and the office confirms (no self-service cancel). Change if company policy allows more.
* Whether cabin camera viewing is wanted beyond the existing tablet camera support (privacy notice to staff/passengers).
* Cloudflare preview command (F16).

## 7. Journey sharing (reviewed, not added)

The existing ride-tracking link (`base44/shared/visitorLinks.ts`, `/track`)
is built for **jobs** (an airport pickup, a website booking): a 256-bit key
kept only as a hash, sent after `#` so it never reaches a server log, one
live link per job (a new one ends the old), expiring a day after the ride
(at most a week), and stopping if the bus changes. It shows only that job's
bus, pickup and drop-off.

Reusing it for regular staff rides would share a bus that carries other
passengers, along a road made of other passengers' pickups. That needs a
decision on what a shared view may show (no other pickups or names), a
revoke button for the passenger and a short expiry tied to their own ride.
It was **not added in this update**; the job links keep working as before.

## 8. Known limitations and open dependencies

| Area | Limitation | What unblocks it |
|---|---|---|
| Physical devices | No device was available; every hardware test in `DEVICE-TESTS.md` is **not run** | Run the list on one bus |
| T10 validator | Scanner, LED and buzzer need the maker's SDK; can't be kiosk-locked (not a managed device) | Supplier SDK, sample app, model and firmware; USB setup tool |
| Kiosk protection | 5 of 7 active tablets not locked (1 Nov); the app reports but never changes this remotely | Owner turns kiosk lock on per tablet |
| Cards | UID cards can be copied; offline tablets keep a stopped card up to 24 h (flagged) | See `NFC-SECURITY.md` |
| Driver phone app | Passenger list has no on-board status yet (the driver tablet has it) | Follow-up |
| Background alerts | With the phone locked, only server push alerts arrive (pickup, replies); boarding/exit alerts show when the app opens | A server push on each tap (adds work to every tap) |
| Cameras | Trial only; untested on hardware; relay (TURN) not set up | Test on one tablet with the owner |
| Grenville, St. George | No boarding tablet, so cards can't reach those buses | Set up and pair one per bus |
| Preview builds | Cloudflare preview fails on non-`main` branches (F16) | Dashboard "Preview command" |
