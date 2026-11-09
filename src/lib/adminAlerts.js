// Admin pop-ups: the bar that drops in at the top of Admin, and the bell list
// behind it. Turns what the live lists see change (jobs, ride requests,
// incidents, faults, lost items) into short notices for the office, plus
// jobs that haven't started on time.
import { JOB_TYPES } from "@/lib/jobs";
import { TRANSIT_TIME_ZONE } from "@/lib/localTime";

// Only things that happened in the last 15 minutes pop up: a row that just
// came into view but is older (a list catching up after sleep) doesn't.
export const FRESH_MS = 15 * 60_000;
// A job still not started this long after its pickup time is flagged, for up
// to 3 hours.
export const LATE_AFTER_MS = 10 * 60_000;
export const LATE_UNTIL_MS = 3 * 3600_000;
export const MAX_ITEMS = 50;
export const MAX_POPUPS = 3;

// tone: colour and icon. section: the Admin page it opens. sticky: stays
// until closed. quiet: listed but no pop-up (SOS already has its red bar).
export const ALERT_KINDS = {
  request_new: { tone: "info", section: "trips?view=requests", label: "Ride requests" },
  job_created: { tone: "info", section: "trips", label: "New jobs" },
  job_started: { tone: "info", section: "trips", label: "Jobs started" },
  job_completed: { tone: "success", section: "billing", label: "Jobs completed" },
  job_cancelled: { tone: "warning", section: "trips", label: "Jobs cancelled" },
  job_late: { tone: "danger", section: "trips", label: "Jobs not started", sticky: true },
  sos: { tone: "danger", section: "fleet", label: "SOS", sticky: true, quiet: true },
  incident: { tone: "warning", section: "incident-reports", label: "Incidents", sticky: true },
  fault: { tone: "warning", section: "faults", label: "Faults" },
  lost_item: { tone: "info", section: "lost-items", label: "Lost items" },
};
// The lists the bar watches.
export const WATCHED = ["Trip", "BookingRequest", "Incident", "Fault", "LostItemReport"];

const JOB_LABEL = Object.fromEntries(JOB_TYPES.map((t) => [t.id, t.label]));
const SERVICE_LABEL = { ...JOB_LABEL, hotel_tour: "Island tour" };
const INCIDENT_LABEL = { breakdown: "Breakdown", accident: "Accident", delay: "Delay" };

export function clockTime(iso) {
  const t = Date.parse(iso || "");
  return Number.isFinite(t) ? new Date(t).toLocaleTimeString("en-GB", { timeZone: TRANSIT_TIME_ZONE, hour: "numeric", minute: "2-digit", hour12: true }) : "";
}
const join = (...parts) => parts.filter(Boolean).join(" · ");
const cut = (text, n = 80) => { const s = String(text || "").replace(/\s+/g, " ").trim(); return s.length > n ? s.slice(0, n - 1) + "…" : s; };

// Changes the admin made on this device (cancelling or editing a job) don't
// pop up for them. Forgotten after 10 minutes.
const own = new Map();
export function noteOwnChange(id) { if (id) own.set(id, Date.now()); }
function isOwn(id, now = Date.now()) {
  for (const [k, at] of own) if (now - at > 10 * 60_000) own.delete(k);
  return own.has(id);
}

const make = (kind, id, at, title, detail) => ({ key: `${kind}:${id}`, kind, id, at: new Date(Date.parse(at)).toISOString(), title, detail: detail || "" });

