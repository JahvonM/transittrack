// Turn-by-turn maths for the driver's Navigate screen, kept free of React and
// map code so it can be unit-tested. Works the way Google Maps does: the bus
// is placed on the route line, and everything (next turn, distance to it,
// time and distance left, voice prompts) is worked out from how far along
// the route the bus is — not from straight-line distance to a turn point.

const R = 6371000;
const rad = (d) => (d * Math.PI) / 180;

// Metres between two [lng, lat] points.
export function metres(a, b) {
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

// What the banner shows for the turn at the END of a step (Mapbox's
// bannerInstructions): the road to take, the turn, lane arrows, and a
// "Then…" turn that follows soon after.
function bannerOf(b) {
  if (!b?.primary) return null;
  const lanes = (b.sub?.components || [])
    .filter((c) => c.type === "lane")
    .map((c) => ({ active: !!c.active, directions: c.directions || [], activeDirection: c.active_direction || null }));
  const then = b.sub && !lanes.length && b.sub.type ? { text: b.sub.text || "", type: b.sub.type, modifier: b.sub.modifier || null } : null;
  return {
    text: b.primary.text || "",
    type: b.primary.type || "turn",
    modifier: b.primary.modifier || null,
    degrees: b.primary.degrees ?? null,
    secondary: b.secondary?.text || "",
    lanes,
    then,
  };
}

// Mapbox Directions response -> route ready for navigation (or null).
export function parseDirections(data) {
  const route = data?.routes?.[0];
  const leg = route?.legs?.[0];
  const geometry = route?.geometry?.coordinates;
  if (!leg || !geometry?.length) return null;
  const ann = leg.annotation || {};
  const steps = (leg.steps || []).map((s) => ({
    type: s.maneuver?.type || "turn",
    modifier: s.maneuver?.modifier || null,
    exit: s.maneuver?.exit ?? null,
    instruction: s.maneuver?.instruction || "Continue",
    name: s.name || "",
    distanceM: s.distance || 0,
    durationS: s.duration || 0,
    location: s.maneuver?.location || null,
    banner: bannerOf(s.bannerInstructions?.[0]),
    // Spoken while driving this step, about the turn at its end — `at` is
    // the distance before that turn to say it ("In 800 metres, turn right").
    voice: (s.voiceInstructions || [])
      .map((v) => ({ at: v.distanceAlongGeometry, text: v.announcement }))
      .filter((v) => Number.isFinite(v.at) && v.text)
      .sort((a, b) => b.at - a.at),
  }));
  return buildNav({ geometry, steps, durationS: route.duration, maxspeed: ann.maxspeed, congestion: ann.congestion });
}

export function buildNav({ geometry, steps, durationS = null, maxspeed = null, congestion = null }) {
  const cum = [0];
  for (let i = 1; i < geometry.length; i++) cum.push(cum[i - 1] + metres(geometry[i - 1], geometry[i]));
  const total = cum[cum.length - 1];
  const stepSum = steps.reduce((s, x) => s + x.distanceM, 0);
  const scale = stepSum > 0 ? total / stepSum : 1;
  const stepStart = [];
  let at = 0;
  for (const s of steps) { stepStart.push(at); at += s.distanceM * scale; }
  return {
    geometry, cum, total, steps, stepStart,
    durationS: durationS ?? steps.reduce((s, x) => s + x.durationS, 0),
    maxspeed: maxspeed || null,
    congestion: congestion || null,
  };
}

// Closest point on the route to `pos` ({lat, lng}). `hint` is the segment
// found last time, so the search usually only looks a little way around it.
export function projectOnRoute(nav, pos, hint = null) {
  const g = nav.geometry;
  if (!g || g.length < 2 || pos?.lat == null) return null;
  const kx = R * Math.cos(rad(pos.lat));
  const toXY = ([lng, lat]) => [rad(lng) * kx, rad(lat) * R];
  const p = toXY([pos.lng, pos.lat]);
  // A route can use the same road twice (out and back). Jumping far along
  // the route from where the bus just was costs a little, so it stays on
  // the pass it's actually driving.
  const hintAlong = hint != null ? nav.cum[Math.min(hint, nav.cum.length - 1)] : null;
  const search = (from, to, sticky) => {
    let best = null;
    for (let i = from; i <= to; i++) {
      const a = toXY(g[i]);
      const b = toXY(g[i + 1]);
      const dx = b[0] - a[0];
      const dy = b[1] - a[1];
      const len2 = dx * dx + dy * dy;
      const t = len2 > 0 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2)) : 0;
      const qx = a[0] + t * dx;
      const qy = a[1] + t * dy;
      const d = Math.hypot(p[0] - qx, p[1] - qy);
      const score = sticky ? d + Math.abs(nav.cum[i] - hintAlong) * 0.03 : d;
      if (!best || score < best.score) best = { seg: i, t, offM: d, score };
    }
    return best;
  };
  const last = g.length - 2;
  let best = hint != null ? search(Math.max(0, hint - 10), Math.min(last, hint + 300), true) : null;
  if (!best || best.offM > 60) {
    const full = search(0, last, false);
    if (!best || full.offM < best.offM) best = full;
  }
  const a = g[best.seg];
  const b = g[best.seg + 1];
  const point = [a[0] + (b[0] - a[0]) * best.t, a[1] + (b[1] - a[1]) * best.t];
  const along = nav.cum[best.seg] + (nav.cum[best.seg + 1] - nav.cum[best.seg]) * best.t;
  return { seg: best.seg, point, along, offM: best.offM, heading: bearing(a, b) };
}

