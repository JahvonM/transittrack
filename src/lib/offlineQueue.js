const STORAGE_KEY = "tt_offline_checkins";

function readQueue() {
  try { const items = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]"); if (!Array.isArray(items)) throw new Error(); return items; }
  catch { throw new Error("Saved check-ins cannot be read. Do not clear tablet storage."); }
}

function writeQueue(items) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(items)); } catch { throw new Error("Tablet storage is full or unavailable; check-in was not saved."); }
}

// A check-in only ever gets queued AFTER the person has been identified
// (live, or from the tablet's saved staff list in lib/kioskOffline) — the
// queue holds just the resolved action (staff_id/method/status) plus when it
// really happened, so the record keeps the right time when it syncs later.
export function enqueueCheckIn(payload) {
  const queue = readQueue();
  const now = new Date().toISOString();
  const requestId=payload.client_request_id || crypto.randomUUID();
  if(queue.some(item=>item.payload.client_request_id===requestId)) return queue.length;
  queue.push({ id: `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, payload: { ...payload, client_request_id: requestId, occurred_at: payload.occurred_at || now }, queued_at: now });
  writeQueue(queue);
  return queue.length;
}

export function queueLength() {
  return readQueue().length;
}

// Network failures, throttling and server errors are retryable. A missing
// response does not prove the server failed to save the original request.
export function isNetworkFailure(e) {
  return !e?.response || e.response.status===429 || e.response.status>=500;
}

// Replays every queued check-in through the given invoke() function,
// dropping each one as soon as it succeeds; anything that fails again with a
// error stays queued for the next flush. Order is preserved.
let flushing = false;
export async function flushQueue(invoke) {
  if (flushing) return 0;
  const queue = readQueue();
  // Persist IDs before sending older queued work, so a lost response retries the same ID.
  let migrated = false;
  for (const item of queue) {
    if (!item.payload.client_request_id) { item.payload.client_request_id = crypto.randomUUID(); migrated = true; }
  }
  if (migrated) writeQueue(queue);
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
        // Keep every failed item, including server failures and validation rejections.
        // Stop to preserve event order; an operator can resolve the retained error.
        break;
      }
    }
  } finally {
    // Re-read so check-ins queued while this ran aren't lost.
    try { writeQueue(readQueue().filter((item) => !done.has(item.id))); } finally { flushing = false; }
  }
  return synced;
}
