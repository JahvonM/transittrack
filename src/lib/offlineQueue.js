const STORAGE_KEY = "tt_offline_checkins";

function readQueue() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]"); }
  catch { return []; }
}

function writeQueue(items) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(items)); } catch { /* storage full/unavailable */ }
}

// A check-in only ever gets queued AFTER the person has been identified
// (live, or from the tablet's saved staff list in lib/kioskOffline) — the
// queue holds just the resolved action (staff_id/method/status) plus when it
// really happened, so the record keeps the right time when it syncs later.
export function enqueueCheckIn(payload) {
  const queue = readQueue();
  const now = new Date().toISOString();
  queue.push({ id: `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, payload: { ...payload, occurred_at: payload.occurred_at || now }, queued_at: now });
  writeQueue(queue);
  return queue.length;
}

export function queueLength() {
  return readQueue().length;
}

// A network failure (the request never reached the server) has no
// `response` on the thrown error; a real rejection from the backend (bad
// staff_id, unknown action, etc.) does. Only the former is safe to retry
// blindly — retrying a genuine rejection would just loop forever on the
// same "no" the server already gave.
export function isNetworkFailure(e) {
  return !e?.response;
}

// Replays every queued check-in through the given invoke() function,
// dropping each one as soon as it succeeds; anything that fails again with a
// network error stays queued for the next flush. Order is preserved.
let flushing = false;
export async function flushQueue(invoke) {
  if (flushing) return 0;
  const queue = readQueue();
  if (!queue.length) return 0;
  flushing = true;
  const done = new Set();
  let synced = 0;
  try {
    for (const item of queue) {
      try {
        await invoke("check_in", item.payload);
        synced++;
        done.add(item.id);
      } catch (e) {
        if ([401, 403, 429].includes(e?.response?.status)) break;
        if (!isNetworkFailure(e)) done.add(item.id);
      }
    }
  } finally {
    // Re-read so check-ins queued while this ran aren't lost.
    writeQueue(readQueue().filter((item) => !done.has(item.id)));
    flushing = false;
  }
  return synced;
}
