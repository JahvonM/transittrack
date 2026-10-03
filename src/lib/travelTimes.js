// Real travel times learned from TransitTrack's own buses.
//
// Every bus logs where it is about once a minute (LocationPing). From that
// history this works out how long each bus actually took between each pair
// of stops on its route — by day type and hour, in Grenada time — and uses
// those times for passenger ETAs. That beats any map provider for Grenada,
// where Mapbox/Google have little traffic or speed data.
//
// The part between the "shared" markers is copied word-for-word into
// base44/functions/learnTravelTimes/entry.ts (backend functions can't import
// app code). A unit test fails if the two copies differ.

// --- shared:start ---
const EARTH_M = 6371000;
const toRad = (d) => (d * Math.PI) / 180;

export function metresBetween(aLat, aLng, bLat, bLng) {
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

// A bus that comes this close to a stop is counted as serving it.
export const STOP_RADIUS_M = 120;
// Pings further apart than this are a break in the trip (parked, no signal).
export const MAX_PING_GAP_MS = 5 * 60 * 1000;
// A stop-to-stop leg longer than this is not normal driving (breakdown, detour).
export const MAX_LEG_S = 60 * 60;
export const TIME_ZONE = "America/Grenada";

// Stops are identified by position, so editing a route (adding a stop,
// renaming one) keeps everything learned about the unchanged legs.
export function stopKey(stop) {
  return `${Number(stop.lat).toFixed(4)},${Number(stop.lng).toFixed(4)}`;
}
export function legKey(a, b) {
  return `${stopKey(a)}>${stopKey(b)}`;
}

const DAY_TYPE = { Sat: "sa", Sun: "su" };
// "wd07" = a weekday between 7:00 and 7:59 in Grenada; "sa" Saturday, "su" Sunday.
export function bucketOf(ms, timeZone = TIME_ZONE) {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone, weekday: "short", hour: "2-digit", hourCycle: "h23" }).formatToParts(new Date(ms));
  const wd = parts.find((p) => p.type === "weekday")?.value;
  const hour = parts.find((p) => p.type === "hour")?.value || "00";
  return `${DAY_TYPE[wd] || "wd"}${hour.padStart(2, "0")}`;
}

// When the bus passed each stop. Between two pings the bus is assumed to
// drive in a straight line at steady speed, so a stop is caught even when
// no ping landed right at it. A bus waiting at a stop gives an arrival and
// a departure time.
export function stopPassages(pings, stops) {
  const pts = (pings || [])
    .map((p) => ({ t: new Date(p.recorded_at ?? p.t).getTime(), lat: Number(p.lat), lng: Number(p.lng) }))
    .filter((p) => Number.isFinite(p.t) && Number.isFinite(p.lat) && Number.isFinite(p.lng))
    .sort((a, b) => a.t - b.t);
  const events = [];
  for (let k = 0; k + 1 < pts.length; k++) {
    const p = pts[k];
    const q = pts[k + 1];
    if (q.t - p.t > MAX_PING_GAP_MS || q.t <= p.t) continue;
    const kx = EARTH_M * Math.cos(toRad(p.lat));
    const px = toRad(p.lng) * kx, py = toRad(p.lat) * EARTH_M;
    const dx = toRad(q.lng) * kx - px, dy = toRad(q.lat) * EARTH_M - py;
    const len2 = dx * dx + dy * dy;
    stops.forEach((s, i) => {
      const sx = toRad(s.lng) * kx - px, sy = toRad(s.lat) * EARTH_M - py;
      const t = len2 > 0 ? Math.max(0, Math.min(1, (sx * dx + sy * dy) / len2)) : 0;
      const d = Math.hypot(sx - t * dx, sy - t * dy);
      if (d <= STOP_RADIUS_M) {
        // While inside the circle the whole time (waiting at the stop), keep
        // both ends so the wait shows up as arrive -> depart.
        const inP = metresBetween(p.lat, p.lng, s.lat, s.lng) <= STOP_RADIUS_M;
        const inQ = metresBetween(q.lat, q.lng, s.lat, s.lng) <= STOP_RADIUS_M;
        if (inP && inQ) { events.push({ stop: i, t: p.t }); events.push({ stop: i, t: q.t }); }
        else events.push({ stop: i, t: Math.round(p.t + t * (q.t - p.t)) });
      }
    });
  }
  events.sort((a, b) => a.t - b.t);
  const passages = [];
  for (const e of events) {
    const last = passages[passages.length - 1];
    if (last && last.stop === e.stop && e.t - last.depart <= MAX_PING_GAP_MS) last.depart = Math.max(last.depart, e.t);
    else passages.push({ stop: e.stop, arrive: e.t, depart: e.t });
  }
  return passages;
}

