// Who gets on along a route, and the stops each of its buses makes on the
// drawn road. One place for this so the driver's stop list (tablet and
// phone), the passenger's "Meet at …" and Admin → Route Planner always work
// the meeting points out from the same people, and so always agree.

import { pickupStops, mergeDistance, roadPointsToLine } from './pickupStops.ts';

const rrNorm = (value) => String(value || '').trim().toLowerCase();
const rrFinite = (lat, lng) => lat !== null && lng !== null && lat !== undefined && lng !== undefined && Number.isFinite(Number(lat)) && Number.isFinite(Number(lng));

async function rrDigest(value) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(bytes), (b) => b.toString(16).padStart(2, '0')).join('');
}

// A passenger membership still counts: admin-approved, or made with the
// company's current code. `codes` caches each company's code digest.
export async function riderMembershipLive(db, row, codes = new Map()) {
  if (!row.expires_at && !row.code_hash) return true;
  if (!row.code_hash) return false;
  if (!codes.has(row.company_id)) {
    const company = await db.Company.get(row.company_id).catch(() => null);
    codes.set(row.company_id, company ? await rrDigest(company.access_code || '') : null);
  }
  const code = codes.get(row.company_id);
  return !!code && row.code_hash === code;
}

/**
 * Everyone who gets on along this route, with a pickup point:
 *   - app accounts whose pickup is on this route, or who ride one of its buses
 *   - directory passengers riding one of its buses (an app pickup wins over
 *     the same person's directory card)
 * -> [{ id: 'user:<id>'|'contact:<id>', name, pickup_name, lat, lng,
 *       email, user_id, contact_id, bus_id }]
 * The ids and emails are for the server only; never send them as they are.
 */
export async function routeRiders(db, route) {
  const companyId = route.company_id;
  const [memberships, vehicles, contacts] = await Promise.all([
    db.CompanyMembership.filter({ company_id: companyId, scope: 'passenger', active: true }, '-updated_date', 5000),
    db.Vehicle.filter({ company_id: companyId }, 'name', 500),
    db.Contact.filter({ company_id: companyId }, '-updated_date', 2000),
  ]);
  const buses = new Set(vehicles.filter((v) => v.company_id === companyId && v.route_id === route.id).map((v) => v.id));
  const busOfUser = new Map();
  const codes = new Map();
  for (const row of memberships) {
    if (row.company_id !== companyId || !row.user_id || !(await riderMembershipLive(db, row, codes))) continue;
    busOfUser.set(row.user_id, busOfUser.get(row.user_id) || row.vehicle_id || '');
  }
  const users = busOfUser.size ? await db.User.filter({ id: { $in: [...busOfUser.keys()] } }, '-updated_date', 5000) : [];
  const cards = contacts.filter((c) => c.company_id === companyId && (!c.type || ['staff', 'passenger'].includes(c.type)));
  const cardByEmail = new Map(cards.filter((c) => c.email).map((c) => [rrNorm(c.email), c]));
  const out = [];
  const emails = new Set();
  for (const u of users) {
    if (!busOfUser.has(u.id) || !rrFinite(u.pickup_lat, u.pickup_lng)) continue;
    const card = u.email ? cardByEmail.get(rrNorm(u.email)) : null;
    const bus = card?.vehicle_id || busOfUser.get(u.id) || '';
    if (u.pickup_route_id !== route.id && !buses.has(bus)) continue;
    if (u.email) emails.add(rrNorm(u.email));
    out.push({
      id: 'user:' + u.id, name: u.display_name || u.full_name || card?.name || '', pickup_name: u.pickup_name || '',
      lat: Number(u.pickup_lat), lng: Number(u.pickup_lng), email: rrNorm(u.email), user_id: u.id, contact_id: card?.id || '', bus_id: bus,
    });
  }
  for (const c of cards) {
    if (!buses.has(c.vehicle_id) || !rrFinite(c.pickup_lat, c.pickup_lng)) continue;
    if (c.email && emails.has(rrNorm(c.email))) continue;
    out.push({
      id: 'contact:' + c.id, name: c.name || '', pickup_name: c.pickup_name || '',
      lat: Number(c.pickup_lat), lng: Number(c.pickup_lng), email: rrNorm(c.email), user_id: '', contact_id: c.id, bus_id: c.vehicle_id,
    });
  }
  return out;
}

// Every stop along the route's drawn road, for everyone who rides it.
export async function routeStopPlan(db, route) {
  const road = roadPointsToLine(route?.path);
  const merge_m = mergeDistance(route);
  if (road.length < 2) return { has_road: false, merge_m, road, stops: [], off_road: [], riders: [] };
  const riders = await routeRiders(db, route);
  const { stops, offRoad } = pickupStops({ road, fixed: route.stops || [], pickups: riders, mergeM: merge_m });
  return { has_road: true, merge_m, road, stops, off_road: offRoad, riders };
}

/**
 * The stops one bus makes, in the order it reaches them along the drawn
 * road: the route's own stops, and the pickups of the passengers who ride
 * this bus (assigned to it, or to no bus yet). null without a drawn road.
 * -> { road, merge_m, stops: [{ key, name, lat, lng, along, fixed, riders }], off_road: [riders] }
 */
export async function busRoadStops(db, route, busId) {
  const plan = await routeStopPlan(db, route);
  if (!plan.has_road) return null;
  const byId = new Map(plan.riders.map((r) => [r.id, r]));
  const ridesHere = (r) => !!r && (!r.bus_id || r.bus_id === busId);
  const stops = plan.stops
    .map((s) => ({ ...s, riders: s.riders.filter((x) => ridesHere(byId.get(x.id))).map((x) => ({ ...byId.get(x.id), moved_m: x.moved_m })) }))
    .filter((s) => s.fixed || s.riders.length);
  return { road: plan.road, merge_m: plan.merge_m, stops, off_road: plan.off_road.map((id) => byId.get(id)).filter(ridesHere) };
}
