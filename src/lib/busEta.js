import { locateOnRoute, stopKey } from "@/lib/travelTimes";

export function locationIsStale(vehicle, now = Date.now()) {
  const t = Date.parse(vehicle?.last_location_update);
  return !Number.isFinite(t) || now - t > 120000 || t > now + 30000;
}

// Stops are ordered by the company's route, not by the shortest road to pickup.
export function remainingBusPoints(route, vehicle, stop) {
  if (!route?.stops?.length || !stop || vehicle?.current_lat == null || vehicle?.current_lng == null) return null;
  const stops = [...route.stops].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  if (stops.some((s) => !Number.isFinite(s.lat) || !Number.isFinite(s.lng))) return null;
  const target = stops.findIndex((s) => stopKey(s) === stopKey(stop) || (stop.name && s.name === stop.name));
  const origin = { lat: vehicle.current_lat, lng: vehicle.current_lng };
  const where = locateOnRoute(stops, origin);
  if (target < 0 || !where || target <= where.leg) return null;
  return [origin, ...stops.slice(where.leg + 1, target + 1)];
}
