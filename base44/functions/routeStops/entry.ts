import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';
import { roadPointsToLine, placeOnRoad, MAX_OFF_ROAD_M } from '../../shared/pickupStops.ts';
import { riderMembershipLive, routeStopPlan } from '../../shared/routeRiders.ts';

// The stops a route's bus makes along its drawn road: every passenger's
// pickup on that road, with neighbours' pickups merged into one stop (see
// shared/pickupStops.ts).
//
//  action 'route' (admin): a route's full stop list with who gets on where,
//    and the pickups too far from the road.
//  action 'mine' (passenger): only the caller's own stop: where to meet, how
//    far it is from the spot they picked, and how many others share it. Never
//    anyone else's name or pickup.
//  action 'plan' (admin): every passenger, sorted for Admin → Plan pickups:
//    on the right bus, needs a bus, on the wrong bus, their route has no bus
//    yet, no route reaches them, or no pickup yet, with a suggested bus and
//    each bus's seats. Assigning uses nfcCards set_bus with each `key`.

function fail(status, message) { throw Object.assign(new Error(message), { status }); }
const norm = (value) => String(value || '').trim().toLowerCase();
const finite = (lat, lng) => Number.isFinite(Number(lat)) && Number.isFinite(Number(lng)) && lat !== null && lng !== null;

// Within this distance of another bus's drawn road counts as "nearby".
const NEARBY_M = 1500;

