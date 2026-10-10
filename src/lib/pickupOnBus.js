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
