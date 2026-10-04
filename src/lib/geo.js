import { MAPBOX_TOKEN } from "@/lib/mapbox";
import { parseDirections } from "@/lib/navigation";

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

/**
 * Route with everything the driver's Navigate screen needs, Google-Maps
 * style: turn-by-turn steps, banner text and lane arrows, the spoken prompts
 * ("In 800 metres, turn right"), live traffic and speed limits along the way.
 * Returns the parsed route from lib/navigation (parseDirections) or null.
 *
 * heading: the bus's direction of travel in degrees, when known — makes the
 * route start the way the bus is already facing instead of telling the
 * driver to make a U-turn.
 *
 * @param {{lat:number,lng:number}} origin
 * @param {{lat:number,lng:number}} destination
 */
export async function fetchTurnByTurnRoutes(origin, destination, { heading = null } = {}) {
  if (!origin?.lat || !destination?.lat || !MAPBOX_TOKEN) return [];
  const coordsParam = `${roundCoord(origin.lng)},${roundCoord(origin.lat)};${roundCoord(destination.lng)},${roundCoord(destination.lat)}`;
  const bearings = Number.isFinite(heading) ? `&bearings=${Math.round((heading + 360) % 360)},60;` : "";
  const common = `geometries=geojson&overview=full&steps=true&alternatives=true&banner_instructions=true&voice_instructions=true&voice_units=metric${bearings}&access_token=${MAPBOX_TOKEN}`;

  try {
    // Live traffic first (like Google Maps); plain driving where that isn't
    // available. Traffic levels only come with the traffic profile.
    let res = await fetch(`https://api.mapbox.com/directions/v5/mapbox/driving-traffic/${coordsParam}?${common}&annotations=maxspeed,congestion`);
    if (!res.ok) res = await fetch(`https://api.mapbox.com/directions/v5/mapbox/driving/${coordsParam}?${common}&annotations=maxspeed`);
    if (!res.ok) return bearings ? fetchTurnByTurnRoutes(origin, destination) : [];
    const data = await res.json();
    const options = (data.routes || []).map((r, i) => {
      const nav = parseDirections(data, i);
      return nav ? { ...nav, summary: r.legs?.map((l) => l.summary).filter(Boolean).join(" · ") || "Driving route", distanceM: r.distance } : null;
    }).filter(Boolean);
    if (!options.length) return bearings ? fetchTurnByTurnRoutes(origin, destination) : [];
    return options;
  } catch {
    return [];
  }
}

export async function fetchTurnByTurnRoute(origin, destination, options) {
  return (await fetchTurnByTurnRoutes(origin, destination, options))[0] || null;
}

const MAX_MATCH_POINTS = 100; // Mapbox Map Matching API limit per request

/**
 * Snaps one chunk (<=100 points) of a raw GPS trace onto the road network via
 * Mapbox's Map Matching API — unlike Directions (routing between waypoints
 * you choose), this is built for "here's a noisy/sparse recorded trace, tell
 * me the roads it actually followed". Returns an array of segments rather
 * than one flat line: whenever the trace has a real break (e.g. the vehicle
 * went offline for a while), Mapbox doesn't bridge it silently — it splits
 * the response into multiple separate `matchings`, one per contiguous
 * stretch it could confidently match. Keeping only matchings[0] (an earlier
 * version of this did) silently threw away every stretch after the first
 * break, which is exactly why the drawn line had chunks missing. Returns
 * null on total failure so the caller can fall back to a straight line for
 * this chunk rather than dropping it.
 *
 * @param {Array<{lat:number,lng:number}>} points - 2-100 points, in order
 * @returns {Promise<number[][][] | null>} matched segments, each a [lng,lat][] line
 */
async function fetchMapMatchedSegments(points) {
  const valid = (points || []).filter((p) => p && p.lat != null && p.lng != null);
  if (valid.length < 2 || valid.length > MAX_MATCH_POINTS || !MAPBOX_TOKEN) return null;

  const coordsParam = valid.map((p) => `${roundCoord(p.lng)},${roundCoord(p.lat)}`).join(";");
  const url = `https://api.mapbox.com/matching/v5/mapbox/driving/${coordsParam}?geometries=geojson&overview=full&access_token=${MAPBOX_TOKEN}`;

  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    if (data.code !== "Ok" || !data.matchings?.length) return null;
    const segments = data.matchings.map((m) => m.geometry?.coordinates || []).filter((c) => c.length > 0);
    return segments.length ? segments : null;
  } catch {
    return null;
  }
}

// Below this distance apart, two segment endpoints are treated as the same
// point (snapping/rounding jitter) and joined directly with no bridge call.
const BRIDGE_THRESHOLD_KM = 0.03;

/**
 * Snaps a full recorded GPS trace (any length) onto the road network.
 * Map Matching caps requests at 100 points, so this chunks the trace into
 * <=100-point windows that overlap by one point, matches each chunk in
 * parallel (falling back to that chunk's own straight-line points if
 * matching fails for it), and then stitches every resulting segment into
 * one continuous line — bridging any real break (a matching split, or a
 * chunk boundary that didn't quite line up) with an actual driving route
 * between the two points on either side, rather than leaving a gap or
 * silently dropping that stretch. Falls back to a plain straight connector
 * if even the bridge route can't be found.
 *
 * @param {Array<{lat:number,lng:number}>} points - the recorded trace, in order
 * @returns {Promise<number[][]>} a [lng,lat][] line covering the same points
 */
export async function snapTrackToRoads(points) {
  const valid = (points || []).filter((p) => p && p.lat != null && p.lng != null);
  if (valid.length < 2) return valid.map((p) => [p.lng, p.lat]);

  const chunks = [];
  for (let i = 0; i < valid.length; i += MAX_MATCH_POINTS - 1) {
    chunks.push(valid.slice(i, i + MAX_MATCH_POINTS));
    if (i + MAX_MATCH_POINTS >= valid.length) break;
  }

  const chunkResults = await Promise.all(
    chunks.map(async (chunk) => (await fetchMapMatchedSegments(chunk)) || [chunk.map((p) => [p.lng, p.lat])])
  );
  const segments = chunkResults.flat().filter((seg) => seg.length > 0);
  if (!segments.length) return [];

  const line = [...segments[0]];
  for (let i = 1; i < segments.length; i++) {
    const seg = segments[i];
    const prevEnd = line[line.length - 1];
    const nextStart = seg[0];
    const gapKm = haversineKm(prevEnd[1], prevEnd[0], nextStart[1], nextStart[0]);
    if (gapKm > BRIDGE_THRESHOLD_KM) {
      const bridge = await fetchDrivingRoute([
        { lat: prevEnd[1], lng: prevEnd[0] },
        { lat: nextStart[1], lng: nextStart[0] },
      ]);
      if (bridge?.geometry?.length) line.push(...bridge.geometry);
    }
    line.push(...seg);
  }
  return line;
}
