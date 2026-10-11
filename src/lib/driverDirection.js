import { drawnRoad } from "@/lib/routeRoad";
import { placeOnRoad } from "../../base44/shared/pickupStops.ts";

export const tripDirection = (bus) => bus?.trip_direction === "to_home" ? "to_home" : "to_work";

// Build a driver-only view. The stored route and home locations stay intact.
export function directionView(data, bus = data?.vehicle || data?.bus) {
  if (!data) return data;
  const home = tripDirection(bus) === "to_home";
  const source = data.route;
  const route = source ? { ...source,
    stops: [...(source.stops || [])].sort((a,b)=>(a.order ?? 0)-(b.order ?? 0)),
    path: [...(source.path || [])], path_via: [...(source.path_via || [])],
  } : null;
  if (home && route) {
    route.stops.reverse(); route.path.reverse(); route.path_via.reverse();
  }
  if (route) route.stops = route.stops.map((s,i)=>({...s,order:i}));
  const road = drawnRoad(route);
  const roadStops = data.road_stops ? { ...data.road_stops, stops: [...(data.road_stops.stops || [])] } : null;
  if (roadStops && home) {
    roadStops.stops = roadStops.stops.slice().reverse().map(s=>({
      ...s, along: road ? placeOnRoad(road, Number(s.lat), Number(s.lng))?.along ?? 0 : 0
    }));
  }
  return { ...data, route, road_stops: roadStops, trip_direction: home ? "to_home" : "to_work",
    staff: data.staff?.map(s=>({...s,trip_direction:home ? "to_home" : "to_work",
      dropoff_name:home ? s.pickup_name || "Home pickup spot" : data.workplace?.name || "",
      dropoff_lat:home ? s.home_lat : data.workplace?.lat ?? null,
      dropoff_lng:home ? s.home_lng : data.workplace?.lng ?? null,
    })),
  };
}
