import { drawnRoad } from "@/lib/routeRoad";
import { nearestRoutePoint } from "@/lib/pickupSuggestion";

// How far a pickup may be from a drawn road and still be on it. The same
// distance the server uses (MAX_OFF_ROAD_M in base44/shared/pickupStops.ts).
export const ON_ROAD_M = 200;

// True when the passenger's saved pickup is somewhere their assigned bus
// doesn't drive: saved on another route, and not beside this bus's drawn
// road either. Admin → Plan pickups calls the same case "wrong bus" (or
// "route has no bus yet"); the passenger is asked to pick again on the
// bus's road.
export function pickupMissesBus(user, busRoute) {
  if (!busRoute?.id || user?.pickup_lat == null || user?.pickup_lng == null || !user?.pickup_route_id) return false;
  if (user.pickup_route_id === busRoute.id) return false;
  const near = nearestRoutePoint({ lat: Number(user.pickup_lat), lng: Number(user.pickup_lng) }, drawnRoad(busRoute));
  return !(near && near.distanceM <= ON_ROAD_M);
}


/** Recover a passenger's previously saved roadside pickup without trusting a
 * missing/stale route ID. Only locations actually within the bus road qualify.
 * Never use this helper to auto-assign a different bus or route. */
export function pickupOnAssignedRoad(user, route) {
  if (!route?.id || user?.pickup_lat == null || user?.pickup_lng == null) return false;
  const lat = Number(user.pickup_lat), lng = Number(user.pickup_lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
  const near = nearestRoutePoint({ lat, lng }, drawnRoad(route));
  return !!near && near.distanceM <= ON_ROAD_M;
}

// "Your driver moved your pickup": shown while the pickup is still where the
// driver put it, for two weeks.
export function pickupMovedNote(user, now = Date.now()) {
  const moved = user?.pickup_moved;
  if (!moved?.at || !(now - Date.parse(moved.at) < 14 * 86400_000)) return null;
  const same = (a, b) => Math.abs(Number(a) - Number(b)) < 1e-6;
  if (!same(moved.lat, user.pickup_lat) || !same(moved.lng, user.pickup_lng)) return null;
  const day = new Date(moved.at).toLocaleDateString(undefined, { day: "numeric", month: "short" });
  return `${moved.by || "Your driver"} moved your pickup ${Math.round(moved.m || 0)} m along the road on ${day}, to where the bus can stop.`;
}