// Leg times (leave stop i -> reach stop i+1) and waiting times at stops.
export function tripSamples(passages, stops) {
  const legs = [];
  const dwells = [];
  for (let k = 0; k < passages.length; k++) {
    const a = passages[k];
    const wait = (a.depart - a.arrive) / 1000;
    if (wait > 0 && wait <= 15 * 60) dwells.push({ key: stopKey(stops[a.stop]), seconds: wait, at: a.arrive });
    const b = passages[k + 1];
    if (!b || b.stop !== a.stop + 1) continue;
    const seconds = (b.arrive - a.depart) / 1000;
    if (seconds < 5 || seconds > MAX_LEG_S) continue;
    legs.push({ key: legKey(stops[a.stop], stops[b.stop]), seconds, at: a.depart });
  }
  return { legs, dwells };
}

function quantile(sorted, q) {
  if (!sorted.length) return null;
  const i = (sorted.length - 1) * q;
  const lo = Math.floor(i);
  const hi = Math.ceil(i);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (i - lo);
}
export function summarize(values) {
  const v = values.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  if (!v.length) return null;
  return { n: v.length, median: Math.round(quantile(v, 0.5)), p80: Math.round(quantile(v, 0.8)) };
}

// All samples -> what's stored: overall and per hour bucket, per leg and stop.
export function buildStats(samples, timeZone = TIME_ZONE) {
  const group = (list) => {
    const out = {};
    const byKey = {};
    for (const s of list) (byKey[s.key] = byKey[s.key] || []).push(s);
    for (const [key, items] of Object.entries(byKey)) {
      const buckets = {};
      const byBucket = {};
      for (const s of items) {
        const b = bucketOf(s.at, timeZone);
        (byBucket[b] = byBucket[b] || []).push(s.seconds);
      }
      for (const [b, secs] of Object.entries(byBucket)) {
        const sm = summarize(secs);
        buckets[b] = { n: sm.n, median: sm.median };
      }
      out[key] = { all: summarize(items.map((s) => s.seconds)), b: buckets };
    }
    return out;
  };
  return { legs: group(samples.legs || []), dwells: group(samples.dwells || []) };
}
// --- shared:end ---

// ---------------------------------------------------------------------------
// Using what was learned (app only).

const MIN_BUCKET_SAMPLES = 3;
const MIN_ALL_SAMPLES = 2;
// Straight-line distance understates the road; used only with no learned data.
const ROAD_FACTOR = 1.3;
const DEFAULT_KMH = 25;

// Typical seconds for a leg at a given time: that exact hour, then the hours
// either side on the same kind of day, then any time.
export function typicalSeconds(entry, bucket) {
  if (!entry) return null;
  const b = entry.b || {};
  if (b[bucket]?.n >= MIN_BUCKET_SAMPLES) return b[bucket].median;
  const type = bucket.slice(0, 2);
  const hour = Number(bucket.slice(2));
  const near = [hour - 1, hour + 1]
    .filter((h) => h >= 0 && h <= 23)
    .map((h) => b[`${type}${String(h).padStart(2, "0")}`])
    .filter((x) => x?.n >= MIN_BUCKET_SAMPLES);
  if (near.length) {
    const n = near.reduce((s, x) => s + x.n, 0);
    return Math.round(near.reduce((s, x) => s + x.median * x.n, 0) / n);
  }
  if (entry.all?.n >= MIN_ALL_SAMPLES) return entry.all.median;
  return null;
}