async function plan(db) {
  const [companies, routes, vehicles, memberships, contacts, cards] = await Promise.all([
    db.Company.list('-updated_date', 1000),
    db.Route.list('-created_date', 500),
    db.Vehicle.list('-updated_date', 1000),
    db.CompanyMembership.filter({ scope: 'passenger', active: true }, '-updated_date', 5000),
    db.Contact.list('-updated_date', 5000),
    db.NfcCard.filter({ is_active: true }, '-issue_date', 5000).catch(() => []),
  ]);
  const live = [];
  const codes = new Map();
  for (const row of memberships) if (row.user_id && await riderMembershipLive(db, row, codes)) live.push(row);
  const userIds = [...new Set(live.map((m) => m.user_id))];
  const users = userIds.length ? await db.User.filter({ id: { $in: userIds } }, '-updated_date', 5000) : [];
  const routeById = new Map(routes.map((r) => [r.id, r]));
  const roadOf = new Map(routes.map((r) => [r.id, roadPointsToLine(r.path)]));
  const busById = new Map(vehicles.map((v) => [v.id, v]));

  // One entry per person: an app account (with its directory card in the same
  // company, if any) or a directory card on its own.
  const people = [];
  const cardsByCompanyEmail = new Map();
  for (const c of contacts) {
    if (c.type && !['staff', 'passenger'].includes(c.type)) continue;
    const key = c.company_id + ':' + norm(c.email);
    if (c.email) cardsByCompanyEmail.set(key, c);
  }
  const usedContacts = new Set();
  for (const u of users) {
    if (!['staff', 'passenger'].includes(u.role)) continue;
    const membership = live.find((m) => m.user_id === u.id);
    if (!membership) continue;
    const contact = u.email ? cardsByCompanyEmail.get(membership.company_id + ':' + norm(u.email)) : null;
    if (contact) usedContacts.add(contact.id);
    // Same rule as Admin → Passengers (nfcCards): the directory card is the
    // person, unless their card is issued to the app account.
    const accountCard = cards.some((k) => k.holder_source === 'user' && k.holder_id === u.id && k.company_id === membership.company_id && k.is_active);
    const contactCard = contact && cards.some((k) => k.holder_source === 'contact' && k.holder_id === contact.id && k.is_active);
    const key = contact && !(accountCard && !contactCard) ? 'contact:' + contact.id : 'user:' + u.id;
    const hasPickup = finite(u.pickup_lat, u.pickup_lng);
    people.push({
      key, company_id: membership.company_id, name: u.display_name || contact?.name || u.full_name || u.email || 'Passenger',
      pickup: hasPickup ? { lat: Number(u.pickup_lat), lng: Number(u.pickup_lng), name: u.pickup_name || '' }
        : contact && finite(contact.pickup_lat, contact.pickup_lng) ? { lat: Number(contact.pickup_lat), lng: Number(contact.pickup_lng), name: contact.pickup_name || '' } : null,
      route_id: hasPickup ? u.pickup_route_id || '' : '',
      bus_id: contact ? contact.vehicle_id || '' : membership.vehicle_id || '',
    });
  }
  for (const c of contacts) {
    if (usedContacts.has(c.id) || (c.type && !['staff', 'passenger'].includes(c.type)) || !c.company_id) continue;
    people.push({
      key: 'contact:' + c.id, company_id: c.company_id, name: c.name || 'Passenger',
      pickup: finite(c.pickup_lat, c.pickup_lng) ? { lat: Number(c.pickup_lat), lng: Number(c.pickup_lng), name: c.pickup_name || '' } : null,
      route_id: '', bus_id: c.vehicle_id || '',
    });
  }

  const busesOn = (routeId, companyId) => vehicles.filter((v) => v.route_id === routeId && v.company_id === companyId);
  const riders = new Map();
  for (const p of people) if (p.bus_id) riders.set(p.bus_id, (riders.get(p.bus_id) || 0) + 1);
  const free = (v) => (Number(v.capacity) > 0 ? Number(v.capacity) - (riders.get(v.id) || 0) : 9999);
  const pickBus = (list) => [...list].sort((a, b) => free(b) - free(a))[0] || null;
  // The closest other drawn road of this company with a bus on it.
  const nearbyBus = (p, notRoute) => {
    let best = null;
    for (const r of routes) {
      if (r.company_id !== p.company_id || r.id === notRoute) continue;
      const on = busesOn(r.id, p.company_id);
      const at = on.length ? placeOnRoad(roadOf.get(r.id), p.pickup.lat, p.pickup.lng) : null;
      if (at && at.off <= NEARBY_M && (!best || at.off < best.distance_m)) {
        const bus = pickBus(on);
        best = { bus_id: bus.id, bus_name: bus.name || 'Bus', route_id: r.id, route_name: r.name || 'Route', distance_m: Math.round(at.off) };
      }
    }
    return best;
  };

  const out = people.map((p) => {
    const bus = p.bus_id ? busById.get(p.bus_id) : null;
    const base = { key: p.key, name: p.name, company_id: p.company_id, pickup: p.pickup, bus_id: bus?.id || '', bus_name: bus?.name || '' };
    if (!p.pickup) return { ...base, status: 'no_pickup', route_id: '', route_name: '' };
    // Their bus already drives past their pickup (e.g. two routes share a
    // road, or an admin chose a bus that passes): nothing to do.
    const busRoute = bus?.route_id ? routeById.get(bus.route_id) : null;
    const onBusRoad = busRoute && busRoute.company_id === p.company_id ? placeOnRoad(roadOf.get(busRoute.id), p.pickup.lat, p.pickup.lng) : null;
    if (onBusRoad && onBusRoad.off <= MAX_OFF_ROAD_M) return { ...base, status: 'ok', route_id: busRoute.id, route_name: busRoute.name || 'Route' };
    let route = p.route_id ? routeById.get(p.route_id) : null;
    if (route && route.company_id !== p.company_id) route = null;
    if (!route) {
      // A directory pickup: the drawn road of this company it lies on, if any.
      let best = null;
      for (const r of routes) {
        if (r.company_id !== p.company_id) continue;
        const at = placeOnRoad(roadOf.get(r.id), p.pickup.lat, p.pickup.lng);
        if (at && at.off <= MAX_OFF_ROAD_M && (!best || at.off < best.off)) best = { r, off: at.off };
      }
      route = best?.r || null;
      // A directory passenger already on a bus, pickup on no drawn road yet: leave as is.
      if (!route && bus && !p.route_id) return { ...base, status: 'ok', route_id: bus.route_id || '', route_name: routeById.get(bus.route_id)?.name || '' };
    }
    if (route) {
      const road = roadOf.get(route.id);
      const at = road.length >= 2 ? placeOnRoad(road, p.pickup.lat, p.pickup.lng) : null;
      if (at && at.off > MAX_OFF_ROAD_M) route = null;
    }
    if (!route) return { ...base, status: 'no_route', route_id: '', route_name: '', nearby: nearbyBus(p, null) };
    const on = busesOn(route.id, p.company_id);
    const withRoute = { ...base, route_id: route.id, route_name: route.name || 'Route' };
    if (!on.length) return { ...withRoute, status: 'route_no_bus', nearby: nearbyBus(p, route.id) };
    if (bus && on.some((v) => v.id === bus.id)) return { ...withRoute, status: 'ok' };
    const suggested = pickBus(on);
    return { ...withRoute, status: bus ? 'wrong_bus' : 'needs_bus', suggested: { id: suggested.id, name: suggested.name || 'Bus' } };
  });

  return {
    companies: companies.map((c) => ({ id: c.id, name: c.name || 'Company' })),
    routes: routes.map((r) => ({ id: r.id, name: r.name || 'Route', company_id: r.company_id, has_road: roadOf.get(r.id).length >= 2, path: r.path || [], stops: r.stops || [] })),
    buses: vehicles.map((v) => ({ id: v.id, name: v.name || 'Bus', company_id: v.company_id, route_id: v.route_id || '', route_name: routeById.get(v.route_id)?.name || '', capacity: Number(v.capacity) || null, riders: riders.get(v.id) || 0 })),
    people: out,
  };
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
      const result = await routeStopPlan(db, route);
      const names = new Map(result.riders.map((r) => [r.id, r.name]));
      return Response.json({
        has_road: result.has_road, merge_m: result.merge_m,
        stops: result.stops.map((s) => ({ ...s, riders: s.riders.map((r) => ({ id: r.id, name: r.name || 'Passenger', moved_m: r.moved_m })) })),
        off_road: result.off_road.map((id) => ({ id, name: names.get(id) || 'Passenger' })),
      });
    }

    if (body.action === 'plan') {
      if (user.role !== 'admin') fail(403, 'Administrators only');
      return Response.json(await plan(db));
    }

    if (body.action === 'mine') {
      if (!['staff', 'passenger'].includes(user.role)) fail(403, 'For passengers only');
      if (!finite(user.pickup_lat, user.pickup_lng)) return Response.json({ stop: null });
      const lat = Number(user.pickup_lat), lng = Number(user.pickup_lng);
      // The road they're picked up on: their bus's, when it drives past their
      // pickup (as Admin → Plan pickups counts it); else the route they chose.
      const rows = await db.CompanyMembership.filter({ user_id: user.id, scope: 'passenger', active: true }, '-updated_date', 20);
      const live = [];
      for (const row of rows) if (row.user_id === user.id && await riderMembershipLive(db, row)) live.push(row);
      if (!live.length) return Response.json({ stop: null });
      let route = null;
      for (const row of live) {
        const card = user.email ? (await db.Contact.filter({ company_id: row.company_id, email: user.email }, '-updated_date', 5)).find((c) => c.company_id === row.company_id) : null;
        const busId = card?.vehicle_id || row.vehicle_id;
        const bus = busId ? await db.Vehicle.get(busId).catch(() => null) : null;
        const busRoute = bus?.company_id === row.company_id && bus.route_id ? await db.Route.get(bus.route_id).catch(() => null) : null;
        const at = busRoute?.company_id === row.company_id ? placeOnRoad(roadPointsToLine(busRoute.path), lat, lng) : null;
        if (at && at.off <= MAX_OFF_ROAD_M) { route = busRoute; break; }
      }
      if (!route && user.pickup_route_id) {
        const chosen = await db.Route.get(user.pickup_route_id).catch(() => null);
        if (chosen && live.some((row) => row.company_id === chosen.company_id)) route = chosen;
      }
      if (!route) return Response.json({ stop: null });
      const result = await routeStopPlan(db, route);
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
