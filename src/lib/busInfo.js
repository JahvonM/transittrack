import { haversineKm, etaMinutes } from "@/lib/geo";
import { serverNow } from "@/lib/serverClock";

// What the in-bus information screen can honestly say about where the bus
// is. "Nearest stop" is the closest stop on the route in a straight line:
// the app doesn't track which stop comes next, so it never says "next stop"
// or "on time".
export const LIVE_POSITION_MS = 2 * 60_000;

export function positionState(vehicle, now = Date.now()) {
  if (vehicle?.current_lat == null || vehicle?.current_lng == null) return "none";
  const at = Date.parse(vehicle.last_location_update || "");
  if (!Number.isFinite(at)) return "none";
  return serverNow(now) - at <= LIVE_POSITION_MS ? "live" : "last_known";
}

export function nearestStopOf(vehicle, route) {
  if (vehicle?.current_lat == null || vehicle?.current_lng == null || !route?.stops?.length) return null;
  let best = null;
  for (const [index, s] of route.stops.entries()) {
    if (s.lat == null || s.lng == null) continue;
    const km = haversineKm(vehicle.current_lat, vehicle.current_lng, s.lat, s.lng);
    if (!best || km < best.km) best = { name: s.name, index, km };
  }
  return best ? { ...best, mins: etaMinutes(best.km) } : null;
}

// The route's stops in order, for the list on screen.
export const orderedStops = (route) => [...(route?.stops || [])]
  .map((s, i) => ({ ...s, order: Number.isFinite(Number(s.order)) ? Number(s.order) : i }))
  .sort((a, b) => a.order - b.order);
