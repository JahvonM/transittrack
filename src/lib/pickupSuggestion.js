import { MAPBOX_TOKEN } from "@/lib/mapbox";
import { fetchDrivingRoute } from "@/lib/geo";
import { buildNav, projectOnRoute } from "@/lib/navigation";

export function nearestRoutePoint(origin, geometry) {
  if (!Number.isFinite(origin?.lat) || !Number.isFinite(origin?.lng) || !geometry?.length || geometry.length < 2) return null;
  const p = projectOnRoute(buildNav({ geometry, steps: [] }), origin);
  return p ? { lat: p.point[1], lng: p.point[0], distanceM: p.offM } : null;
}
// The point `along` metres from the start of a road line.
function pointAlong(nav, along) {
  const g = nav.geometry, cum = nav.cum;
  const d = Math.max(0, Math.min(nav.total, along));
  let i = 0;
  while (i < cum.length - 2 && cum[i + 1] < d) i++;
  const seg = cum[i + 1] - cum[i];
  const t = seg > 0 ? (d - cum[i]) / seg : 0;
  return { lng: g[i][0] + (g[i + 1][0] - g[i][0]) * t, lat: g[i][1] + (g[i + 1][1] - g[i][1]) * t };
}
const metresBetween = (a, b) => {
  const R = 6371000, rad = (x) => (x * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
};

// Spots on the bus roads you could walk to from `origin`, closest walk
// first: the nearest point on each road, plus points about 200 m and 400 m
// either side of it, so someone who doesn't like the first spot can pick
// another in the same area. Every spot has real walking directions and ends
// on the bus road; spots closer than 100 m to a better one are dropped.
const SIDE_STEPS_M = [-400, -200, 200, 400];
export async function suggestPickups(origin, routes, { max = 5 } = {}) {
  const candidates = [];
  for (const route of (routes || []).filter(r => r.active !== false).slice(0, 12)) {
    const stops = [...(route.stops || [])].sort((a,b) => (a.order ?? 0) - (b.order ?? 0));
    if (stops.length < 2) continue;
    const road = await fetchDrivingRoute(stops);
    if (!road?.geometry || road.geometry.length < 2) continue;
    const nav = buildNav({ geometry: road.geometry, steps: [] });
    const near = projectOnRoute(nav, origin);
    if (!near || near.offM > 2000) continue;
    candidates.push({ lat: near.point[1], lng: near.point[0], distanceM: near.offM, route, road });
    for (const step of SIDE_STEPS_M) {
      const p = pointAlong(nav, near.along + step);
      const d = metresBetween(origin, p);
      if (d <= 2000) candidates.push({ ...p, distanceM: d, route, road });
    }
  }
  candidates.sort((a,b) => a.distanceM - b.distanceM);
  const spread = [];
  for (const c of candidates) if (!spread.some((x) => metresBetween(x, c) < 100)) spread.push(c);
  const walks = (await Promise.all(spread.slice(0, 8).map(async (point) => {
    const coords = origin.lng + "," + origin.lat + ";" + point.lng + "," + point.lat;
    try {
      const res = await fetch("https://api.mapbox.com/directions/v5/mapbox/walking/" + coords + "?geometries=geojson&overview=full&steps=true&exclude=ferry&access_token=" + MAPBOX_TOKEN);
      if (!res.ok) return null;
      const data = await res.json();
      const walk = data.routes?.[0];
      const endpoint = data.waypoints?.[1]?.location;
      if (!walk?.geometry?.coordinates?.length || !endpoint || !Number.isFinite(walk.distance) || walk.distance > 2000) return null;
      const onBusRoad = nearestRoutePoint({ lng: endpoint[0], lat: endpoint[1] }, point.road.geometry);
      if (!onBusRoad || onBusRoad.distanceM > 30) return null;
      if (walk.legs?.some(l => l.steps?.some(s => ["ferry","unaccessible"].includes(s.mode)))) return null;
      return { lat: onBusRoad.lat, lng: onBusRoad.lng, route_id: point.route.id,
        name: "Roadside pickup · " + point.route.name, walkM: walk.distance, walkMin: walk.duration / 60,
        geometry: walk.geometry.coordinates, steps: (walk.legs || []).flatMap(l => (l.steps || []).map(s => s.maneuver?.instruction).filter(Boolean)) };
    } catch { return null; /* try another spot */ }
  }))).filter(Boolean).sort((a,b) => a.walkM - b.walkM);
  const out = [];
  for (const w of walks) if (!out.some((x) => metresBetween(x, w) < 100)) out.push(w);
  return out.slice(0, max);
}

export async function suggestPickup(origin, routes) {
  return (await suggestPickups(origin, routes, { max: 1 }))[0] || null;
}

// The closest bus road to a spot the passenger picked themselves, so the
// driver's route can include it. null when no road is within 2 km.
export async function nearestBusRoad(spot, routes) {
  let best = null;
  for (const route of (routes || []).filter(r => r.active !== false).slice(0, 12)) {
    const stops = [...(route.stops || [])].sort((a,b) => (a.order ?? 0) - (b.order ?? 0));
    if (stops.length < 2) continue;
    const road = await fetchDrivingRoute(stops);
    const p = nearestRoutePoint(spot, road?.geometry);
    if (p && p.distanceM <= 2000 && (!best || p.distanceM < best.distanceM)) best = { route_id: route.id, route_name: route.name, distanceM: p.distanceM };
  }
  return best;
}
