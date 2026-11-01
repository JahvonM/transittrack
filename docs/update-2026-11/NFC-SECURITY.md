# NFC cards: what they prove, and what they don't

## How a card works today

- Each card is identified by the number built into its chip (the **UID**).
  The office issues a card by tapping it on a reader in Card issuing. One
  record per issue is kept in `NfcCard` (the card registry), with who holds
  it, their company and its state.
- A boarding tablet reads the UID and asks the server who it belongs to
  (online), or looks it up in the list it saved for offline use.
- The offline list is per tablet and per bus. It holds names and a
  fingerprint of each card, `SHA-256(tablet id + ":" + UID)`, never the card
  numbers themselves. A fingerprint from one tablet is useless on another.
  The list expires after **24 hours**; an expired list is not used.

## The limit you should know

**A card UID is not a secret.** Most low-cost cards (MIFARE Classic, NTAG,
Ultralight) send their UID to any reader, and cheap tools can copy a UID onto
another card or a phone. So a tap proves "a card with this number was near
the reader", not "this person was there". The app treats a tap as a record
of boarding for transport purposes only. It is **not** proof of identity and
must not be used for access to money, buildings or anything high-value.

What reduces the risk today:

- Each card belongs to one person and one company; a card number claimed by
  two active records is refused.
- Taps are tied to the tablet's bus. A card tapped on another company's bus,
  or on a bus it isn't assigned to, is refused.
- A repeat tap within 30 minutes is "Already recorded", so copying a card
  doesn't add rides.
- Stopping a card (suspend, lost, revoke) works on online tablets straight
  away and reaches offline tablets when they next connect (24 h at most).
  Taps made offline with a stopped card are **kept and flagged for review**,
  never silently accepted or deleted.
- Driver corrections (got on / got off without a tap) are recorded with the
  driver's name and flagged for review.

## What is *not* promised

- **No global real-time revocation.** A tablet with no connection keeps its
  saved list until it reconnects or the list expires.
- **No perfect duplicate prevention across disconnected tablets.** Two
  offline tablets can each accept the same tap; the server spots it when both
  send, records it once if it is the same ride, and flags taps that disagree
  ("Two tablets recorded taps out of order").

## Better credentials later (not in this update)

| Option | What it adds | Needs |
|---|---|---|
| Cards with real cryptography (e.g. MIFARE DESFire EV2/EV3) | The card proves it holds a key; copying the UID is not enough | New cards, reader support for the card's authentication, key management |
| Signed passes on the card (NDEF with a server signature) | Tablet can check a pass offline without a card list | Card writing at issue; still copyable unless the card also authenticates |
| Phone passes (QR that changes, or wallet passes) | Passengers without cards; codes that expire | Already partly available (personal QR / keypad code); rotating codes need a connection or a clock-based scheme |

Any of these should be tested on one bus before buying cards for the fleet
(see `HARDWARE.md`).
