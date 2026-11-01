# Test results

Run on 1–2 Nov 2026 on branch `coordinated-update`, in the build sandbox
(headless Chromium, mocked server replies for browser tests, the real server
functions for unit tests). **No physical device was tested**; see
`DEVICE-TESTS.md`. Automated tests show the logic and screens behave as
described; they don't prove every device works.

## Totals

| Suite | Result |
|---|---|
| Unit and server-function tests (`npx vitest run`) | **1438 passed**, 0 failed (175 files) |
| Production security tests (`npm run test:security:release`) | **188 passed**, 0 failed (17 files); one expectation updated for the new card `state` word (no card number is returned) |
| Browser tests, full list in `playwright.config.js` | **524 passed**, 0 failed, 1 skipped (see notes) |
| Route check (`e2e/route-smoke.spec.js`) | **142 addresses, 142 pass**, 0 crashes or uncaught errors |
| Lint, generated-file checks | Pass (`eslint src`, `build-functions --check`, `gen-schema --check`, `data-model --check`) |

Notes on the browser run:

- First full run: 518 passed, 6 failed, 1 skipped. Then:
  - `fleet-workspace`: the test's bus time came from the shared fixture,
    which fixes its clock when the test worker starts. Late in a long run
    the bus really was 5 minutes old, and the screen correctly said "Last
    known". The test now sets its own times. Re-run: pass.
  - `first-open` (5 tests): failed in 3 ms with "Executable doesn't exist".
    The spec sets its own browser launch options, which drops this
    sandbox's browser path. Run with the path added: 5 of 5 pass. Not an
    app failure; unchanged in CI.
- Skipped: `direct-tablet-viewer` (live WebRTC video) is skipped unless
  `TT_RUN_WEBRTC_MEDIA` is set; the sandbox has no network interfaces for it.
  It was skipped before this update too.
- Live-backend specs not in the CI list (`kiosk-bus-boarding`,
  `driver-pairing`) can't reach the real server from the sandbox and were not
  counted.

## The 13 required scenarios

| # | Scenario | Tests | Result |
|---|---|---|---|
| 1 | Several passengers board one trip and get off at different stops | `boardingEventsServer.test` (one trip, several riders), `driverManifest.test` (several riders…), `boardingEvents.test` (counts several passengers) | Pass |
| 2 | Repeated taps don't create duplicates or unintended exits | `boardingEventsServer.test` (repeated taps), `recentTaps.test`, `kiosk-boarding` ("a repeated card tap says already recorded…") | Pass |
| 3 | Lost / revoked cards follow the online and offline policy | `boardingEventsServer.test` (cancelled cards tapped offline), `cardStates.test`, `card-states` | Pass |
| 4 | A previously issued passenger pass reopens offline | `passenger-experience`, `tablet-context` ("boarding tablet uses its saved card file after restart…"), `passengerSnapshot.test` | Pass |
| 5 | Connectivity fails during a submission and recovers | `kiosk-boarding` ("typed code check-in is saved…"), `saved-work`, `offlineQueue` tests, D3–D4 on a device | Pass (device: not run) |
| 6 | Two disconnected devices produce conflicting events | `boardingEventsServer.test` (two tablets out of step), `boardingEvents.test` | Pass |
| 7 | Same passenger, two trips on the same bus in one day | `boardingEventsServer.test` (two trips = separate runs), `journeyStage.test` (two rides each get their own alert) | Pass |
| 8 | GPS goes stale while the passenger screen is open | `passenger-journey` ("an old bus position is shown as the last known position"), `fleetWorkspace.test` | Pass |
| 9 | A vehicle is reassigned or a pickup changes | `passenger-journey` ("a change of bus is announced once"), `company-isolation` (pickup changes), `driver-road-stops` | Pass |
| 10 | Passenger access can't reach admin assignment actions | `passenger-rides`, `passenger-journey` ("a passenger can't open the office inbox"), `passengerCases.test`, `passengerPrivacy.test`, `cardStates.test` (passengers and drivers can't reach the card office), `route-smoke` | Pass |
| 11 | Unsupported camera / scanner gives a useful fallback | `kiosk-boarding` (reader helper lost → keypad), Diagnostics panel (no scanner → camera, no camera → keypad or card), `fleetWorkspace.test` (only supported cameras offered) | Pass (device: not run) |
| 12 | Navigation across all roles has no unhandled errors | `route-smoke` (142 addresses, 6 roles + unknown route) | Pass |
| 13 | Existing kiosk protection, pairing and settings still work | `kiosk-launch`, `tablet-management`, `operations-changes`, `kiosk-boarding` (settings behind the PIN), `kioskProtection.test` | Pass (device: not run) |

## Hardware

| Test | Result |
|---|---|
| NFC on the boarding phone, T10, USB reader | **Not run** (no device in the sandbox) |
| T10 barcode scanner, LED, buzzer | **Blocked** (maker's SDK) and not run |
| Sound on a real device | **Not run** |
| Kiosk lock on a device | **Not run**. Live reports read from Admin: 2 of 7 active tablets locked |
| Camera viewing | **Not run** (WebRTC test skipped in the sandbox) |
