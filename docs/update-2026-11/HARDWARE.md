# Hardware compatibility matrix

Status words: **Verified** = seen working on this device (in the field or in
its live reports). **Reported** = the device reports it, not tested by hand
in this update. **Untested** = expected from specifications only. **Blocked**
= needs something we don't have (usually the maker's software or documents).

Device facts below come from the tablets' own reports in Admin (1 Nov 2026)
and from the operator. No device was available to test by hand during this
update.

## Devices in use

| | Coolpad K18 phone | CRELANDER T30Pro tablet | QUALCOMM T10 validator (test unit) | USB NFC reader + Windows/Android helper |
|---|---|---|---|---|
| Role and mounting | Boarding kiosk (phone layout), St. Pauls Bus 01 | Driver tablet (dash), signing tablet (guest-facing) | Boarding validator trial, by the door | Card issuing at the office; external reader on tablets |
| Screen | Phone, portrait | 10" landscape | Small validator screen | — |
| Android | 14 | 10 | 12 | — |
| NFC | Built-in phone NFC: **Reported** working | Not used for boarding | Built-in reader: **Verified** reads a sample card (operator) | **Verified** (card issuing in use) |
| Card types | UID cards (MIFARE/NTAG): **Reported** | — | Sample card only: **Untested** for the fleet's cards | MIFARE Classic, NTAG/Ultralight: **Verified** |
| QR | Camera QR: **Untested** on this phone | Camera QR (signing): **Untested** | Built-in barcode scanner: **Blocked** (needs the maker's SDK; not a normal Android camera). Camera QR: **Untested** | — |
| Sound / light | Phone speaker: sounds and speech added (**Untested** on device) | Speaker | LED and buzzer: **Blocked** (maker's SDK) | Reader flashes and beeps per tap: **Verified** |
| Manufacturer SDK | Not needed | Not needed | **Not available**: scanner, LED, buzzer interfaces unknown | Helper app (ours) |
| Android management | Device owner: **Reported yes**. Kiosk mode: **off** | Device owner: **Reported yes**. Kiosk mode on for 2 of 3 driver tablets; off on both signing tablets | Device owner: **Reported no**. App can't lock it | — |
| Updates | McSween kiosk app 2.0 | McSween kiosk app 2.0 | McSween kiosk app 2.0 | Helper |
| Connectivity / offline | Mobile data or bus hotspot; offline card list and saved taps | Hotspot for the bus (Android 10 needs `hidden_api_policy 1`, see audit F12) | **Untested** | — |
| Vehicle power | USB charger | 12 V dash supply | **Untested** (validator supply) | USB |
| Environment | Indoor phone; heat in direct sun is a risk (battery temperature is reported) | Dash heat: battery temperature reported | **Untested** | Office |
| Replacement / support | Retail phone | Supplier | Unknown supplier support | — |

## What blocks the T10

The T10's NFC works through standard Android NFC. Its barcode scanner, LED
and buzzer do not: they need the maker's own interface. We have no SDK,
sample app or documents for it, and we have not guessed. Until we get the
exact model and firmware, the maker's SDK and a sample app, the T10 can be
used only as a card reader with camera QR (if its camera works), and it
can't be locked as a kiosk because it isn't set up as a managed device.

To unblock: ask the supplier for (1) the exact model and firmware version,
(2) the Android SDK and sample app for scanner, LED and buzzer, (3) the
supported card and barcode formats. Then test on one bus first.

## Before buying for the fleet

1. Prefer devices already working: the T30Pro (driver) and a phone like the
   K18 (boarding) are known to work with the app and kiosk protection.
2. Any new device: test one complete bus (driver tablet, boarding device,
   power, mounting, mobile data) for a week before ordering more.
3. Check, on that device: NFC with the fleet's own cards, camera QR in
   daylight and at night, kiosk lock (managed set-up through the USB setup
   tool), offline taps and sync, heat on the dash, and the Diagnostics
   screen (Tablet settings → Diagnostics).
