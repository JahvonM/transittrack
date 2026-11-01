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
| My rides | **Regular days off** (owner's decision: the office approves). A passenger asks for "Days I don't ride" (weekdays, both ways / to work / home, from a date, optional end). The office confirms or turns it down in Passenger support. Once confirmed, on those days the passenger is left off the driver phone and bus tablet lists and the going-home alerts, like Skip today. The passenger can stop it ("Ride on these days again"; the office is told); the office ends it by closing the request. | Nothing changes until the office confirms a request |
| Journey screen | **Share my journey** (owner's decision). A private link family can open without signing in. It shows only that passenger's ride: first name, bus, where they're heading, and the bus on a map only while they're on board. Never the route, other passengers, stops or names. Ends when they get off, after 3 hours, when they stop it, when they make a new link, or if their bus changes. | Off until the passenger shares |
| Tests | A button-by-button check presses every safe button on 13 main screens and fails on any crash. | — |

## Database

One additive migration, `20261101194233_follow_up.sql`:

- adds `kiosk_device.nfc_spot` (text, default `'auto'`, with an allowed-values check);
- widens the `display_layout` check to also allow `'validator'` and `'info'`;
- adds `passenger_case.days`, `direction` and `until_date`, and allows the `regular_days` kind;
- adds `app_user.ride_pattern` (the approved regular days off; set only by the server).

Journey sharing needs no database change (links are kept, hashed, in the
existing `verification_grant` table).

Undo (only after rolling the app back; older code ignores the column):

```sql
alter table public.kiosk_device drop constraint if exists kiosk_device_nfc_spot_allowed;
alter table public.kiosk_device drop column if exists nfc_spot;
update public.kiosk_device set display_layout = 'auto' where display_layout in ('validator', 'info');
alter table public.kiosk_device drop constraint if exists kiosk_device_display_layout_allowed;
alter table public.kiosk_device add constraint kiosk_device_display_layout_allowed
  check (display_layout is null or display_layout in ('auto', 'tablet', 'phone')) not valid;
alter table public.app_user drop column if exists ride_pattern;
alter table public.passenger_case drop constraint if exists passenger_case_direction_allowed;
alter table public.passenger_case drop column if exists days, drop column if exists direction, drop column if exists until_date;
-- Requests of the new kind must go first, or the old check fails.
delete from public.passenger_case where kind = 'regular_days';
alter table public.passenger_case drop constraint if exists passenger_case_kind_allowed;
alter table public.passenger_case add constraint passenger_case_kind_allowed check (kind is null or kind in
  ('time_change', 'pickup_change', 'cancel_ride', 'missed_pickup', 'card_issue', 'booking_issue', 'other', 'feedback')) not valid;
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
| F8 | Passenger + office | Passenger asks for Fridays off; office confirms. On a Friday, open the driver phone and bus tablet lists. | The passenger shows as not riding on Fridays only; "Ride on these days again" brings them back the same day |
| F9 | Passenger phone + a second phone | Share my journey, open the link on the second phone, ride, get off. | "Hasn't boarded yet" with no map, then the bus on the map while on board, then "got off" and the link stops working within 15 minutes |

## Still blocked or for the owner

- T10 barcode scanner, LED and buzzer: the maker's SDK (`HARDWARE.md`).
- Kiosk lock on the 5 unlocked tablets, boarding tablets for Grenville and
  St. George, the camera relay (TURN): on the devices or in Cloudflare.
- No tablet had checked in since 30 Oct when PR #16 went live (1 Nov), so
  the 15-minute device checks in `ROLLOUT.md` are still to do when the
  fleet is back on.

## Test results (1 Nov 2026, sandbox, branch `more-updates`)

| Suite | Result |
|---|---|
| Unit and server-function tests (`npx vitest run`) | **1481 passed**, 0 failed (181 files), including regular days off (ask, approve, stop, driver lists) and journey sharing (what the link shows, when it ends, stop, new link, bus change) |
| Production security tests (`npm run test:security:release`) | **188 passed**, 0 failed |
| Browser tests, full list, after merging `main` | **544 passed**, 5 failed, 1 skipped. The 5 are `first-open`, which can't start this sandbox's browser (known; pass in CI). After adding regular days off and journey sharing, the affected specs were re-run: route check (now with `/share`), passenger, driver phone, driver manifest, button check and the new `journey-share`: 219 passed, 0 failed |
| Button-by-button check | 13 screens, 98 buttons pressed, no crash screen or uncaught error |
| Lint, generated-file checks | Pass |

No physical device was tested. Device tests F1–F9 above are still to do.
