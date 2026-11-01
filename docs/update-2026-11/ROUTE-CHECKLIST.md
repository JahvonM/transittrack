# Route and control checklist

Generated from `e2e/route-smoke.spec.js` (run 31 Oct 2026, branch `coordinated-update`) and the feature specs listed below.
Each address was opened directly (a fresh page load, the same as a bookmark or refresh) as the given role,
against the realistic fixture in `e2e/helpers/fleetFixture.js`. **Pass** means: no crash screen, no uncaught
error, and the page stayed put (or redirected where it should). Console noise from the blocked map service
(Mapbox 404 in tests) is expected and is not an app error.

**Result: 141 addresses, 141 pass, 0 crash/uncaught error.** Unknown addresses show the not-found page with a way back (separate test).

## Signed out (19)

| Address | Ends at | Result |
|---|---|---|
| `/` | same page | Pass |
| `/admin` | /login | Pass |
| `/book-taxi` | same page | Pass |
| `/driver` | same page | Pass |
| `/forgot-password` | same page | Pass |
| `/join` | same page | Pass |
| `/kiosk` | same page | Pass |
| `/login` | same page | Pass |
| `/privacy` | same page | Pass |
| `/register` | same page | Pass |
| `/reset-password` | same page | Pass |
| `/reviewer-sandbox` | same page | Pass |
| `/site` | same page | Pass |
| `/site/book` | same page | Pass |
| `/site/track` | same page | Pass |
| `/staff` | /login | Pass |
| `/tablet` | same page | Pass |
| `/terms` | same page | Pass |
| `/track` | same page | Pass |

## Admin (70)

| Address | Ends at | Result |
|---|---|---|
| `/account` | same page | Pass |
| `/admin/ads` | same page | Pass |
| `/admin/app-errors` | same page | Pass |
| `/admin/audit` | same page | Pass |
| `/admin/billing` | same page | Pass |
| `/admin/calendar` | same page | Pass |
| `/admin/card-designs` | same page | Pass |
| `/admin/cards` | same page | Pass |
| `/admin/checkins` | same page | Pass |
| `/admin/companies` | same page | Pass |
| `/admin/data` | same page | Pass |
| `/admin/directory` | same page | Pass |
| `/admin/drivers` | same page | Pass |
| `/admin/driving-reports` | same page | Pass |
| `/admin/faults` | same page | Pass |
| `/admin/fleet` | same page | Pass |
| `/admin/fleet-analytics` | same page | Pass |
| `/admin/health` | same page | Pass |
| `/admin/incident-reports` | same page | Pass |
| `/admin/inspection-history` | same page | Pass |
| `/admin/kiosks` | same page | Pass |
| `/admin/lost-items` | same page | Pass |
| `/admin/messaging` | same page | Pass |
| `/admin/notifications` | same page | Pass |
| `/admin/overview` | same page | Pass |
| `/admin/parts` | same page | Pass |
| `/admin/passenger-bookings` | same page | Pass |
| `/admin/plan-pickups` | same page | Pass |
| `/admin/profile` | same page | Pass |
| `/admin/ride-history` | same page | Pass |
| `/admin/route-analytics` | same page | Pass |
| `/admin/route-explorer` | same page | Pass |
| `/admin/route-planner` | same page | Pass |
| `/admin/safety-standards` | same page | Pass |
| `/admin/schedule` | same page | Pass |
| `/admin/service` | same page | Pass |
| `/admin/service-history` | same page | Pass |
| `/admin/shifts` | same page | Pass |
| `/admin/support` | same page | Pass |
| `/admin/templates` | same page | Pass |
| `/admin/travel-times` | same page | Pass |
| `/admin/trips` | same page | Pass |
| `/admin/users` | same page | Pass |
| `/admin/vehicle-logs` | same page | Pass |
| `/admin/vehicles` | same page | Pass |
| `/buses` | same page | Pass |
| `/company` | same page | Pass |
| `/driving-reports` | /admin/driving-reports | Pass |
| `/fleet-analytics` | /admin/fleet-analytics | Pass |
| `/incident-report` | same page | Pass |
| `/incident-reports` | /admin/incident-reports | Pass |
| `/location-timeline` | /admin/location-timeline | Pass |
| `/manager` | same page | Pass |
| `/manager/analytics` | same page | Pass |
| `/manager/replay` | same page | Pass |
| `/notifications` | same page | Pass |
| `/passenger` | /staff | Pass |
| `/passenger-bookings` | same page | Pass |
| `/ride-history` | /admin/ride-history | Pass |
| `/route-analytics` | /admin/route-analytics | Pass |
| `/route-explorer` | same page | Pass |
| `/route-planner` | /admin/route-planner | Pass |
| `/run-inspection` | same page | Pass |
| `/safety-standards` | same page | Pass |
| `/service-history` | same page | Pass |
| `/staff-directory` | same page | Pass |
| `/support` | /admin/support | Pass |
| `/vehicle-logs` | /admin/vehicle-logs | Pass |
| `/vehicle-registry` | same page | Pass |
| `/vehicle/bus-a` | same page | Pass |

## Company (hotel) (17)

| Address | Ends at | Result |
|---|---|---|
| `/account` | same page | Pass |
| `/admin` | /company | Pass |
| `/company` | same page | Pass |
| `/company/ads` | /company | Pass |
| `/company/jobs` | same page | Pass |
| `/company/profile` | same page | Pass |
| `/company/routes` | same page | Pass |
| `/company/vehicles` | same page | Pass |
| `/manager` | same page | Pass |
| `/manager/analytics` | same page | Pass |
| `/manager/replay` | same page | Pass |
| `/mechanic` | /company | Pass |
| `/notifications` | same page | Pass |
| `/passenger-bookings` | /company | Pass |
| `/service-history` | /company | Pass |
| `/staff-directory` | same page | Pass |
| `/vehicle-registry` | /company | Pass |

