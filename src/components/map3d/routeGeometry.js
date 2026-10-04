// Pure geometry helpers for the live map. Coordinates are [lng, lat].
// Distances use a local equirectangular projection, which is accurate to well
// under a metre at city scale and cheap enough to run every animation frame.

const R = 6371000;
const rad = (d) => (d * Math.PI) / 180;

function toXY([lng, lat], lat0) {
  return [rad(lng) * R * Math.cos(rad(lat0)), rad(lat) * R];
}

export function distanceM(a, b) {
  const [ax, ay] = toXY(a, a[1]);
  const [bx, by] = toXY(b, a[1]);
  return Math.hypot(bx - ax, by - ay);
}

// Compass bearing from a to b (0 = north, clockwise), or null when the points
// are too close together to give a direction.
export function bearingDeg(a, b, minMeters = 3) {
  if (!a || !b || distanceM(a, b) < minMeters) return null;
  const [ax, ay] = toXY(a, a[1]);
  const [bx, by] = toXY(b, a[1]);
  return ((Math.atan2(bx - ax, by - ay) * 180) / Math.PI + 360) % 360;
}

// Turn from one heading to another the short way round, by fraction t.
export function lerpHeading(from, to, t) {
  let delta = (((to - from) % 360) + 540) % 360 - 180;
  return (from + delta * t + 360) % 360;
}

/**
 * Nearest point on a polyline to `p`. Returns the segment index, the snapped
 * point and how far off the line `p` is (metres).
 */
export function nearestOnLine(line, p) {
  if (!line || line.length < 2 || !p) return null;
  const lat0 = p[1];
  const [px, py] = toXY(p, lat0);
  let best = null;
  for (let i = 0; i < line.length - 1; i++) {
    const [ax, ay] = toXY(line[i], lat0);
    const [bx, by] = toXY(line[i + 1], lat0);
    const dx = bx - ax;
    const dy = by - ay;
    const len2 = dx * dx + dy * dy;
    const t = len2 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2)) : 0;
    const sx = ax + dx * t;
    const sy = ay + dy * t;
    const d = Math.hypot(px - sx, py - sy);
    if (!best || d < best.offM) {
      best = {
        index: i,
        t,
        offM: d,
        point: [line[i][0] + (line[i + 1][0] - line[i][0]) * t, line[i][1] + (line[i + 1][1] - line[i][1]) * t],
      };
    }
  }
  return best;
}

/**
 * Splits a route line where the vehicle is, into the part already driven and
 * the part still ahead. A vehicle far off the route (over `maxOffM`) does not
 * split it: the whole line counts as ahead.
 */
export function splitRoute(line, p, maxOffM = 120) {
  if (!line || line.length < 2) return { travelled: [], ahead: line || [] };
  const hit = nearestOnLine(line, p);
  if (!hit || hit.offM > maxOffM) return { travelled: [], ahead: line };
  return {
    travelled: [...line.slice(0, hit.index + 1), hit.point],
    ahead: [hit.point, ...line.slice(hit.index + 1)],
  };
}

// Bounding box [[minLng, minLat], [maxLng, maxLat]] of any number of points.
export function boundsOf(points) {
  const pts = points.filter((p) => p && Number.isFinite(p[0]) && Number.isFinite(p[1]));
  if (!pts.length) return null;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  pts.forEach(([x, y]) => { minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y); });
  return [[minX, minY], [maxX, maxY]];
}
