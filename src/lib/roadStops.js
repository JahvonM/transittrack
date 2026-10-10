import { placeOnRoad } from "../../base44/shared/pickupStops.ts";
import { drawnRoad } from "@/lib/routeRoad";

// Driver stops on a route with a drawn road (Route Planner): the stops in the
// order the bus reaches them along the road, where the bus is on it, and the
// points directions should pass through so they follow it.

// Metres between two [lng, lat] points (the same sum placeOnRoad uses).
function metresBetween(a, b) {
  const rad = Math.PI / 180;
  const x = (b[0] - a[0]) * rad * Math.cos(((a[1] + b[1]) / 2) * rad);
  return Math.hypot(x, (b[1] - a[1]) * rad) * 6371000;
}

// Stop edits only on the road: the same distance the server checks.
export const ROAD_EDIT_M = 50;
// The bus counts as on the road this close to it (else stop order falls back
// to the nearest stop, as on routes without a drawn road).
const ON_ROAD_M = 200;
// A stop this far behind the bus along the road has been passed.
const PASSED_M = 30;

// The drawn road's stops from the tablet session (sent once unlocked), else null.
export function roadStopsOf(session) {
  const stops = session?.road_stops?.stops;
  return Array.isArray(stops) && stops.length && drawnRoad(session?.route) ? stops : null;
}

// Where the bus is on the drawn road: { along, off, lat, lng } in metres, or null.
export function busOnRoad(route, lat, lng) {
  const road = drawnRoad(route);
  if (!road || lat == null || lng == null) return null;
  return placeOnRoad(road, Number(lat), Number(lng));
}

// Index of the next stop along the road (stops.length once all are passed),
// or null when the bus isn't on the road.
export function nextRoadStopIndex(stops, at) {
  if (!at || at.off > ON_ROAD_M || !stops?.length) return null;
  const i = stops.findIndex((s) => Number(s.along) > at.along - PASSED_M);
  return i === -1 ? stops.length : i;
}

// Points on the drawn road between `fromAlong` and `toAlong` (metres), for
// directions to pass through so they follow the road the admin drew. The
// points the road was drawn through first; else points sampled along it.
export function roadVia(route, fromAlong, toAlong, max = 20) {
  const road = drawnRoad(route);
  if (!road || !(toAlong - fromAlong > 300)) return [];
  const lo = fromAlong + 150, hi = toAlong - 150;
  const tapped = (route?.path_via || [])
    .map((p) => ({ lat: Number(p.lat), lng: Number(p.lng) }))
    .filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng))
    .map((p) => ({ ...p, along: placeOnRoad(road, p.lat, p.lng)?.along ?? -1 }))
    .filter((p) => p.along > lo && p.along < hi);
  let points = tapped;
  if (!points.length) {
    let along = 0;
    points = road.map(([lng, lat], i) => {
      if (i) along += metresBetween(road[i - 1], road[i]);
      return { lat, lng, along };
    }).filter((p) => p.along > lo && p.along < hi);
  }
  if (points.length > max) {
    const step = points.length / max;
    points = Array.from({ length: max }, (_, i) => points[Math.floor(i * step)]);
  }
  return points.sort((a, b) => a.along - b.along).map(({ lat, lng }) => ({ lat, lng }));
}
