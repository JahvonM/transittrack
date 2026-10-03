// Trip replay maths, kept free of React/map code so it can be unit-tested.
// The bus marker is moved continuously along the road-snapped line between
// the once-a-minute location records, instead of hopping from record to
// record (which looked jumpy and cut across buildings).

const R = 6371000;
const rad = (d) => (d * Math.PI) / 180;

// Metres between two [lng, lat] points.
export function distM(a, b) {
  const dLat = rad(b[1] - a[1]);
  const dLng = rad(b[0] - a[0]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a[1])) * Math.cos(rad(b[1])) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function bearing(a, b) {
  const y = Math.sin(rad(b[0] - a[0])) * Math.cos(rad(b[1]));
  const x = Math.cos(rad(a[1])) * Math.sin(rad(b[1])) - Math.sin(rad(a[1])) * Math.cos(rad(b[1])) * Math.cos(rad(b[0] - a[0]));
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

const MAX_KMH = 160; // anything faster between two records is a GPS glitch

// Sorted, de-duplicated records with GPS jumps removed.
export function cleanPings(pings) {
  const sorted = (pings || [])
    .filter((p) => Number.isFinite(p?.lat) && Number.isFinite(p?.lng) && !(p.lat === 0 && p.lng === 0) && p.recorded_at)
    .map((p) => ({ ...p, t: new Date(p.recorded_at).getTime() }))
    .filter((p) => Number.isFinite(p.t))
    .sort((a, b) => a.t - b.t);
  const out = [];
  for (const p of sorted) {
    const prev = out[out.length - 1];
    if (prev) {
      if (p.t - prev.t < 1000) continue;
      const kmh = (distM([prev.lng, prev.lat], [p.lng, p.lat]) / ((p.t - prev.t) / 1000)) * 3.6;
      if (kmh > MAX_KMH) continue;
    }
    out.push(p);
  }
  return out;
}

// Long quiet stretches (parked, tablet off) are squeezed so the replay
// doesn't sit still for minutes — they play as at most this much trip time.
export const GAP_CAP_MS = 2 * 60 * 1000;

// pings: output of cleanPings. line: [[lng, lat], ...] road-snapped path or
// null to use the raw records.
export function buildTimeline(pings, line) {
  if (!pings?.length) return null;
  const raw = pings.map((p) => [p.lng, p.lat]);
  const L = line && line.length >= 2 ? line : raw;
  const cum = [0];
  for (let k = 1; k < L.length; k++) cum.push(cum[k - 1] + distM(L[k - 1], L[k]));

  // Pin each record to a vertex of the line, never going backwards. Going
  // further along the line costs a little, so a bus that passes the same
  // street twice is matched to the right pass.
  const v = [];
  let k0 = 0;
  for (let i = 0; i < raw.length; i++) {
    if (L === raw) { v.push(i); continue; }
    let best = k0;
    let bestScore = Infinity;
    for (let k = k0; k < L.length; k++) {
      const ahead = cum[k] - cum[k0];
      if (ahead > 30000) break;
      const score = distM(raw[i], L[k]) + ahead * 0.02;
      if (score < bestScore) { bestScore = score; best = k; }
    }
    v.push(best);
    k0 = best;
  }

  const t = pings.map((p) => p.t);
  const vt = [0];
  for (let i = 1; i < t.length; i++) vt.push(vt[i - 1] + Math.min(t[i] - t[i - 1], GAP_CAP_MS));
  return { line: L, cum, v, t, vt, total: vt[vt.length - 1], pings };
}

// Index of the last entry in a sorted array that is <= x.
function floorIndex(arr, x) {
  let lo = 0;
  let hi = arr.length - 1;
  if (x <= arr[0]) return 0;
  if (x >= arr[hi]) return hi;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (arr[mid] <= x) lo = mid; else hi = mid - 1;
  }
  return lo;
}

function pointAtDistance(tl, d) {
  const { line, cum } = tl;
  const k = floorIndex(cum, d);
  if (k >= line.length - 1) return { pos: line[line.length - 1], k: line.length - 1 };
  const seg = cum[k + 1] - cum[k];
  const f = seg > 0 ? (d - cum[k]) / seg : 0;
  const a = line[k];
  const b = line[k + 1];
  return { pos: [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f], k };
}

// Where the bus is at replay time `vt` (0..tl.total).
export function positionAt(tl, vt) {
  const { t, v, cum, vt: vts, pings, line } = tl;
  const x = Math.max(0, Math.min(vt, tl.total));
  const i = floorIndex(vts, x);
  const j = Math.min(i + 1, t.length - 1);
  const span = vts[j] - vts[i];
  const f = span > 0 ? (x - vts[i]) / span : 0;
  const d0 = cum[v[i]];
  const d1 = cum[v[j]];
  const d = d0 + (d1 - d0) * f;
  const { pos, k } = pointAtDistance(tl, d);
  const ahead = pointAtDistance(tl, Math.min(d + 15, cum[cum.length - 1])).pos;
  const behind = pointAtDistance(tl, Math.max(d - 15, 0)).pos;
  const heading = distM(behind, ahead) > 2 ? bearing(behind, ahead) : null;
  const realDt = t[j] - t[i];
  let kmh = null;
  if (j > i && realDt > 0 && realDt <= 5 * 60 * 1000) kmh = ((d1 - d0) / (realDt / 1000)) * 3.6;
  else if (pings[i]?.speed != null) kmh = pings[i].speed * 3.6;
  return {
    lng: pos[0],
    lat: pos[1],
    heading,
    time: t[i] + realDt * f,
    kmh,
    // The part of the line already driven, ending exactly at the bus.
    traveled: [...line.slice(0, k + 1), pos],
  };
}

// Replay time for a real clock time (for the "jump to" list).
export function vtForTime(tl, ms) {
  const { t, vt } = tl;
  const i = floorIndex(t, ms);
  const j = Math.min(i + 1, t.length - 1);
  if (j === i) return vt[i];
  const f = Math.max(0, Math.min(1, (ms - t[i]) / (t[j] - t[i])));
  return vt[i] + (vt[j] - vt[i]) * f;
}

// Places the bus stood still for at least `minMs` (pings within 60 m).
export function findStops(pings, minMs = 5 * 60 * 1000) {
  const stops = [];
  let s = 0;
  for (let i = 1; i <= pings.length; i++) {
    const moved = i === pings.length || distM([pings[s].lng, pings[s].lat], [pings[i].lng, pings[i].lat]) > 60;
    if (moved) {
      const from = pings[s].t;
      const to = pings[i - 1].t;
      if (to - from >= minMs) stops.push({ lat: pings[s].lat, lng: pings[s].lng, from, to });
      s = i;
    }
  }
  return stops;
}

// Total distance in km along the pinned part of the line.
export function tripKm(tl) {
  if (!tl) return 0;
  return (tl.cum[tl.v[tl.v.length - 1]] - tl.cum[tl.v[0]]) / 1000;
}
