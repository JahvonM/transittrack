// Pickups become stops along a route's drawn road (Route Planner).
//
// Every passenger's pickup is placed on the road at the point nearest to it,
// in the order the bus reaches them. Pickups within `mergeM` metres of each
// other along the road share one stop, so the bus doesn't stop twice for
// neighbours. A fixed stop on the route (e.g. "Grand Anse junction") takes in
// the pickups near it. Pickups too far from the road are left out (no route
// reaches them).
//
// Pure functions with no imports: used by the server functions and the app.

export const DEFAULT_MERGE_M = 150;
export const MAX_MERGE_M = 500;
export const MAX_OFF_ROAD_M = 200;

// Metres between two [lng, lat] points (equirectangular; fine at road scale).
function metres(a, b) {
  const rad = Math.PI / 180;
  const x = (b[0] - a[0]) * rad * Math.cos(((a[1] + b[1]) / 2) * rad);
  const y = (b[1] - a[1]) * rad;
  return Math.hypot(x, y) * 6371000;
}

// Where a point meets the road: { along (m from the start), off (m from the
// road), lat, lng } or null. `road` is [lng, lat] pairs.
export function placeOnRoad(road, lat, lng) {
  if (!Array.isArray(road) || road.length < 2 || !Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  const p = [lng, lat];
  let best = null, start = 0;
  for (let i = 0; i < road.length - 1; i++) {
    const a = road[i], b = road[i + 1];
    const len = metres(a, b);
    const kx = Math.cos(((a[1] + b[1]) / 2) * Math.PI / 180);
    const dx = (b[0] - a[0]) * kx, dy = b[1] - a[1];
    const denom = dx * dx + dy * dy;
    const t = denom > 0 ? Math.max(0, Math.min(1, (((p[0] - a[0]) * kx) * dx + (p[1] - a[1]) * dy) / denom)) : 0;
    const q = [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])];
    const off = metres(p, q);
    if (!best || off < best.off) best = { along: start + t * len, off, lat: q[1], lng: q[0] };
    start += len;
  }
  return best;
}

export function roadPointsToLine(path) {
  return (Array.isArray(path) ? path : [])
    .map((p) => [Number(p?.lng), Number(p?.lat)])
    .filter(([x, y]) => Number.isFinite(x) && Number.isFinite(y));
}

export function mergeDistance(route) {
  const m = Number(route?.pickup_merge_m);
  return Number.isFinite(m) && m >= 0 ? Math.min(MAX_MERGE_M, m) : DEFAULT_MERGE_M;
}

const genericName = (name) => !name || /^Roadside pickup/i.test(name) || /^My pickup spot$/i.test(name);

/**
 * The stops a bus makes along its drawn road.
 *   road     [lng, lat] pairs (the drawn road)
 *   fixed    the route's own stops [{ name, lat, lng }]
 *   pickups  [{ id, name, lat, lng, pickup_name }] — one per passenger
 * -> { stops: [{ key, name, lat, lng, along, fixed, riders: [{ id, name, lat, lng, moved_m }] }],
 *      offRoad: [pickup ids too far from the road] }
 */
export function pickupStops({ road, fixed = [], pickups = [], mergeM = DEFAULT_MERGE_M, maxOffRoadM = MAX_OFF_ROAD_M }) {
  const items = [];
  const offRoad = [];
  for (const s of fixed || []) {
    const lat = Number(s?.lat), lng = Number(s?.lng);
    const at = placeOnRoad(road, lat, lng);
    if (at) items.push({ kind: 'fixed', name: s.name || 'Stop', lat, lng, along: at.along });
  }
  for (const p of pickups || []) {
    const lat = Number(p?.lat), lng = Number(p?.lng);
    const at = placeOnRoad(road, lat, lng);
    if (!at || at.off > maxOffRoadM) { if (p?.id) offRoad.push(p.id); continue; }
    items.push({ kind: 'pickup', id: p.id, name: p.name || '', pickup_name: p.pickup_name || '', lat: at.lat, lng: at.lng, along: at.along });
  }
  items.sort((a, b) => a.along - b.along || (a.kind === 'fixed' ? -1 : 1));

  // Fixed stops first take in every pickup within reach; the rest group from
  // the first pickup of each run (anchored, so groups don't chain on forever).
  const fixedItems = items.filter((x) => x.kind === 'fixed');
  const groups = fixedItems.map((f) => ({ anchor: f, members: [] }));
  const loose = [];
  for (const x of items) {
    if (x.kind !== 'pickup') continue;
    let near = null;
    for (const g of groups) {
      const d = Math.abs(g.anchor.along - x.along);
      if (d <= mergeM && (!near || d < near.d)) near = { g, d };
    }
    if (near) near.g.members.push(x); else loose.push(x);
  }
  for (const x of loose) {
    const last = groups.length ? groups[groups.length - 1] : null;
    if (last && last.anchor.kind === 'pickup' && x.along - last.anchor.along <= mergeM) last.members.push(x);
    else groups.push({ anchor: x, members: [x] });
  }

  const stops = groups
    .filter((g) => g.anchor.kind === 'fixed' || g.members.length)
    .map((g) => {
      let at = g.anchor;
      if (g.anchor.kind === 'pickup') {
        // Meet at the pickup in the middle of the group, so nobody walks far.
        const sorted = [...g.members].sort((a, b) => a.along - b.along);
        at = sorted[Math.floor((sorted.length - 1) / 2)];
      }
      const named = g.anchor.kind === 'fixed' ? g.anchor.name : (g.members.find((m) => !genericName(m.pickup_name))?.pickup_name || '');
      return {
        key: g.anchor.kind === 'fixed' ? 'fixed:' + g.anchor.name : 'pickup:' + at.id,
        name: named,
        lat: at.lat, lng: at.lng, along: Math.round(at.along), fixed: g.anchor.kind === 'fixed',
        riders: g.members.map((m) => ({ id: m.id, name: m.name, lat: m.lat, lng: m.lng, moved_m: Math.round(metres([m.lng, m.lat], [at.lng, at.lat])) })),
      };
    })
    .sort((a, b) => a.along - b.along);
  let n = 0;
  for (const s of stops) if (!s.name) s.name = `Pickup ${++n}`;
  // Names are how drivers and passengers tell stops apart: keep them unique.
  const seen = new Map();
  for (const s of stops) {
    const k = s.name.toLowerCase();
    const count = (seen.get(k) || 0) + 1;
    seen.set(k, count);
    if (count > 1) s.name = `${s.name} (${count})`;
  }
  return { stops, offRoad };
}

/**
 * Only a count, never another passenger's pickup coordinates.
 * The caller must separately verify the bus is actively tracking and that
 * the location timestamp is fresh.
 */
export function stopsUntilPickup(stops, targetIndex, road, lat, lng) {
  if (!Array.isArray(stops) || !Number.isInteger(targetIndex) || targetIndex < 0 || targetIndex >= stops.length) return null;
  const at = placeOnRoad(road, Number(lat), Number(lng));
  if (!at || at.off > 200) return null;
  const next = stops.findIndex((s) => Number(s.along) > at.along - 30);
  const nextIndex = next < 0 ? stops.length : next;
  return targetIndex >= nextIndex ? targetIndex - nextIndex : null;
}
