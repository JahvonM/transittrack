import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';

// Learns how long buses really take between the stops on each route, from
// their own GPS history (LocationPing), and saves it per route in
// RouteTravelTimes. Passenger ETAs use it (src/lib/travelTimes.js).
// Runs every night (workflow "Nightly travel time learning") and from
// Admin -> Travel times -> Learn now.
//
// The block between the "shared" markers is an exact copy of the same block
// in src/lib/travelTimes.js — edit it there, then run tools/gen_learn_travel_times.py.
// A unit test fails if the copies differ.

const DAY_MS = 24 * 60 * 60 * 1000;
const LOOKBACK_DAYS = 42;

// Reachable with no login (the scheduler calls it that way), so outside an
// admin it may only run once every 10 minutes.
async function claimRun(base44, job, minGapMs, isAdmin) {
  const db = base44.asServiceRole.entities.JobRun;
  const last = (await db.filter({ job }, '-ran_at', 1))[0];
  if (!isAdmin && last && Date.now() - new Date(last.ran_at).getTime() < minGapMs) return false;
  await db.create({ job, ran_at: new Date().toISOString(), trigger: isAdmin ? 'admin' : 'schedule' });
  return true;
}

// A vehicle's pings since `since`, oldest first, a week at a time.
async function loadPings(db, vehicleId, since) {
  const out = [];
  for (let from = since; from < Date.now(); from += 7 * DAY_MS) {
    const to = Math.min(from + 7 * DAY_MS, Date.now() + 60000);
    let rows;
    try {
      rows = await db.LocationPing.filter(
        { vehicle_id: vehicleId, recorded_at: { $gte: new Date(from).toISOString(), $lt: new Date(to).toISOString() } },
        'recorded_at', 10000,
      );
    } catch {
      rows = (await db.LocationPing.filter({ vehicle_id: vehicleId }, '-recorded_at', 10000))
        .filter((r) => { const t = Date.parse(r.recorded_at); return t >= from && t < to; });
    }
    out.push(...rows);
  }
  return out;
}

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

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    let body = {};
    try { body = await req.json(); } catch { /* no body (scheduled run) */ }
    let isAdmin = false;
    try {
      const user = await base44.auth.me();
      if (user && user.role !== 'admin') return Response.json({ error: 'Admins only' }, { status: 403 });
      isAdmin = user?.role === 'admin';
    } catch { /* scheduled run, no user */ }
    if (!(await claimRun(base44, 'learnTravelTimes', 10 * 60 * 1000, isAdmin))) {
      return Response.json({ ok: true, skipped: 'Ran less than 10 minutes ago' });
    }

    const db = base44.asServiceRole.entities;
    const since = Date.now() - LOOKBACK_DAYS * DAY_MS;
    const routes = (await db.Route.list('-updated_date', 500))
      .filter((r) => r.active !== false && (!body.route_id || r.id === body.route_id));
    const vehicles = await db.Vehicle.list('-updated_date', 1000);
    const saved = await db.RouteTravelTimes.list('-updated_date', 1000);
    const pingCache = new Map();
    const results = [];

    for (const route of routes) {
      const stops = (route.stops || [])
        .filter((s) => Number.isFinite(Number(s?.lat)) && Number.isFinite(Number(s?.lng)))
        .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
      if (stops.length < 2) continue;
      const onRoute = vehicles.filter((v) => v.route_id === route.id);
      const samples = { legs: [], dwells: [] };
      let pingsUsed = 0;
      for (const v of onRoute) {
        if (!pingCache.has(v.id)) pingCache.set(v.id, await loadPings(db, v.id, since));
        const pings = pingCache.get(v.id);
        pingsUsed += pings.length;
        const s = tripSamples(stopPassages(pings, stops), stops);
        samples.legs.push(...s.legs);
        samples.dwells.push(...s.dwells);
      }
      const stats = buildStats(samples);
      const record = {
        route_id: route.id,
        route_name: route.name || '',
        company_id: route.company_id || '',
        legs: stats.legs,
        dwells: stats.dwells,
        leg_samples: samples.legs.length,
        pings_used: pingsUsed,
        vehicles_used: onRoute.length,
        days: LOOKBACK_DAYS,
        learned_at: new Date().toISOString(),
      };
      const existing = saved.find((r) => r.route_id === route.id);
      if (existing) await db.RouteTravelTimes.update(existing.id, record);
      else await db.RouteTravelTimes.create(record);
      results.push({ route: route.name, buses: onRoute.length, pings: pingsUsed, legs: samples.legs.length, waits: samples.dwells.length });
    }

    await db.JobRun.create({
      job: 'learnTravelTimes:result', ran_at: new Date().toISOString(), trigger: isAdmin ? 'admin' : 'schedule',
      summary: results.map((r) => `${r.route}: ${r.legs} legs from ${r.pings} points`).join('; ').slice(0, 900),
    }).catch(() => {});
    return Response.json({ ok: true, routes: results });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}
