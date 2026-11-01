# Physical device tests

**None of these were run during this update: no device was available in the
build environment.** Automated tests (see `TEST-RESULTS.md`) check the app's
logic and screens in a browser; they are not proof that a physical device
works. Run this list on one bus before the wider rollout, and write the
result, the date and who tested in the last column.

| # | Device | Test | How | Expected | Result |
|---|---|---|---|---|---|
| D1 | Boarding phone (K18) | Card tap, online | Tap an issued card | "Checking your card…", then "Welcome aboard" + "Boarding recorded" + sound | Not run |
| D2 | Boarding phone | Repeat tap | Tap the same card again within a minute | "Already recorded", nothing new in Admin → Sign-in log | Not run |
| D3 | Boarding phone | Offline tap | Turn mobile data off, tap a card | Boarding recorded + "Saved offline — will sync automatically"; Diagnostics shows 1 waiting | Not run |
| D4 | Boarding phone | Reconnect | Turn data back on | Waiting count goes to 0 within about 15 s; the tap appears once in the Sign-in log with its real time | Not run |
| D5 | Boarding phone | Stopped card | Suspend a card in Card issuing, tap it online | Refused; online tablet stops accepting within about 30 s | Not run |
| D6 | Boarding phone | Stopped card offline | Suspend a card, keep the phone offline, tap | Accepted offline; after reconnecting, flagged for review in the log | Not run |
| D7 | Boarding phone | Reader modes | Set "Boarding only" in Admin → Kiosk tablets; tap | Records boarding with no question; an exit is refused with the message | Not run |
| D8 | Boarding phone | QR | Show a passenger's QR to the camera | Same as a card tap | Not run |
| D9 | Boarding phone | Sound | Tablet settings → Diagnostics → Test sound | Three notes are heard | Not run |
| D10 | Boarding phone | Kiosk lock | Startup → Kiosk lock & exit code → on | Diagnostics and Admin say "Kiosk protection active"; Home and Back don't leave the app; exit code works | Not run |
| D11 | Driver tablet (T30Pro) | Passengers | Unlock, open Passengers; tap someone on the boarding phone | Shows "On board since …" within a minute | Not run |
| D12 | Driver tablet | No-show and undo | Mark a passenger "Didn't show", then "Undo no-show" | Both saved; Admin → Change history shows the driver's name | Not run |
| D13 | Driver tablet | Moving | Drive above walking pace | Marks are disabled with "Stop the bus to mark passengers" | Not run |
| D14 | Driver tablet | Kiosk lock | Check Admin → Kiosk tablets | Protection state matches the tablet (locked tablets "active") | Not run |
| D15 | T10 validator | NFC | Tap the fleet's own cards (each type) | Each card read; note any that fail | Not run |
| D16 | T10 validator | Scanner | Show a QR to the built-in scanner | Expected **not** to work until the maker's SDK is added | Not run (Blocked) |
| D17 | T10 validator | Camera QR | Use Scan QR code | Note whether the camera works | Not run |
| D18 | T10 validator | Kiosk lock | Diagnostics → Kiosk protection | "Setup required: … device owner"; needs the USB setup tool | Not run |
| D19 | Passenger phone | Journey | Board and get off with a card while watching Home | Boarded → On board → Got off → Done; alerts for each | Not run |
| D20 | Passenger phone | Locked phone | Lock the phone near the pickup with notifications allowed | Pickup alert arrives; boarding/exit alerts show on next open | Not run |
| D21 | Admin | Camera trial | Fleet workspace → Cameras → choose a driver tablet | Tablet shows the viewing notice and Stop; ends after 10 min; Change history logs it | Not run |

## "Lockdown failed"

That message is not shown by the McSween kiosk app. On a tablet that shows
it, check which app is in front: FreeKiosk (older set-up) shows its own
lock messages. On tablets running the McSween kiosk app, Tablet settings →
Diagnostics → Kiosk protection, and Admin → Kiosk tablets, now give the
reason in words (for example "this device isn't set up as a managed kiosk").
Photograph the message and the Diagnostics screen and note the tablet's
label; nothing needs to be reset or reinstalled to find the cause.
