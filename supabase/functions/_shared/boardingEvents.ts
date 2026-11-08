// Boarding and exit taps on a bus: one set of rules for the boarding tablet
// (including while it is offline) and the server (kioskCheckIn), so both
// agree on what counts as a repeat and what needs a person to look at it.
//
// An event: { status: 'boarded' | 'off_board', at: ms or ISO time when it
// happened, plus anything else (id, device_id, run_key). Events are always
// compared by when they happened, not when they reached the server, so taps
// saved offline and sent later still land in the right place.

export type TapStatus = 'boarded' | 'off_board';
export type TapEvent = { status: TapStatus; at: number | string; [key: string]: unknown };

// A second tap in the same direction within this long, with nothing in
// between, is the same boarding (or exit): "Already recorded".
export const DUPLICATE_WINDOW_MS = 30 * 60_000;
// A boarding older than this with no exit no longer counts as "on board".
export const RIDE_MAX_MS = 6 * 3600_000;

// What a boarding tablet's reader records. 'both' (the default): getting on
// and off. Card taps on current tablets record by themselves (tap on, tap
// again to get off, automaticTapAdvice); codes, QR and older tablets ask.
export const READER_MODES = ['both', 'boarding', 'exit'] as const;
export type ReaderMode = typeof READER_MODES[number];
export const readerMode = (value: unknown): ReaderMode =>
  (READER_MODES as readonly string[]).includes(value as string) ? value as ReaderMode : 'both';
export const modeStatus = (mode: ReaderMode): TapStatus | null =>
  mode === 'boarding' ? 'boarded' : mode === 'exit' ? 'off_board' : null;

export const tapTime = (e: TapEvent | null | undefined) =>
  !e ? NaN : typeof e.at === 'number' ? e.at : Date.parse(String(e.at || ''));

function sorted(events: TapEvent[]) {
  return events.filter((e) => Number.isFinite(tapTime(e))).sort((a, b) => tapTime(a) - tapTime(b));
}
// The passenger's taps just before and just after `at`.
export function neighbours(events: TapEvent[], at: number) {
  const list = sorted(events);
  let before: TapEvent | null = null, after: TapEvent | null = null;
  for (const e of list) {
    if (tapTime(e) <= at) before = e;
    else { after = e; break; }
  }
  return { before, after };
}

// The event this tap repeats, if any: the same direction within the window,
// on either side in time (a tap saved offline on another tablet can arrive
// after a later one), with no tap in the other direction in between.
export function repeatOf(events: TapEvent[], status: TapStatus, at: number, windowMs = DUPLICATE_WINDOW_MS): TapEvent | null {
  const { before, after } = neighbours(events, at);
  if (before && before.status === status && at - tapTime(before) <= windowMs) return before;
  if (after && after.status === status && tapTime(after) - at <= windowMs) return after;
  return null;
}

// Why a new (non-repeat) tap should be looked at by a person, or null.
export function reviewReason(events: TapEvent[], status: TapStatus, at: number): string | null {
  const { before, after } = neighbours(events, at);
  const ride = before && at - tapTime(before) < RIDE_MAX_MS ? before : null;
  if (status === 'off_board' && (!ride || ride.status === 'off_board')) return 'exit_without_boarding';
  if (status === 'boarded' && ride && ride.status === 'boarded') return 'boarding_without_exit';
  // A tap from another tablet already recorded after this one, in the same
  // direction: two devices disagree about the order.
  if (after && after.status === status && tapTime(after) - at < RIDE_MAX_MS) return 'conflicting_devices';
  return null;
}

// What to suggest when the rider is asked: exit if they boarded within a
// ride's length, otherwise board. A reader in a fixed mode never asks.
export function suggestedStatus(events: TapEvent[], now: number, mode: ReaderMode = 'both'): TapStatus {
  const fixed = modeStatus(mode);
  if (fixed) return fixed;
  const { before } = neighbours(events, now);
  return before && before.status === 'boarded' && now - tapTime(before) < RIDE_MAX_MS ? 'off_board' : 'boarded';
}

// What a boarding tablet should do with a tap: the direction to record (the
// reader's fixed one, or a suggestion) and the tap it repeats, if any. A
// reader that asks treats any tap within the window as a repeat, so a double
// tap is never read as getting off.
export function tapAdvice(taps: TapEvent[], mode: ReaderMode, now: number) {
  const fixed = modeStatus(mode);
  const status = suggestedStatus(taps, now, mode);
  const last = neighbours(taps, now).before;
  const repeat = fixed ? repeatOf(taps, fixed, now) : (last && now - tapTime(last) <= DUPLICATE_WINDOW_MS ? last : null);
  return { status, repeat };
}

// On a both-way reader a card tap records by itself: getting on if the rider
// isn't on the bus, getting off if they are. A tap this soon after their last
// one is a double tap, not getting off: "Already recorded" (wait, then tap).
export const AUTO_TAP_WAIT_MS = 5 * 60_000;
export function automaticTapAdvice(taps: TapEvent[], now: number) {
  const last = neighbours(taps, now).before;
  const repeat = last && now - tapTime(last) < AUTO_TAP_WAIT_MS ? last : null;
  return { status: suggestedStatus(taps, now, 'both'), repeat };
}

// Whether the passenger is on the bus at `now`, from their own taps.
export function onBoard(events: TapEvent[], now: number) {
  const { before } = neighbours(events, now);
  const on = !!before && before.status === 'boarded' && now - tapTime(before) < RIDE_MAX_MS;
  return { onBoard: on, since: on ? tapTime(before) : null };
}

// How many people are on a bus, from everyone's taps grouped by person key.
export function onBoardCount(byPerson: Record<string, TapEvent[]>, now: number) {
  return Object.values(byPerson).filter((events) => onBoard(events, now).onBoard).length;
}

export const REVIEW_TEXT: Record<string, string> = {
  exit_without_boarding: 'Exit with no boarding recorded',
  boarding_without_exit: 'Boarded again with no exit recorded',
  conflicting_devices: 'Two tablets recorded taps out of order',
  revoked_card_used_offline: 'Card was already cancelled when tapped offline',
  card_changed_after_tap: 'Card was replaced or cancelled after this offline tap',
  no_active_trip: 'No driver shift was open on this bus',
  history_unavailable: 'Recorded without checking for a repeat (history could not be read)',
  driver_correction: 'Recorded by the driver (the passenger could not tap)',
};