## Mechanic (7)

| Address | Ends at | Result |
|---|---|---|
| `/account` | same page | Pass |
| `/admin` | /mechanic | Pass |
| `/company` | /mechanic | Pass |
| `/mechanic` | same page | Pass |
| `/run-inspection` | same page | Pass |
| `/service-history` | same page | Pass |
| `/vehicle/bus-a` | same page | Pass |

## Passenger (21)

| Address | Ends at | Result |
|---|---|---|
| `/account` | same page | Pass |
| `/admin` | /staff | Pass |
| `/buses` | same page | Pass |
| `/company` | /staff | Pass |
| `/driver-profile` | /staff | Pass |
| `/driver-schedule` | /staff | Pass |
| `/incident-report` | /staff | Pass |
| `/journey` | same page | Pass |
| `/manager` | /staff | Pass |
| `/mechanic` | /staff | Pass |
| `/more` | same page | Pass |
| `/my-card` | same page | Pass |
| `/notifications` | same page | Pass |
| `/passenger-bookings` | /staff | Pass |
| `/rides` | same page | Pass |
| `/help` | same page | Pass |
| `/route-explorer` | same page | Pass |
| `/safety-standards` | same page | Pass |
| `/service-history` | /staff | Pass |
| `/staff` | same page | Pass |
| `/vehicle-registry` | /staff | Pass |

## Driver (phone account) (7)

| Address | Ends at | Result |
|---|---|---|
| `/driver-password` | /driver-phone | Pass |
| `/driver-phone` | same page | Pass |
| `/driver-phone/me` | same page | Pass |
| `/driver-phone/messages` | same page | Pass |
| `/driver-phone/report` | same page | Pass |
| `/driver-profile` | same page | Pass |
| `/driver-schedule` | same page | Pass |

## Controls and flows covered by feature tests

| Area | What is clicked/submitted and checked | Spec |
|---|---|---|
| Passenger tabs | Home, My rides, My pass, More; tab memory; back to top on re-tap; no sideways scroll at 320–768 px | `passenger-experience`, `passenger-rides` |
| My rides | Today (scheduled / not travelling / running late), completed rides, repeated tap = one ride, empty state, failed load + Try again | `passenger-rides` |
| Passenger journey | Home follows the passenger's own taps (boarded, on board, nearly there, got off, done), a bus at the stop is not a boarding, old GPS is "Last known position", change of bus announced once, optional ride rating | `passenger-journey`, `journeyStage.test` |
| Requests and help | Change a ride (time / pickup / cancel) with validation, reference and status, withdraw; Help page: missed pickup, card and booking problems, office replies; passenger can't open the office inbox | `passenger-journey`, `passengerCases.test` |
| Passenger support (admin) | Open/All, reply, confirm / turn down (needs a message) / resolve | `passenger-journey` |
| Passenger permissions | No admin booking link; admin pages redirect home; server hides jobs and others' taps | `passenger-rides`, `passengerPrivacy.test` |
| Passenger journey | Live/stale location, ETA, map opens only on request, pickup finder, chat send/retry, lost card | `company-isolation`, `passenger-experience` |
| Company portal | Sidebar sections, request a job form (validation, send), shared job on map, no route replay | `company-portal` |
| Jobs (admin) | Create/edit job, requests, confirm ride, signing tablet bus change | `jobs` |
| Boarding kiosk | Tap/keypad/QR, offline save, sync, settings PIN | `kiosk-boarding`, `kiosk-bus-boarding`, `saved-work` |
| Boarding taps | Repeated tap shows "Already recorded" and sends nothing; "I'm getting off" after a short ride; boarding-only tablet records without asking and explains a refused exit | `kiosk-boarding`, `boardingEventsServer.test`, `recentTaps.test` |
| Card office | Card states shown in words; Stop card menu (suspend / report lost / revoke) with the offline limit in the confirm text; Switch back on only for suspended cards | `card-states`, `cardStates.test` |
| Boarding tablet staff area | Bus PIN → Diagnostics (reader, last read, camera, sound test, card list, waiting taps, connection, kiosk protection, copy for support), Screen → Full screen; no Full screen on the passenger screen | `operations-changes`, `kioskProtection.test` |
| Reader setting (admin) | Kiosk tablets → Reassign → What this reader records / needs an open shift, saved with the device | `reader-settings` |
| Kiosk protection (admin) | Each paired tablet shows its protection state in words from its own report (active / limited / setup required / not reported / failed with the reason) | `reader-settings`, `kioskProtectionReport.test` |
| Driver tablet/phone | Pairing, shift start/end, walk-around, messages, stops | `driver-*`, `tablet-*` |
| Driver passengers | Ride state per passenger in words (on board since, got off at, didn't show), boarding note, counts; no-show with confirm and undo; got on / off without a tap; refused marks explained; marks blocked while moving | `driver-manifest`, `driverManifest.test` |
| Admin | Fast open, load recovery, notifications, app errors, users, company workspace | `admin-*`, `notifications`, `app-errors`, `company-workspace` |
| Website | Booking form, tracking link, phone widths | `website`, `public` |

Physical-device behaviour (NFC antennas, scanners, sound, LEDs, lock task) is **not** covered here; see `DEVICE-TESTS.md`.
