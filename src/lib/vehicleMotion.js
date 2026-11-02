import { bearingDeg, distanceM, lerpHeading, nearestOnLine } from "@/components/map3d/routeGeometry";

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
// On its route's drawn road (Route Planner), a bus follows the road between
// two real positions, round the bends, instead of cutting across them;
// elsewhere it moves in a straight line.
//
// Honest by design: the bus is only ever drawn between two real positions
// (along its own road, or straight), never ahead of the newest one. If no
// newer fix comes it stops at the last real position rather than guessing
// where it went. It runs at most one update behind; "updated … ago" labels
// still use the real time.

export const MOTION = {
  defaultMs: 16_000, // until two fixes have been seen
  minMs: 2_000,
  maxMs: 25_000,
  turnMs: 1_200, // turning to face a new direction
  snapM: 3_000, // a bigger jump (new trip, GPS glitch) is shown straight away
  segmentTurnMs: 500, // turning from one stretch of road to the next
};

// When a move follows the route's road: both ends within maxOffM of it, and
// the road between them no longer than a plausible drive (a route that doubles
// back on itself, or a bus that took a short cut, moves straight instead).
export const ROAD = { maxOffM: 35, maxDetour: 2.2, extraM: 250 };

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const lengthOf = (pts) => { let m = 0; for (let i = 1; i < pts.length; i++) m += distanceM(pts[i - 1], pts[i]); return m; };

// The road between two positions, as [from, ...road points..., to], or null
// when the move should be a straight line. Works in either direction (a
// route's return trip drives its road backwards).
export function roadPath(road, from, to) {
  if (!Array.isArray(road) || road.length < 2 || !from || !to) return null;
  const a = nearestOnLine(road, from), b = nearestOnLine(road, to);
  if (!a || !b || a.offM > ROAD.maxOffM || b.offM > ROAD.maxOffM) return null;
  const forward = a.index < b.index || (a.index === b.index && a.t <= b.t);
  const mid = forward ? road.slice(a.index + 1, b.index + 1) : road.slice(b.index + 1, a.index + 1).reverse();
  // Points on top of each other (the bus exactly on a corner) add nothing.
  const pts = [from];
  for (const p of [...mid, to]) if (distanceM(pts[pts.length - 1], p) >= 0.5) pts.push(p);
  if (distanceM(pts[pts.length - 1], to) > 0) pts[pts.length - 1] = to;
  if (pts.length < 3) return null; // one stretch of road: straight is the road
  const straight = distanceM(from, to);
  if (lengthOf(pts) > Math.max(straight * ROAD.maxDetour, straight + ROAD.extraM)) return null;
  return pts;
}

// Cumulative distances along a path, for steady speed.
function measure(pts) {
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + distanceM(pts[i - 1], pts[i]));
  return cum;
}

export function createTrack(pos, now, heading = 0) {
  return {
    from: pos, to: pos, current: pos, t0: now, dur: 0,
    hFrom: heading, hTo: heading, heading, ht0: now,
    lastFixAt: now, interval: MOTION.defaultMs,
  };
}

// A new real position arrived. `heading` is the GPS heading when known;
// otherwise the bus faces the way it is about to move. `road` is the bus's
// route road as [lng, lat] pairs, when it has one.
export function retarget(track, to, now, { heading = null, snap = false, road = null } = {}) {
  const gap = now - track.lastFixAt;
  // Learn how often fixes arrive; a long gap (the bus was parked, the screen
  // was asleep) says nothing about the usual pace, so it isn't counted.
  if (gap >= MOTION.minMs && gap <= MOTION.maxMs * 1.6) track.interval = track.interval * 0.5 + gap * 0.5;
  track.lastFixAt = now;
  const jump = distanceM(track.current, to);
  const dur = snap || jump > MOTION.snapM ? 0 : clamp(track.interval * 1.1, MOTION.minMs, MOTION.maxMs);
  const path = dur ? roadPath(road, track.current, to) : null;
  track.from = track.current;
  track.to = to;
  track.t0 = now;
  track.dur = dur;
  // Along the road: a list of points at steady speed, facing each stretch.
  track.pts = path;
  track.cum = path ? measure(path) : null;
  track.seg = 0;
  const travel = path ? bearingDeg(path[0], path[1], 0.5) : bearingDeg(track.current, to);
  track.hFrom = track.heading;
  track.hTo = path ? travel ?? track.heading : Number.isFinite(heading) ? heading : travel ?? track.heading;
  track.ht0 = now;
  track.turnMs = MOTION.turnMs;
  if (!dur) { track.current = to; track.heading = track.hTo; track.hFrom = track.hTo; }
  return track;
}

// Where along the road `t` (0..1 of the time) puts the bus, turning to face
// each new stretch of road as it reaches it.
function alongRoad(track, t, now) {
  const { pts, cum } = track;
  const total = cum[cum.length - 1];
  const d = t * total;
  let i = Math.min(track.seg, pts.length - 2);
  while (i < pts.length - 2 && cum[i + 1] <= d) i += 1;
  const len = cum[i + 1] - cum[i];
  const f = len > 0 ? clamp((d - cum[i]) / len, 0, 1) : 1;
  track.current = [pts[i][0] + (pts[i + 1][0] - pts[i][0]) * f, pts[i][1] + (pts[i + 1][1] - pts[i][1]) * f];
  if (i !== track.seg) {
    track.seg = i;
    const b = bearingDeg(pts[i], pts[i + 1], 0.5);
    if (b != null) { track.hFrom = track.heading; track.hTo = b; track.ht0 = now; track.turnMs = MOTION.segmentTurnMs; }
  }
}

// Only the heading changed (the bus turned on the spot).
export function turnTo(track, heading, now, { snap = false } = {}) {
  if (!Number.isFinite(heading) || Math.abs(heading - track.hTo) <= 1) return track;
  track.hFrom = snap ? heading : track.heading;
  track.hTo = heading;
  track.ht0 = now;
  track.turnMs = MOTION.turnMs;
  if (snap) track.heading = heading;
  return track;
}

// Where the bus is drawn at `now`. Returns true while it is still moving or
// turning, so callers know whether to keep animating.
export function step(track, now) {
  const t = track.dur ? clamp((now - track.t0) / track.dur, 0, 1) : 1;
  if (track.pts && track.cum) alongRoad(track, t, now);
  else track.current = [track.from[0] + (track.to[0] - track.from[0]) * t, track.from[1] + (track.to[1] - track.from[1]) * t];
  if (t >= 1) track.current = track.to;
  // Nothing to turn (a new bus, or already facing that way): not turning.
  const turn = Math.abs(((((track.hTo - track.hFrom) % 360) + 540) % 360) - 180);
  const ht = turn < 0.5 ? 1 : clamp((now - track.ht0) / (track.turnMs || MOTION.turnMs), 0, 1);
  track.heading = lerpHeading(track.hFrom, track.hTo, 1 - Math.pow(1 - ht, 3));
  return t < 1 || ht < 1;
}

// Has a real position moved enough to count as a new fix?
export const movedTo = (track, to) => distanceM(track.to, to) > 0.5;

export function prefersReducedMotion() {
  try { return typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches; }
  catch { return false; }
}
