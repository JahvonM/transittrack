import { completeJob, enqueueJob, isOfflineError, pendingJobs } from "@/lib/offlineJobs";
import { isPermanentRejection } from "@/lib/savedWork";

// A driver's step on a job: start, arrived, a tour stop reached, a signature.
// It is kept on the tablet first and sent straight away; with no signal it
// stays saved and goes when the signal is back (offlineRunners: driver_trip).
// A step the server turns down (dispatch cancelled or moved the job) is shown
// to the driver and dropped, never left to hold back other saved work.
export const TRIP_STEP = "driver_trip";

const forget = (id) => { try { completeJob(id); } catch { /* storage unavailable: the sync drops it when the server answers */ } };

export async function jobStep(invoke, action, fields, label) {
  let deviceId = "";
  try { deviceId = localStorage.getItem("tt_driver_device_id") || ""; } catch { /* storage unavailable */ }
  const payload = { ...fields, device_id: deviceId, action, occurred_at: new Date().toISOString(), client_request_id: fields.client_request_id || crypto.randomUUID() };
  let saved = false;
  try { saved = !!deviceId && enqueueJob(TRIP_STEP, payload, label); } catch { saved = false; }
  try {
    const result = await invoke(action, payload);
    if (saved) forget(payload.client_request_id);
    return { result, queued: false };
  } catch (error) {
    if (saved && isOfflineError(error) && !isPermanentRejection(error)) return { result: null, queued: true };
    if (saved) forget(payload.client_request_id);
    throw error;
  }
}

const ORDER = ["scheduled", "on_the_way", "arrived", "completed"];
const ahead = (status, next) => ORDER.indexOf(next) > ORDER.indexOf(status);

// What a step does to a job, for showing it before the server has it.
export function applyStep(trip, p) {
  if (!trip || p.trip_id !== trip.id) return trip;
  const at = p.occurred_at;
  if (p.action === "update_trip_status" && ahead(trip.status, p.status)) {
    return { ...trip, status: p.status, ...(p.status === "on_the_way" ? { started_at: at } : p.status === "arrived" ? { arrived_at: at } : { completed_at: at }) };
  }
  if (p.action === "reach_stop") {
    return { ...trip, stops: (trip.stops || []).map((s, i) => (i === Number(p.index) && !s.reached_at ? { ...s, reached_at: at } : s)) };
  }
  if (p.action === "sign_trip" && ["pickup", "dropoff"].includes(p.mode) && !trip[`${p.mode}_signed_at`]) {
    const next = { ...trip, [`${p.mode}_signed_at`]: at, [`${p.mode}_signed_by`]: p.signed_by || "", [`${p.mode}_signed_role`]: p.signed_role === "reception" ? "reception" : "guest" };
    if (p.mode === "pickup" && trip.status === "scheduled") Object.assign(next, { status: "on_the_way", started_at: at });
    if (p.mode === "dropoff") Object.assign(next, { status: "completed", completed_at: at });
    return next;
  }
  return trip;
}

// Steps still waiting on the tablet, laid over the jobs from the server so
// the screen shows what the driver already did.
export function pendingSteps() {
  try { return pendingJobs().filter((j) => j.kind === TRIP_STEP && !j.state).map((j) => j.payload); } catch { return []; }
}
export function withPendingSteps(trips, steps = pendingSteps()) {
  if (!steps.length) return trips;
  return trips.map((t) => steps.reduce((acc, p) => applyStep(acc, p), t));
}

// Where the tablet is, for the record of where a job was signed. Best effort:
// a few seconds at most, then the bus's last known position, then nothing.
export function currentPosition(vehicle, { timeoutMs = 4000 } = {}) {
  const fallback = () => {
    const fresh = vehicle && Number.isFinite(Number(vehicle.current_lat)) && Number.isFinite(Number(vehicle.current_lng))
      && Date.now() - Date.parse(vehicle.last_location_update || 0) < 10 * 60_000;
    return fresh ? { lat: Number(vehicle.current_lat), lng: Number(vehicle.current_lng) } : null;
  };
  return new Promise((resolve) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) { resolve(fallback()); return; }
    const timer = setTimeout(() => resolve(fallback()), timeoutMs + 500);
    try {
      navigator.geolocation.getCurrentPosition(
        (pos) => { clearTimeout(timer); resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }); },
        () => { clearTimeout(timer); resolve(fallback()); },
        { enableHighAccuracy: true, maximumAge: 60_000, timeout: timeoutMs }
      );
    } catch { clearTimeout(timer); resolve(fallback()); }
  });
}

// Jobs this tablet finished (drop-off signed). A finished job drops off the
// list like a cancelled one; this tells the two apart for the job alert.
const DONE_KEY = "tt_jobs_done";
export function markJobDone(id) {
  try {
    const done = JSON.parse(localStorage.getItem(DONE_KEY) || "[]");
    localStorage.setItem(DONE_KEY, JSON.stringify([...done.filter((x) => x !== id), id].slice(-100)));
  } catch { /* storage unavailable: at worst the driver sees "removed" for a job they finished */ }
}
export function jobDoneHere(id) {
  try { return JSON.parse(localStorage.getItem(DONE_KEY) || "[]").includes(id); } catch { return false; }
}
