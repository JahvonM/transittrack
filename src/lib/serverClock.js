// How far this device's clock is from the server's, learned from each live
// refresh (the server says what time it is). A PC, phone or tablet with the
// wrong date or time - or a clock set by hand in the wrong time zone - used to
// show every bus as "Signal lost" while other devices showed it live, because
// a bus's last fix looked hours old (or in the future) by that clock.
// Differences under 30 s are ignored: they change nothing on screen.
const MIN_SKEW_MS = 30_000;
const MAX_ROUND_TRIP_MS = 15_000;
let offset = 0;

/** serverMs: the server's time in the reply; sentAt/receivedAt: this device's
 *  clock around the request. Slow replies are not trusted. */
export function noteServerTime(serverMs, sentAt, receivedAt) {
  if (![serverMs, sentAt, receivedAt].every(Number.isFinite)) return;
  if (receivedAt < sentAt || receivedAt - sentAt > MAX_ROUND_TRIP_MS) return;
  const measured = serverMs - (sentAt + receivedAt) / 2;
  offset = Math.abs(measured) >= MIN_SKEW_MS ? Math.round(measured) : 0;
}

/** Add to this device's Date.now() to get the server's time. */
export const clockOffsetMs = () => offset;
/** This device's time, corrected to the server's when it is known to be off. */
export const serverNow = (now = Date.now()) => now + offset;
export const resetServerClock = () => { offset = 0; };
