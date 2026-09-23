const STORAGE_KEY = "tt_offline_checkins";

function readQueue() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]"); }
  catch { return []; }
}

function writeQueue(items) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(items)); } catch { /* storage full/unavailable */ }
}

// A check-in only ever gets queued AFTER the person has already been
// identified (lookup already succeeded against the server) — this never
// caches anyone's raw badge tag or access code, just the already-resolved
// action (staff_id/method/status), so a brief connectivity blip at the exact
// moment of confirming boarding doesn't cost someone a redo or a missing
// attendance record. It does NOT make identification itself work offline —
// tapping/typing a fresh badge still needs a live lookup.
export function enqueueCheckIn(payload) {
  const queue = readQueue();
  queue.push({ id: `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, payload, queued_at: new Date().toISOString() });
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
export async function flushQueue(invoke) {
  const queue = readQueue();
  if (!queue.length) return 0;
  const remaining = [];
  let synced = 0;
  for (const item of queue) {
    try {
      await invoke("check_in", item.payload);
      synced++;
    } catch (e) {
      if (isNetworkFailure(e)) remaining.push(item);
    }
  }
  writeQueue(remaining);
  return synced;
}
