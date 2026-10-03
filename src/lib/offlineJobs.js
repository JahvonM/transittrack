// Small persistent job queue for work that must survive a dead connection
// (inspections done in a yard or garage with no signal). Jobs live in
// localStorage, retry on reconnect / every minute, and runners report their
// own progress through `save` so a job that half-finished resumes where it
// stopped instead of creating duplicates.
import { reportError } from "@/lib/reportError";

const KEY = "tt_offline_jobs";
export const JOBS_EVENT = "tt-offline-jobs";
const runners = {};
let flushing = false;
let started = false;

function read() {
  try { return JSON.parse(localStorage.getItem(KEY) || "[]"); } catch { return []; }
}
function write(jobs) {
  let ok = true;
  try { localStorage.setItem(KEY, JSON.stringify(jobs)); } catch { ok = false; /* storage full/unavailable */ }
  try { window.dispatchEvent(new Event(JOBS_EVENT)); } catch { /* non-browser */ }
  return ok;
}

// No response at all (or the browser says it's offline) means the request
// never reached the server, so it's safe to retry later.
export function isOfflineError(e) {
  return (typeof navigator !== "undefined" && navigator.onLine === false) || !e?.response;
}

export function registerRunner(kind, fn) {
  runners[kind] = fn;
}

export function enqueueJob(kind, payload, label) {
  const jobs = read();
  jobs.push({ id: `job-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, kind, payload, label: label || kind, queued_at: new Date().toISOString() });
  return write(jobs); // false when the device storage is full
}

export function pendingJobs() {
  return read();
}

export async function flushJobs() {
  if (flushing || (typeof navigator !== "undefined" && navigator.onLine === false)) return 0;
  flushing = true;
  let synced = 0;
  try {
    for (const job of read()) {
      const runner = runners[job.kind];
      if (!runner) continue;
      const save = (payload) => write(read().map((j) => (j.id === job.id ? { ...j, payload } : j)));
      try {
        await runner(job.payload, save);
        write(read().filter((j) => j.id !== job.id));
        synced++;
      } catch (e) {
        if (e?.response?.status === 401 || isOfflineError(e)) break; // still offline, try again later
        // The server rejected it for good; drop it and tell the admins.
        write(read().filter((j) => j.id !== job.id));
        reportError(e, { source: "offline-sync", extra: { kind: job.kind, label: job.label } });
      }
    }
  } finally {
    flushing = false;
  }
  return synced;
}

export function startOfflineSync() {
  if (started || typeof window === "undefined") return;
  started = true;
  window.addEventListener("online", () => { flushJobs(); });
  setInterval(() => { if (read().length) flushJobs(); }, 60000);
  setTimeout(() => { if (read().length) flushJobs(); }, 3000);
}
