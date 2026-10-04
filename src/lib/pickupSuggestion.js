import { MAPBOX_TOKEN } from "@/lib/mapbox";
import { fetchDrivingRoute } from "@/lib/geo";
import { buildNav, projectOnRoute } from "@/lib/navigation";

export function nearestRoutePoint(origin, geometry) {
  if (!Number.isFinite(origin?.lat) || !Number.isFinite(origin?.lng) || !geometry?.length || geometry.length < 2) return null;
  const p = projectOnRoute(buildNav({ geometry, steps: [] }), origin);
  return p ? { lat: p.point[1], lng: p.point[0], distanceM: p.offM } : null;
}
export async function suggestPickup(origin, routes) {
  const candidates = [];
  for (const route of (routes || []).filter(r => r.active !== false).slice(0, 12)) {
    const stops = [...(route.stops || [])].sort((a,b) => (a.order ?? 0) - (b.order ?? 0));
    if (stops.length < 2) continue;
    const road = await fetchDrivingRoute(stops);
    const point = nearestRoutePoint(origin, road?.geometry);
    if (point && point.distanceM <= 2000) candidates.push({ ...point, route, road });
  }
  candidates.sort((a,b) => a.distanceM - b.distanceM);
  const walks = [];
  for (const point of candidates.slice(0, 3)) {
    const coords = origin.lng + "," + origin.lat + ";" + point.lng + "," + point.lat;
    try {
      const res = await fetch("https://api.mapbox.com/directions/v5/mapbox/walking/" + coords + "?geometries=geojson&overview=full&steps=true&exclude=ferry&access_token=" + MAPBOX_TOKEN);
      if (!res.ok) continue;
      const data = await res.json();
      const walk = data.routes?.[0];
      const endpoint = data.waypoints?.[1]?.location;
      if (!walk?.geometry?.coordinates?.length || !endpoint || !Number.isFinite(walk.distance) || walk.distance > 2000) continue;
      const onBusRoad = nearestRoutePoint({ lng: endpoint[0], lat: endpoint[1] }, point.road.geometry);
      if (!onBusRoad || onBusRoad.distanceM > 30) continue;
      if (walk.legs?.some(l => l.steps?.some(s => ["ferry","unaccessible"].includes(s.mode)))) continue;
      walks.push({ lat: onBusRoad.lat, lng: onBusRoad.lng, route_id: point.route.id,
        name: "Roadside pickup · " + point.route.name, walkM: walk.distance, walkMin: walk.duration / 60,
        geometry: walk.geometry.coordinates, steps: (walk.legs || []).flatMap(l => (l.steps || []).map(s => s.maneuver?.instruction).filter(Boolean)) });
    } catch { /* try another bus road */ }
  }
  return walks.sort((a,b) => a.walkM - b.walkM)[0] || null;
}
