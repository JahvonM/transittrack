# Follow-up (1 Nov 2026, branch `more-updates`)

The items left after the coordinated update (PR #16, merged and live on
1 Nov). Nothing here is live until this branch's pull request is approved
and merged. Defaults keep today's behaviour except where marked **new
alert**.

## What changes

| Area | Change | Default |
|---|---|---|
| Driver phone | The passenger list shows each ride today (on board since, got off at, didn't show) from the passenger's own taps and the driver's marks, as on the bus tablet. The driver can mark a no-show (and undo it) or record someone getting on or off without a tap. Marks are off while the phone says the bus is moving. Card numbers never reach the phone. | On for every driver phone |
| Driver phone | Start shift goes step by step: your bus, walk-around check, who to pick up today, then scan the bus tablet. | — |
| Passenger phone | **New alert**: "Boarding confirmed" / "Exit confirmed" with the bus and time when their tap is recorded. Not sent for taps a tablet saved offline and sent later, or for repeat taps. | On; passengers can turn it off in their notification settings, the office in Admin → Notifications (everywhere or per company) |
| My rides | "Coming up" (booked rides, and time or pickup changes the office confirmed) and "Cancelled" (cancellations asked for, confirmed or refused, and booked rides the office cancelled, last 30 days). | — |
| Boarding devices | **Validator** screen layout: the card reader is above a small screen, so a banner points up to it; code entry and camera QR stay below. A T10 picks it automatically from the model the kiosk app reports. | Automatic only on a T10; Admin can set it for any boarding device |
| Boarding devices | **Where passengers tap their card** (Admin → Kiosk tablets → the tablet): above the screen, back of the phone (top or middle), or a separate reader. The boarding screen tells passengers where to hold the card. | Automatic: follows the layout. The tablet layout keeps today's wording unless set |
| Boarding devices | **Passenger information screen** layout, for a display inside the bus: nearest stop (with minutes only while the bus position is fresh, otherwise "Last known position at …"), the route's stops, how many are on board, weather and announcements. No tapping, and it downloads no passenger list. It never says "next stop" or "on time": the app doesn't track either. | Only when chosen in Admin |
| Tests | A button-by-button check presses every safe button on 13 main screens and fails on any crash. | — |

## Database

One additive migration, `20261101131329_boarding_layouts.sql`:

- adds `kiosk_device.nfc_spot` (text, default `'auto'`, with an allowed-values check);
- widens the `display_layout` check to also allow `'validator'` and `'info'`.

Undo (only after rolling the app back; older code ignores the column):

```sql
alter table public.kiosk_device drop constraint if exists kiosk_device_nfc_spot_allowed;
alter table public.kiosk_device drop column if exists nfc_spot;
update public.kiosk_device set display_layout = 'auto' where display_layout in ('validator', 'info');
alter table public.kiosk_device drop constraint if exists kiosk_device_display_layout_allowed;
alter table public.kiosk_device add constraint kiosk_device_display_layout_allowed
  check (display_layout is null or display_layout in ('auto', 'tablet', 'phone')) not valid;
```

The driver phone marks use the `ride_exception` table added in PR #16, and
the rules are now shared by the tablet and the phone
(`base44/shared/rideMarks.ts`). No new tables.

## Device tests to add (none could be run here)

| # | Device | Test | Pass when |
|---|---|---|---|
| F1 | Driver phone | Open Today → Passenger list with the bus stopped. Mark a no-show, undo it. | The mark shows at once; the bus tablet shows the same within a minute; Admin → Audit lists both with the driver's name |
| F2 | Driver phone | Drive above walking pace. | Mark buttons are off with "Stop the bus to mark passengers" |
| F3 | Passenger phone (locked) | Tap the card on the boarding tablet. | "Boarding confirmed" arrives on the lock screen; tapping it opens the app |
| F4 | Passenger phone | Turn off "Boarding and exit confirmed" in notification settings, tap again. | No alert; the tap is still recorded |
| F5 | T10 | Open the boarding screen (layout Automatic). | Validator layout with "Tap card above"; a card held above the screen is read |
| F6 | Coolpad K18 | Set "Where passengers tap" to the spot that works best. | The hint matches where the card actually reads |
| F7 | Spare tablet in a bus | Set layout to Passenger information screen. | Nearest stop and minutes while driving; "Last known position" when GPS stops; no passenger list in Tablet settings → Diagnostics |

## Still blocked or for the owner

- T10 barcode scanner, LED and buzzer: the maker's SDK (`HARDWARE.md`).
- Kiosk lock on the 5 unlocked tablets, boarding tablets for Grenville and
  St. George, the camera relay (TURN): on the devices or in Cloudflare.
- Journey sharing for staff rides: reviewed, not added (`AUDIT.md`).
- Recurring travel preferences ("I don't ride on Fridays"): needs your
  decision on how the office approves them; not built.
- No tablet had checked in since 30 Oct when PR #16 went live (1 Nov), so
  the 15-minute device checks in `ROLLOUT.md` are still to do when the
  fleet is back on.

## Test results (1 Nov 2026, sandbox, branch `more-updates`)

| Suite | Result |
|---|---|
| Unit and server-function tests (`npx vitest run`) | **1453 passed**, 0 failed (177 files) |
| Production security tests (`npm run test:security:release`) | **188 passed**, 0 failed |
| Browser tests, full list | **541 passed**, 6 failed, 1 skipped on the first full run. 5 of the failures are `first-open`, which can't start this sandbox's browser (known, passes in CI). The 6th, `admin-load-recovery` "activity updates use supplied rows", uses a fake clock and timed out while the machine was busy at the start of the run; it touches nothing in this branch and passed 5 of 5 when re-run. Every spec changed in this branch was re-run after the last fixes: all pass |
| Button-by-button check (new) | 13 screens, 98 buttons pressed, no crash screen or uncaught error. Buttons that send, save, delete or change records were skipped (they have their own tests) |
| Lint, generated-file checks | Pass |

No physical device was tested. The device tests above (F1–F7) are still to do.
