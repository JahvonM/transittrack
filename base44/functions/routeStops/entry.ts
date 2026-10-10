import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';
import { pickupStops, mergeDistance, roadPointsToLine } from '../../shared/pickupStops.ts';

// The stops a route's bus makes along its drawn road: every passenger's
// pickup on that road, with neighbours' pickups merged into one stop (see
// shared/pickupStops.ts).
//
//  action 'route' (admin): a route's full stop list with who gets on where,
//    and the pickups too far from the road.
//  action 'mine' (passenger): only the caller's own stop: where to meet, how
//    far it is from the spot they picked, and how many others share it. Never
//    anyone else's name or pickup.

function fail(status, message) { throw Object.assign(new Error(message), { status }); }
const norm = (value) => String(value || '').trim().toLowerCase();
async function digest(value) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(bytes), (b) => b.toString(16).padStart(2, '0')).join('');
}
// A passenger membership still counts: admin-approved, or made with the
// company's current code.
async function liveMembership(db, row) {
  if (!row.expires_at && !row.code_hash) return true;
  if (!row.code_hash) return false;
  const company = await db.Company.get(row.company_id).catch(() => null);
  return !!company && row.code_hash === await digest(company.access_code || '');
}
const finite = (lat, lng) => Number.isFinite(Number(lat)) && Number.isFinite(Number(lng)) && lat !== null && lng !== null;

// Everyone who gets on along this route: app accounts whose pickup is on it,
// and directory passengers riding a bus that runs it.
async function riders(db, route) {
  const companyId = route.company_id;
  const memberships = await db.CompanyMembership.filter({ company_id: companyId, scope: 'passenger', active: true }, '-updated_date', 5000);
  const ids = [];
  for (const row of memberships) if (row.company_id === companyId && row.user_id && await liveMembership(db, row)) ids.push(row.user_id);
  const users = ids.length ? await db.User.filter({ id: { $in: [...new Set(ids)] } }, '-updated_date', 5000) : [];
  const out = [];
  const emails = new Set();
  for (const u of users) {
    if (u.pickup_route_id !== route.id || !finite(u.pickup_lat, u.pickup_lng)) continue;
    if (u.email) emails.add(norm(u.email));
    out.push({ id: 'user:' + u.id, name: u.display_name || u.full_name || '', pickup_name: u.pickup_name || '', lat: Number(u.pickup_lat), lng: Number(u.pickup_lng) });
  }
  const buses = new Set((await db.Vehicle.filter({ company_id: companyId }, 'name', 500))
    .filter((v) => v.company_id === companyId && v.route_id === route.id).map((v) => v.id));
  if (buses.size) {
    const contacts = await db.Contact.filter({ company_id: companyId }, '-updated_date', 2000);
    for (const c of contacts) {
      if (c.company_id !== companyId || !buses.has(c.vehicle_id) || !finite(c.pickup_lat, c.pickup_lng)) continue;
      if (c.email && emails.has(norm(c.email))) continue; // the same person's app pickup wins
      out.push({ id: 'contact:' + c.id, name: c.name || '', pickup_name: c.pickup_name || '', lat: Number(c.pickup_lat), lng: Number(c.pickup_lng) });
    }
  }
  return out;
}

async function stopsFor(db, route) {
  const road = roadPointsToLine(route.path);
  if (road.length < 2) return { has_road: false, merge_m: mergeDistance(route), stops: [], off_road: [], riders: [] };
  const people = await riders(db, route);
  const { stops, offRoad } = pickupStops({ road, fixed: route.stops || [], pickups: people, mergeM: mergeDistance(route) });
  return { has_road: true, merge_m: mergeDistance(route), stops, off_road: offRoad, riders: people };
}

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const session = await base44.auth.me().catch((e) => { const s = e?.status ?? e?.response?.status; if (s === 401 || s === 403) return null; throw e; });
    if (!session) return Response.json({ error: 'Sign in required' }, { status: 401 });
    const db = base44.asServiceRole.entities;
    const user = await db.User.get(session.id).catch(() => null);
    if (!user || user.id !== session.id) return Response.json({ error: 'Sign in required' }, { status: 401 });
    const body = await req.json().catch(() => ({}));

    if (body.action === 'route') {
      if (user.role !== 'admin') fail(403, 'Administrators only');
      if (typeof body.route_id !== 'string' || !body.route_id) fail(400, 'Route required');
      const route = await db.Route.get(body.route_id).catch(() => null);
      if (!route) fail(404, 'Route not found');
      const result = await stopsFor(db, route);
      const names = new Map(result.riders.map((r) => [r.id, r.name]));
      return Response.json({
        has_road: result.has_road, merge_m: result.merge_m,
        stops: result.stops.map((s) => ({ ...s, riders: s.riders.map((r) => ({ id: r.id, name: r.name || 'Passenger', moved_m: r.moved_m })) })),
        off_road: result.off_road.map((id) => ({ id, name: names.get(id) || 'Passenger' })),
      });
    }

    if (body.action === 'mine') {
      if (!['staff', 'passenger'].includes(user.role)) fail(403, 'For passengers only');
      if (!user.pickup_route_id || !finite(user.pickup_lat, user.pickup_lng)) return Response.json({ stop: null });
      const route = await db.Route.get(user.pickup_route_id).catch(() => null);
      if (!route) return Response.json({ stop: null });
      const rows = await db.CompanyMembership.filter({ user_id: user.id, company_id: route.company_id, scope: 'passenger', active: true }, '-updated_date', 20);
      let member = false;
      for (const row of rows) if (row.company_id === route.company_id && await liveMembership(db, row)) member = true;
      if (!member) return Response.json({ stop: null });
      const result = await stopsFor(db, route);
      const me = 'user:' + user.id;
      const stop = result.stops.find((s) => s.riders.some((r) => r.id === me));
      if (!stop) return Response.json({ stop: null, off_road: result.off_road.includes(me) });
      const mine = stop.riders.find((r) => r.id === me);
      return Response.json({
        route_id: route.id,
        stop: { name: stop.name, lat: stop.lat, lng: stop.lng, fixed: stop.fixed, shared_with: stop.riders.length - 1, moved_m: mine.moved_m, order: result.stops.indexOf(stop) },
      });
    }

    fail(400, 'Unknown action');
  } catch (error) {
    return Response.json({ error: error.status ? error.message : 'Could not load the stops' }, { status: error.status || 500 });
  }
}