// Where the bus is on its route: the leg (stop i -> i+1) it's closest to,
// and how far along that leg it is (0..1).
export function locateOnRoute(stops, pos) {
  if (!stops?.length || pos?.lat == null) return null;
  const kx = EARTH_M * Math.cos(toRad(pos.lat));
  const xy = (s) => [toRad(s.lng) * kx, toRad(s.lat) * EARTH_M];
  const p = xy(pos);
  let best = null;
  for (let i = 0; i + 1 < stops.length; i++) {
    const a = xy(stops[i]);
    const b = xy(stops[i + 1]);
    const dx = b[0] - a[0], dy = b[1] - a[1];
    const len2 = dx * dx + dy * dy;
    const t = len2 > 0 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2)) : 0;
    const d = Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
    if (!best || d < best.offM) best = { leg: i, frac: t, offM: d };
  }
  return best;
}

// ETA in seconds from the bus's position to stop `target` on its route,
// adding up learned leg times (and typical waits at the stops in between).
// Legs with nothing learned yet use distance at the route's learned average
// speed (or 25 km/h). `learnedShare` says how much of the answer is real
// trip data; `trips` is the smallest sample count behind the learned legs.
export function learnedEta({ stats, stops, pos, target, now = Date.now(), timeZone }) {
  if (!stops?.length || target == null || target < 0 || target >= stops.length) return null;
  const at = stops[target];
  if (metresBetween(pos.lat, pos.lng, at.lat, at.lng) <= STOP_RADIUS_M) return { seconds: 0, learnedShare: 1, trips: null };
  const where = locateOnRoute(stops, pos);
  if (!where) return null;
  // Already past the stop on this run.
  if (target <= where.leg) return null;
  const bucket = bucketOf(now, timeZone);
  const legs = stats?.legs || {};
  const dwells = stats?.dwells || {};

  // The route's own average speed from learned legs (for legs without data).
  let learnedM = 0, learnedS = 0;
  for (let i = 0; i + 1 < stops.length; i++) {
    const s = typicalSeconds(legs[legKey(stops[i], stops[i + 1])], bucket);
    if (s) { learnedM += metresBetween(stops[i].lat, stops[i].lng, stops[i + 1].lat, stops[i + 1].lng) * ROAD_FACTOR; learnedS += s; }
  }
  const mps = learnedS > 0 ? learnedM / learnedS : (DEFAULT_KMH * 1000) / 3600;

  let seconds = 0, fromLearned = 0, minTrips = null;
  for (let i = where.leg; i < target; i++) {
    const a = stops[i];
    const b = stops[i + 1];
    const entry = legs[legKey(a, b)];
    const learned = typicalSeconds(entry, bucket);
    const legS = learned ?? (metresBetween(a.lat, a.lng, b.lat, b.lng) * ROAD_FACTOR) / mps;
    const part = i === where.leg ? 1 - where.frac : 1;
    seconds += legS * part;
    if (learned != null) {
      fromLearned += legS * part;
      const n = entry?.all?.n ?? 0;
      minTrips = minTrips == null ? n : Math.min(minTrips, n);
    }
    // Waiting at the stops in between (not the one you're waiting at).
    if (i + 1 < target) seconds += typicalSeconds(dwells[stopKey(b)], bucket) || 0;
  }
  return { seconds: Math.round(seconds), learnedShare: seconds > 0 ? fromLearned / seconds : 0, trips: minTrips };
}

// How much of a route has been learned: legs with data / all legs.
export function routeCoverage(stats, stops) {
  const total = Math.max(0, (stops?.length || 0) - 1);
  let learned = 0;
  for (let i = 0; i < total; i++) if (stats?.legs?.[legKey(stops[i], stops[i + 1])]?.all?.n >= MIN_ALL_SAMPLES) learned++;
  return { learned, total };
}
