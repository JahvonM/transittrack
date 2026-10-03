# Regenerates base44/functions/learnTravelTimes/entry.ts with the shared
# learning code copied from src/lib/travelTimes.js (backend functions can't
# import app code). Run after editing the shared part:  python3 tools/gen_learn_travel_times.py
src = open("src/lib/travelTimes.js").read()
start = src.index("// --- shared:start ---")
end = src.index("// --- shared:end ---") + len("// --- shared:end ---")
shared = src[start:end]

HEAD = """import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';

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

"""

TAIL = """

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
"""

import os
os.makedirs("base44/functions/learnTravelTimes", exist_ok=True)
open("base44/functions/learnTravelTimes/entry.ts", "w").write(HEAD + shared + TAIL)
print("wrote base44/functions/learnTravelTimes/entry.ts", len(HEAD + shared + TAIL))
