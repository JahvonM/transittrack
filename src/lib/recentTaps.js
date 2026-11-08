import { RIDE_MAX_MS, automaticTapAdvice, readerMode, tapAdvice } from "../../base44/shared/boardingEvents.ts";

// The boarding tablet's own memory of recent taps per passenger: direction
// and when it happened, saved for taps recorded online and taps saved
// offline. It lets the tablet say "Already recorded" and suggest the right
// direction with no connection, using the same rules as the server.
// Only passenger ids and times are kept, never card numbers.

const KEY = "tt_kiosk_recent_taps_v1";
const LEGACY_KEY = "tt_kiosk_last_status"; // direction only, from older versions
const KEEP = 10;

function read() {
  try { const v = JSON.parse(localStorage.getItem(KEY) || "{}"); return v && typeof v === "object" && !Array.isArray(v) ? v : {}; } catch { return {}; }
}

export function noteTap(staffId, status, at = Date.now()) {
  if (!staffId || !["boarded", "off_board"].includes(status)) return;
  const all = read(), now = Date.now();
  const time = typeof at === "number" ? at : Date.parse(at) || now;
  const list = [...(all[staffId] || []), { status, at: time }]
    .filter((e) => now - e.at < RIDE_MAX_MS * 2)
    .sort((a, b) => a.at - b.at)
    .slice(-KEEP);
  all[staffId] = list;
  // Drop people with nothing recent so the store stays small.
  for (const id of Object.keys(all)) if (!all[id]?.length || now - all[id].at(-1).at > RIDE_MAX_MS * 2) delete all[id];
  try { localStorage.setItem(KEY, JSON.stringify(all)); } catch { /* storage full: the server still checks */ }
}

export function tapsFor(staffId) {
  const list = read()[staffId] || [];
  if (list.length) return list;
  // An older tablet only knew the last direction, not when.
  try { const old = JSON.parse(localStorage.getItem(LEGACY_KEY) || "{}")[staffId]; if (old) return [{ status: old, at: Date.now() - RIDE_MAX_MS / 2 }]; } catch { /* none */ }
  return [];
}

// What to do with a tap on this tablet: direction and the tap it repeats.
// `automatic`: a both-way reader recording card taps by itself (tap on, tap
// again to get off), with the same rules as the server.
export function localTapAdvice(staffId, mode, now = Date.now(), automatic = false) {
  const m = readerMode(mode), auto = automatic && m === "both";
  const advice = auto ? automaticTapAdvice(tapsFor(staffId), now) : tapAdvice(tapsFor(staffId), m, now);
  return { next_status: advice.status, automatic: auto, already: advice.repeat ? { status: advice.repeat.status, at: new Date(advice.repeat.at).toISOString() } : null };
}

export function forgetTaps() {
  try { localStorage.removeItem(KEY); } catch { /* ignore */ }
}