export const ARRIVED_M = 25;

// Where the bus is in the directions, from its distance along the route.
export function progressAt(nav, along) {
  const remainingM = Math.max(0, nav.total - along);
  if (remainingM <= ARRIVED_M) return { arrived: true, remainingM, remainingS: 0 };
  const { steps, stepStart } = nav;
  let k = stepStart.findIndex((s, i) => i > 0 && s > along + 1);
  if (k === -1) k = steps.length - 1;
  const current = steps[k - 1];
  const step = steps[k];
  const distToManeuverM = Math.max(0, stepStart[k] - along);
  const curLen = stepStart[k] - stepStart[k - 1];
  const frac = curLen > 0 ? Math.min(1, distToManeuverM / curLen) : 0;
  let remainingS = (current?.durationS || 0) * frac;
  for (let j = k; j < steps.length; j++) remainingS += steps[j].durationS;
  // "Then…" when another turn follows within ~150 m of this one.
  const after = steps[k + 1];
  const thenStep = after && after.type !== "arrive" && stepStart[k + 1] - stepStart[k] < 150 ? after : null;
  return {
    arrived: false,
    stepIndex: k,
    step,
    banner: current?.banner || null,
    thenStep,
    distToManeuverM,
    remainingM,
    remainingS,
  };
}

// The voice prompt to say now, if any. Each prompt is said once, when the
// bus gets within its distance of the turn; if GPS skips past several at
// once only the latest one is said.
export function voicePromptAt(nav, progress, spoken) {
  if (!progress || progress.arrived) return null;
  const k = progress.stepIndex;
  const current = nav.steps[k - 1];
  if (!current?.voice?.length) return null;
  const crossed = current.voice.filter((v) => progress.distToManeuverM <= v.at + 5);
  if (!crossed.length) return null;
  const v = crossed[crossed.length - 1];
  const key = `${k}:${Math.round(v.at)}`;
  if (spoken.has(key)) return null;
  for (const c of crossed) spoken.add(`${k}:${Math.round(c.at)}`);
  return { key, text: v.text };
}

// Speed limit (km/h) on the segment the bus is on, when the map knows it.
export function speedLimitKmh(nav, seg) {
  const m = nav?.maxspeed?.[seg];
  if (!m || m.unknown || m.none || !Number.isFinite(m.speed)) return null;
  return m.unit === "mph" ? Math.round(m.speed * 1.609) : Math.round(m.speed);
}

const LEVEL = { heavy: "heavy", severe: "heavy", moderate: "moderate" };

// The route still ahead, split into stretches by traffic (normal / moderate
// / heavy) so it can be drawn blue / orange / red like Google Maps.
export function routeAhead(nav, from = null) {
  const g = nav.geometry;
  const startSeg = from ? from.seg : 0;
  const runs = [];
  let run = null;
  for (let i = startSeg; i < g.length - 1; i++) {
    const level = LEVEL[nav.congestion?.[i]] || "normal";
    if (!run || run.level !== level) {
      const startPt = run ? run.coords[run.coords.length - 1] : (from ? from.point : g[i]);
      run = { level, coords: [startPt] };
      runs.push(run);
    }
    run.coords.push(g[i + 1]);
  }
  return runs.filter((r) => r.coords.length > 1);
}

// "350 m", "1.2 km", "15 km" — rounded the way Google Maps shows them.
export function formatDistance(m) {
  if (m == null || !Number.isFinite(m)) return "";
  if (m < 100) return `${Math.max(0, Math.round(m / 10) * 10)} m`;
  if (m < 1000) return `${Math.round(m / 50) * 50} m`;
  if (m < 10000) return `${(m / 1000).toFixed(1)} km`;
  return `${Math.round(m / 1000)} km`;
}

// "12 min", "1 hr 5 min".
export function formatDuration(s) {
  if (s == null || !Number.isFinite(s)) return "";
  const mins = Math.max(1, Math.round(s / 60));
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m ? `${h} hr ${m} min` : `${h} hr`;
}
