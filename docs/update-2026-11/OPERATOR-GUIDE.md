# What's new, and how to use it

For the office and drivers. Nothing here needs a computer person.

## Cards

- **Card issuing → Issued cards** shows each card as Active, Suspended, Lost,
  Revoked or Replaced.
- To stop a card, press **Stop card** and choose:
  - **Suspend** if it might come back (you can **Switch back on** later).
  - **Report lost** if it's gone. A lost card can't be switched back on.
    If it turns up, issue it again (tap it on the reader as a new card).
  - **Revoke** if it must never work again.
- Online boarding tablets stop accepting the card within about 30 seconds.
  A tablet without a connection may still accept it until it reconnects
  (24 hours at most). Those taps are kept and marked for review.
- Under each passenger, the bus line says when the bus tablet last
  **downloaded** its card list and how many cards it has. If it says the bus
  has no set-up, paired boarding tablet, cards can't reach that bus: pair
  one in **Kiosk tablets**.

## Boarding tablets

- In **Kiosk tablets → Reassign**, choose what the reader records:
  - **Boarding and getting off (asks each time)**: as before.
  - **Boarding only**: front door; records straight away.
  - **Getting off only**: rear door.
  - Tick **Only accept taps while a driver shift is open** if you want taps
    refused when no driver has started their shift.
- A second tap within 30 minutes shows **Already recorded** and adds nothing.
- On the tablet, hold the top bar for 3 seconds and enter the bus PIN for
  **Tablet settings**. **Diagnostics** shows, in plain words, whether the
  card reader, camera, card list, saved taps, connection and kiosk lock are
  working. **Copy for support** copies it without any card numbers or names.
- **Kiosk tablets** shows each tablet's protection: *active*, *limited*,
  *setup required* (and what is missing), *not reported*, or *failed* (and
  why). On 1 November only 2 of 7 tablets were locked. To lock one: on the
  tablet, Tablet settings → Startup → **Kiosk lock & exit code**, set an exit
  code, turn kiosk mode on. A tablet that says "not a managed kiosk" needs
  the USB setup tool. Nothing is changed on a tablet from the office.

## Driver tablet: Passengers

- Each passenger shows **On board since…**, **Got off at…**, **Didn't show**
  or nothing yet, plus any **Help:** note they asked for (for example a lower
  step).
- With the bus stopped, the driver can mark **Didn't show** (and undo it),
  or **Got on / Got off (no tap)** for someone who couldn't tap. Each mark is
  saved with the driver's name and shows in Change history; got on / off is
  marked for review.

## Passenger requests (Admin → Passenger support)

- Passengers can ask to change a pickup time or place for one day, cancel a
  ride on a later day, report a missed pickup, a card or booking problem, or
  rate a ride. Each has a reference like **TT-7K3Q2M**.
- Open one to read it, **Send reply**, or **Confirm** / **Turn down** (turning
  down needs a message saying why) / **Mark resolved**. The passenger sees
  your reply and the status in their app.
- Confirming tells the passenger it's arranged. Make the change itself (the
  driver, the pickup or the job) the usual way.

## Fleet workspace (Admin → Fleet workspace)

Laid out as a monitoring screen with four tabs:

- **Live view**: a tile per bus (live or last known location, speed, people
  on board where a boarding tablet is reporting, shift and driver, faults,
  tablet protection), the live map, and a **Buses** list with location,
  speed and cameras. Tap a row in the list to show that bus on the map.
  Search by bus, plate or driver; filter to buses with a camera, a live
  location, or something that needs attention. Tiles or List; 9 tiles a page.
- **Live camera (trial)**: on a bus whose driver tablet can be viewed, tap
  the tile, then **View back camera** or **View front camera**. Nothing
  streams until you choose a camera. Up to four at once; the tablet shows a
  Stop button, each view ends after 10 minutes, and it is logged. A view
  ends when you close it or its tile leaves the screen. Boarding tablets'
  QR cameras are never offered. Tiles show the bus picture, not a camera
  snapshot (a snapshot would mean starting the camera). If a view says
  "Direct connection mode", no relay is configured and some mobile networks
  may not connect.
- **Playback**: choose a bus to see its driver tablet's saved dashcam clips.
- **Alerts**: everything under Needs attention, each linking to where to fix it.
- **Reports**: links to driving reports, fleet and route analytics, vehicle
  logs, ride history and the boarding log.

## Route stops

In **Route planner**, each stop has a **Where to wait** box (for example
"opposite the bank, sea side"). Passengers see it under Where to wait.

## After the follow-up (branch `more-updates`, once merged)

- **Driver phone, Passenger list**: drivers see who is on board and can
  mark "Didn't show" (with Undo) or "Got on / Got off (no tap)", the same as
  on the bus tablet. Marks are off while the bus is moving.
- **Start shift on the phone** shows four steps: the bus, the walk-around,
  who to pick up today, then scanning the tablet.
- **Passengers get "Boarding confirmed" / "Exit confirmed"** on their phone
  when their tap is recorded. To switch it off for everyone or a company:
  Admin → Notifications → Boarding and exit confirmed. Passengers can turn
  it off for themselves.
- **Admin → Kiosk tablets → the tablet → Screen layout** now also has
  *Validator (card reader above the screen)* and *Passenger information
  screen (no tapping)*. A T10 uses the validator layout by itself.
- **Where passengers tap their card** (same dialog, boarding tablets): pick
  where the card reader is so the screen tells passengers where to hold
  their card.
- **My rides** lists what's coming up and what was cancelled.
- **Regular days off** (Passenger support): a passenger can ask for "Days
  I don't ride". Open the request to see the days, then Confirm or Turn
  down. Once confirmed, they're left off the driver's list on those days.
  Closing the request later ends it; the passenger can also end it.
- **Share my journey** (passenger Journey screen): passengers can send
  family a private link that shows their bus only while they're on board.
  It ends when they get off or after 3 hours. Nothing to set up.
