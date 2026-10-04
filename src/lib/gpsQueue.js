// GPS points the driver tablet couldn't send (no signal / no WiFi). Each
// point keeps the time it was really taken, so the trip replay has no holes
// once it uploads. The queue lives in localStorage, is capped (old points are
// thinned out, never the newest), and uploads oldest-first in batches; the
// server ignores points it already has, so a retried batch can't duplicate.
const KEY = "tt_gps_queue";
const EVENT = "tt-gps-queue";
const MAX_POINTS = 2000; // ~8 hours at one point per 15 s
const MIN_GAP_MS = 15000; // offline, keep one point every 15 s
const BATCH = 200;

function read() {
  try { const items = JSON.parse(localStorage.getItem(KEY) || "[]"); if (!Array.isArray(items)) throw new Error(); return items; }
  catch { throw new Error("Saved GPS history cannot be read. Do not clear tablet storage."); }
}
function write(points) {
  try { localStorage.setItem(KEY, JSON.stringify(points)); } catch { throw new Error("GPS history could not be saved on this tablet"); }
  try { window.dispatchEvent(new Event(EVENT)); } catch { /* non-browser */ }
}

// Over the cap: drop every second point from the older half, so the whole
// trip stays covered (less detail long ago) and the latest stays exact.
function thin(points) {
  if (points.length <= MAX_POINTS) return points;
  const half = Math.floor(points.length / 2);
  return [...points.slice(0, half).filter((_, i) => i % 2 === 0), ...points.slice(half)];
}

const round = (n, d) => (typeof n === "number" && Number.isFinite(n) ? Number(n.toFixed(d)) : null);

export function queueGpsPoint({ lat, lng, speed, heading, accuracy, t }) {
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat)>90 || Math.abs(lng)>180) return false;
  const points = read();
  const time = t ? new Date(t) : new Date();
  if (!Number.isFinite(time.getTime()) || time.getTime()>Date.now()+60000 || time.getTime()<Date.now()-72*3600000) return false;
  const last = points[points.length - 1];
  if (last && time - new Date(last.t) < MIN_GAP_MS) return;
  points.push({ t: time.toISOString(), lat: round(lat, 6), lng: round(lng, 6), speed: round(speed, 2), heading: round(heading, 1), accuracy: round(accuracy, 1) });
  write(thin(points));
  return true;
}

export function queuedGpsCount() {
  return read().length;
}
export const GPS_QUEUE_EVENT = EVENT;

let flushing = false;
// Upload what's waiting through the driver session. Returns how many points
// were accepted; stops at the first network failure (still offline).
export async function flushGpsQueue(invoke) {
  if (flushing || !invoke) return 0;
  if (typeof navigator !== "undefined" && navigator.onLine === false) return 0;
  flushing = true;
  let sent = 0;
  try {
    for (let guard = 0; guard < 50; guard++) {
      const batch = read().slice(0, BATCH);
      if (!batch.length) break;
      try {
        await invoke("upload_track", { points: batch });
      } catch { break; } // Authentication, throttling and server errors retain the whole batch.
      const sentTimes = new Set(batch.map((p) => p.t));
      write(read().filter((p) => !sentTimes.has(p.t)));
      sent += batch.length;
    }
  } finally {
    flushing = false;
  }
  return sent;
}

export function clearGpsQueue() {
  write([]);
}
