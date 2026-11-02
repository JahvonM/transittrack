import { bearingDeg, distanceM, lerpHeading } from "@/components/map3d/routeGeometry";

// How a bus moves on live maps between GPS updates (passenger and admin maps,
// the 3D map, the flat map and the basic map all use this).
//
// A bus's real position only changes when a new GPS fix arrives: the tablet
// sends one about every 15 seconds and the apps check about every 20. Instead
// of hopping to each new fix and then standing still, the bus moves at a
// steady speed from where it is drawn to the new fix, taking about as long as
// fixes take to arrive. When the next fix lands it carries on from where it
// is, so a moving bus keeps moving.
//
// Honest by design: the bus is only ever drawn on the straight line between
// two real positions, never ahead of the newest one. If no newer fix comes it
// stops at the last real position rather than guessing where it went. It runs
// at most one update behind; "updated … ago" labels still use the real time.

export const MOTION = {
  defaultMs: 16_000, // until two fixes have been seen
  minMs: 2_000,
  maxMs: 25_000,
  turnMs: 1_200, // turning to face a new direction
  snapM: 3_000, // a bigger jump (new trip, GPS glitch) is shown straight away
};

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

export function createTrack(pos, now, heading = 0) {
  return {
    from: pos, to: pos, current: pos, t0: now, dur: 0,
    hFrom: heading, hTo: heading, heading, ht0: now,
    lastFixAt: now, interval: MOTION.defaultMs,
  };
}

// A new real position arrived. `heading` is the GPS heading when known;
// otherwise the bus faces the way it is about to move.
export function retarget(track, to, now, { heading = null, snap = false } = {}) {
  const gap = now - track.lastFixAt;
  // Learn how often fixes arrive; a long gap (the bus was parked, the screen
  // was asleep) says nothing about the usual pace, so it isn't counted.
  if (gap >= MOTION.minMs && gap <= MOTION.maxMs * 1.6) track.interval = track.interval * 0.5 + gap * 0.5;
  track.lastFixAt = now;
  const jump = distanceM(track.current, to);
  const dur = snap || jump > MOTION.snapM ? 0 : clamp(track.interval * 1.1, MOTION.minMs, MOTION.maxMs);
  const travel = bearingDeg(track.current, to);
  track.from = track.current;
  track.to = to;
  track.t0 = now;
  track.dur = dur;
  track.hFrom = track.heading;
  track.hTo = Number.isFinite(heading) ? heading : travel ?? track.heading;
  track.ht0 = now;
  if (!dur) { track.current = to; track.heading = track.hTo; track.hFrom = track.hTo; }
  return track;
}

// Only the heading changed (the bus turned on the spot).
export function turnTo(track, heading, now, { snap = false } = {}) {
  if (!Number.isFinite(heading) || Math.abs(heading - track.hTo) <= 1) return track;
  track.hFrom = snap ? heading : track.heading;
  track.hTo = heading;
  track.ht0 = now;
  if (snap) track.heading = heading;
  return track;
}

// Where the bus is drawn at `now`. Returns true while it is still moving or
// turning, so callers know whether to keep animating.
export function step(track, now) {
  const t = track.dur ? clamp((now - track.t0) / track.dur, 0, 1) : 1;
  track.current = [track.from[0] + (track.to[0] - track.from[0]) * t, track.from[1] + (track.to[1] - track.from[1]) * t];
  // Nothing to turn (a new bus, or already facing that way): not turning.
  const turn = Math.abs(((((track.hTo - track.hFrom) % 360) + 540) % 360) - 180);
  const ht = turn < 0.5 ? 1 : clamp((now - track.ht0) / MOTION.turnMs, 0, 1);
  track.heading = lerpHeading(track.hFrom, track.hTo, 1 - Math.pow(1 - ht, 3));
  return t < 1 || ht < 1;
}

// Has a real position moved enough to count as a new fix?
export const movedTo = (track, to) => distanceM(track.to, to) > 0.5;

export function prefersReducedMotion() {
  try { return typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches; }
  catch { return false; }
}
