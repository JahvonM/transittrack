import { MAPBOX_TOKEN } from "@/lib/mapbox";
import { fetchDrivingRoute } from "@/lib/geo";

// The road a route's bus drives. An admin can draw it in the Route Planner
// (Route.path, snapped to streets); otherwise it's worked out as the driving
// road between the route's stops, as before.

const finite = (p) => Number.isFinite(p?.lat) && Number.isFinite(p?.lng);

// The drawn road as [lng, lat] pairs, or null when none was drawn.
export function drawnRoad(route) {
  const points = (Array.isArray(route?.path) ? route.path : [])
    .map((p) => ({ lat: Number(p?.lat), lng: Number(p?.lng) }))
    .filter(finite);
  return points.length >= 2 ? points.map((p) => [p.lng, p.lat]) : null;
}

export const sortedRouteStops = (route) =>
  [...(route?.stops || [])].filter((s) => s && Number.isFinite(Number(s.lat)) && Number.isFinite(Number(s.lng)))
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

// [lng, lat] pairs of the route's road: the drawn one, else the driving road
// through its stops. null when neither is available.
export async function routeRoadGeometry(route) {
  const drawn = drawnRoad(route);
  if (drawn) return drawn;
  const stops = sortedRouteStops(route);
  if (stops.length < 2) return null;
  const road = await fetchDrivingRoute(stops.map((s) => ({ lat: Number(s.lat), lng: Number(s.lng) })));
  return road?.geometry?.length >= 2 ? road.geometry : null;
}

// Metres between two [lng, lat] points (equirectangular; fine at road scale).
function metres(a, b) {
  const rad = Math.PI / 180;
  const x = (b[0] - a[0]) * rad * Math.cos(((a[1] + b[1]) / 2) * rad);
  const y = (b[1] - a[1]) * rad;
  return Math.hypot(x, y) * 6371000;
}
function offsetFromSegment(p, a, b) {
  const len = metres(a, b);
  if (len === 0) return metres(p, a);
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * (b[0] - a[0]) + (p[1] - a[1]) * (b[1] - a[1])) / ((b[0] - a[0]) ** 2 + (b[1] - a[1]) ** 2)));
  return metres(p, [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])]);
}

// Fewer points, same road: drops points within `toleranceM` of the line
// (Douglas–Peucker), so a long road stays small enough to save and send.
export function simplifyRoad(coords, toleranceM = 4) {
  if (!Array.isArray(coords) || coords.length < 3) return coords || [];
  const keep = new Uint8Array(coords.length);
  keep[0] = keep[coords.length - 1] = 1;
  const stack = [[0, coords.length - 1]];
  while (stack.length) {
    const [s, e] = stack.pop();
    let worst = -1, at = -1;
    for (let i = s + 1; i < e; i++) {
      const d = offsetFromSegment(coords[i], coords[s], coords[e]);
      if (d > worst) { worst = d; at = i; }
    }
    if (worst > toleranceM) { keep[at] = 1; stack.push([s, at], [at, e]); }
  }
  return coords.filter((_, i) => keep[i]);
}

// The street road through the tapped points, in order: [lng, lat] pairs, or
// null if the map service couldn't find one. Long drawings are split into
// pieces of up to 25 points (the service's limit) that share their ends.
const CHUNK = 25;
export async function snapRoad(points, { fetcher = fetch } = {}) {
  const pts = (points || []).filter(finite);
  if (pts.length < 2 || !MAPBOX_TOKEN) return null;
  const line = [];
  for (let start = 0; start < pts.length - 1; start += CHUNK - 1) {
    const part = pts.slice(start, start + CHUNK);
    if (part.length < 2) break;
    const coords = part.map((p) => `${p.lng.toFixed(6)},${p.lat.toFixed(6)}`).join(";");
    const res = await fetcher(`https://api.mapbox.com/directions/v5/mapbox/driving/${coords}?geometries=geojson&overview=full&continue_straight=true&access_token=${MAPBOX_TOKEN}`);
    if (!res.ok) return null;
    const data = await res.json();
    const geometry = data.routes?.[0]?.geometry?.coordinates;
    if (!geometry?.length) return null;
    line.push(...(line.length ? geometry.slice(1) : geometry));
  }
  return line.length >= 2 ? simplifyRoad(line) : null;
}

// Road length in km, for the planner's summary.
export function roadLengthKm(coords) {
  let m = 0;
  for (let i = 1; i < (coords || []).length; i++) m += metres(coords[i - 1], coords[i]);
  return m / 1000;
}