// One live-list change (subscribe event) as a notice, or null.
export function alertFromChange(entity, event, { now = Date.now(), me = "" } = {}) {
  if (!event || event.type === "delete" || !event.data || typeof event.data !== "object") return null;
  const r = event.data;
  const id = r.id || event.id;
  if (!id) return null;
  const fresh = (iso) => { const t = Date.parse(iso || ""); return Number.isFinite(t) && now - t <= FRESH_MS && t - now <= 5 * 60_000; };
  const created = event.type === "create";

  if (entity === "Trip") {
    if (!r.job_type || isOwn(id, now)) return null; // route runs aren't jobs
    const what = join(JOB_LABEL[r.job_type] || "Job", clockTime(r.scheduled_time), cut(r.pickup_name, 40));
    if (r.status === "cancelled") return fresh(r.cancelled_at) ? make("job_cancelled", id, r.cancelled_at, "Job cancelled", join(what, r.vehicle_name)) : null;
    if (r.status === "completed") return fresh(r.completed_at) ? make("job_completed", id, r.completed_at, "Job completed", join(r.vehicle_name, JOB_LABEL[r.job_type], cut(r.dropoff_name, 40))) : null;
    if (r.status === "on_the_way") return fresh(r.started_at) ? make("job_started", id, r.started_at, "Job started", `${r.vehicle_name || "A bus"} is on the way to ${cut(r.pickup_name, 40) || "the pickup"}`) : null;
    if (created && r.status === "scheduled" && fresh(r.created_date) && !(me && r.created_by === me)) return make("job_created", id, r.created_date, "New job", join(what, r.vehicle_name || "No bus yet"));
    return null;
  }
  if (entity === "BookingRequest") {
    if (!created || r.status !== "new" || !fresh(r.created_date)) return null;
    const what = join(SERVICE_LABEL[r.service] || "Ride", clockTime(r.requested_time), cut(r.pickup, 40));
    return make("request_new", id, r.created_date, r.company_id ? `Job request from ${cut(r.company_name, 40) || "a company"}` : "New ride request on the website", what);
  }
  if (entity === "Incident") {
    const at = r.occurred_at || r.created_date;
    if (!created || !fresh(at)) return null;
    if (r.type === "emergency") return make("sos", id, at, `SOS from ${r.vehicle_name || "a bus"}`, r.driver_name || "");
    return make("incident", id, at, `${INCIDENT_LABEL[r.type] || "Incident"} reported`, join(r.vehicle_name, r.driver_name));
  }
  if (entity === "Fault") {
    if (!created || !fresh(r.created_date)) return null;
    return make("fault", id, r.created_date, `New fault: ${cut(r.title, 60) || "reported"}`, join(r.vehicle_name, r.severity ? `${r.severity} severity` : ""));
  }
  if (entity === "LostItemReport") {
    if (!created || !fresh(r.created_date)) return null;
    return make("lost_item", id, r.created_date, "Lost item reported", join(r.vehicle_name, cut(r.description, 60)));
  }
  return null;
}

// Jobs still waiting to start well after their pickup time.
export function lateJobs(trips, now = Date.now()) {
  const out = [];
  for (const r of trips || []) {
    if (!r?.id || !r.job_type || r.status !== "scheduled") continue;
    const due = Date.parse(r.scheduled_time || "");
    if (!Number.isFinite(due) || now - due < LATE_AFTER_MS || now - due > LATE_UNTIL_MS) continue;
    out.push(make("job_late", r.id, new Date(due + LATE_AFTER_MS).toISOString(), "Job not started",
      join(`${r.vehicle_name || "No bus"} was due at ${clockTime(r.scheduled_time)}`, JOB_LABEL[r.job_type], cut(r.pickup_name, 40))));
  }
  return out;
}

// What this admin has seen, read and muted, kept in this browser so a reload
// doesn't pop everything up again. Never holds customers' names or contacts.
const storeKey = (email) => `tt-admin-alerts:${String(email || "admin").toLowerCase()}`;
export function loadAlertState(email, storage = globalThis.localStorage) {
  const empty = { items: [], seen: [], read: [], muted: false };
  try {
    const saved = JSON.parse(storage?.getItem(storeKey(email)) || "null");
    if (!saved || typeof saved !== "object") return empty;
    const strings = (a, n) => (Array.isArray(a) ? a.filter((x) => typeof x === "string").slice(0, n) : []);
    const items = (Array.isArray(saved.items) ? saved.items : [])
      .filter((i) => i && typeof i.key === "string" && ALERT_KINDS[i.kind] && typeof i.title === "string" && Number.isFinite(Date.parse(i.at)))
      .slice(0, MAX_ITEMS)
      .map((i) => ({ key: i.key, kind: i.kind, id: String(i.id || ""), at: i.at, title: cut(i.title, 120), detail: cut(i.detail, 160) }));
    return { items, seen: strings(saved.seen, 400), read: strings(saved.read, 400), muted: saved.muted === true };
  } catch { return empty; }
}
export function saveAlertState(email, state, storage = globalThis.localStorage) {
  try {
    storage?.setItem(storeKey(email), JSON.stringify({
      items: state.items.slice(0, MAX_ITEMS), seen: state.seen.slice(0, 400), read: state.read.slice(0, 400), muted: !!state.muted,
    }));
  } catch { /* storage blocked: alerts still work for this visit */ }
}

// A new notice into the state: listed once, newest first.
export function addAlert(state, alert) {
  if (!alert || state.seen.includes(alert.key)) return state;
  return { ...state, items: [alert, ...state.items.filter((i) => i.key !== alert.key)].slice(0, MAX_ITEMS), seen: [alert.key, ...state.seen].slice(0, 400) };
}
export const unreadCount = (state) => state.items.filter((i) => !state.read.includes(i.key)).length;
