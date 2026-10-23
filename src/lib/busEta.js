import { locateOnRoute, stopKey } from "@/lib/travelTimes";
import { drawnRoad } from "@/lib/routeRoad";
import { roadVia, ON_ROAD_M, PASSED_M } from "@/lib/roadStops";
import { placeOnRoad } from "../../base44/shared/pickupStops.ts";

export function locationIsStale(vehicle, now = Date.now()) {
  const t = Date.parse(vehicle?.last_location_update);
  return !Number.isFinite(t) || now - t > 120000 || t > now + 30000;
}

// On a route with a drawn road (Route Planner), the bus follows that road to
// the stop: from where it is on it to where the stop is on it. undefined when
// the road can't place them (so the route's own stops are tried), null once
// the bus has passed the stop.
function drawnRoadPoints(route, origin, stop) {
  const road = drawnRoad(route);
  const target = { lat: Number(stop.lat), lng: Number(stop.lng) };
  if (!road || !Number.isFinite(target.lat) || !Number.isFinite(target.lng)) return undefined;
  const at = placeOnRoad(road, target.lat, target.lng);
  if (!at || at.off > ON_ROAD_M) return undefined;
  const bus = placeOnRoad(road, origin.lat, origin.lng);
  // Not on the road yet (leaving the depot, say): straight to the stop.
  if (!bus || bus.off > ON_ROAD_M) return [origin, target];
  if (at.along <= bus.along - PASSED_M) return null;
  return [origin, ...roadVia(route, bus.along, at.along), target];
}

// Stops are ordered by the company's route, not by the shortest road to pickup.
export function remainingBusPoints(route, vehicle, stop) {
  if (!stop || vehicle?.current_lat == null || vehicle?.current_lng == null) return null;
  const origin = { lat: Number(vehicle.current_lat), lng: Number(vehicle.current_lng) };
  const onRoad = drawnRoadPoints(route, origin, stop);
  if (onRoad !== undefined) return onRoad;
  if (!route?.stops?.length) return null;
  const stops = [...route.stops].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  if (stops.some((s) => !Number.isFinite(s.lat) || !Number.isFinite(s.lng))) return null;
  const target = stops.findIndex((s) => stopKey(s) === stopKey(stop) || (stop.name && s.name === stop.name));
  const where = locateOnRoute(stops, { lat: vehicle.current_lat, lng: vehicle.current_lng });
  if (target < 0 || !where || target <= where.leg) return null;
  return [{ lat: vehicle.current_lat, lng: vehicle.current_lng }, ...stops.slice(where.leg + 1, target + 1)];
}

// Metres along a list of { lat, lng } points.
export function pointsLengthM(points) {
  const rad = Math.PI / 180;
  let m = 0;
  for (let i = 1; i < (points?.length || 0); i++) {
    const a = points[i - 1], b = points[i];
    const x = (b.lng - a.lng) * rad * Math.cos(((a.lat + b.lat) / 2) * rad);
    m += Math.hypot(x, (b.lat - a.lat) * rad) * 6371000;
  }
  return m;
}

// Rough minutes when directions can't be fetched: the distance along the
// points (a little longer for bends) at a town bus's average speed.
export const FALLBACK_KMH = 30;
export function roughMinutes(points) {
  const km = (pointsLengthM(points) * 1.25) / 1000;
  return { mins: (km / FALLBACK_KMH) * 60, km };
}

// Used only when the server has a valid passenger pickup but has not yet
// supplied the bus's route geometry. This is a clearly approximate ETA, not
// a claim that the bus follows a straight road to the pickup.
export function unroutedPickupEstimate(vehicle, stop) {
  const lat = Number(vehicle?.current_lat), lng = Number(vehicle?.current_lng);
  const destLat = Number(stop?.lat), destLng = Number(stop?.lng);
  if (!vehicle || !stop || ![lat, lng, destLat, destLng].every(Number.isFinite)) return null;
  if (Math.abs(lat) > 90 || Math.abs(destLat) > 90 || Math.abs(lng) > 180 || Math.abs(destLng) > 180) return null;
  const rad = Math.PI / 180;
  const dLat = (destLat - lat) * rad, dLng = (destLng - lng) * rad;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat * rad) * Math.cos(destLat * rad) * Math.sin(dLng / 2) ** 2;
  const straightKm = 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(a)));
  // Allow for road bends; don't interpret an instantaneous GPS speed of zero
  // (traffic stop) as an infinite ETA.
  const km = straightKm * 1.25;
  return { mins: km / FALLBACK_KMH * 60, km, estimated: true, source: "unrouted" };
}
