import { MAPBOX_TOKEN } from "@/lib/mapbox";

export function haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function etaMinutes(distanceKm, speedKmh = 25) {
  if (!distanceKm && distanceKm !== 0) return null;
  return (distanceKm / speedKmh) * 60;
}

export function formatEta(mins) {
  if (mins == null) return "—";
  if (mins < 1) return "Arriving";
  if (mins < 60) return `${Math.round(mins)} min`;
  const h = Math.floor(mins / 60);
  const m = Math.round(mins % 60);
  return `${h}h ${m}m`;
}

// In-memory cache so we don't re-request the same route on every render/GPS tick.
const routeCache = new Map();
const MAX_DIRECTIONS_WAYPOINTS = 25; // Mapbox Directions API limit

// Round to ~11m precision — enough for routing purposes, and lets nearby GPS
// jitter reuse the same cached route instead of re-fetching constantly.
const roundCoord = (n) => Math.round(n * 10000) / 10000;

/**
 * Fetches an actual driving route (following real roads) through 2+ waypoints,
 * using the Mapbox Directions API. Returns null (rather than throwing) on any
 * failure — callers should fall back to haversineKm/etaMinutes in that case.
 *
 * @param {Array<{lat:number,lng:number}>} points - waypoints in visiting order
 * @returns {Promise<{distanceKm:number, durationMin:number, geometry:number[][]} | null>}
 */
export async function fetchDrivingRoute(points) {
  const valid = (points || []).filter((p) => p && p.lat != null && p.lng != null);
  if (valid.length < 2 || valid.length > MAX_DIRECTIONS_WAYPOINTS || !MAPBOX_TOKEN) return null;

  const key = valid.map((p) => `${roundCoord(p.lat)},${roundCoord(p.lng)}`).join(";");
  if (routeCache.has(key)) return routeCache.get(key);

  const coordsParam = valid.map((p) => `${roundCoord(p.lng)},${roundCoord(p.lat)}`).join(";");
  const url = `https://api.mapbox.com/directions/v5/mapbox/driving/${coordsParam}?geometries=geojson&overview=full&access_token=${MAPBOX_TOKEN}`;

  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    const route = data.routes && data.routes[0];
    if (!route) return null;
    const result = {
      distanceKm: route.distance / 1000,
      durationMin: route.duration / 60,
      geometry: route.geometry?.coordinates || [],
    };
    routeCache.set(key, result);
    return result;
  } catch {
    return null;
  }
}
