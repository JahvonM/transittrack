// Service due: when each bus's services (oil and filter every so many km or
// months) come round again. The rules match the daily reminder
// (base44/functions/maintenanceAlerts): by km, a service is due within 500 km
// of its next one and overdue once the odometer reaches it; by date, due
// within the reminder days and overdue after the day. With both, whichever
// comes first. The records are MaintenanceSchedule rows, one per service per
// bus; the table keeps time intervals in days, so months are 30 days each.
import { MAX_ODOMETER } from "@/lib/workshopJobs";

export const KM_SOON = 500;
export const DEFAULT_REMINDER_DAYS = 14;
export const DAYS_PER_MONTH = 30;
export const SERVICE_NAME_LIMIT = 120;
export const SERVICE_NOTES_LIMIT = 2000;
const MAX_INTERVAL_KM = 1_000_000;
const MAX_INTERVAL_DAYS = 3650;
const DAY_MS = 86_400_000;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// ----- days -----

// Today's date where the buses are (Grenada), as 2026-11-24.
export const todayIso = (now = new Date()) => now.toLocaleDateString("en-CA", { timeZone: "America/Grenada" });
export const validDay = (iso) => /^\d{4}-\d{2}-\d{2}$/.test(String(iso || "")) && Number.isFinite(Date.parse(`${iso}T00:00:00Z`));
const dayNumber = (iso) => Math.floor(Date.parse(`${iso}T00:00:00Z`) / DAY_MS);
const isoOfDay = (n) => new Date(n * DAY_MS).toISOString().slice(0, 10);
// A date-only value as words, the same anywhere in the world: 12 Nov 2026.
export function dayText(iso) {
  if (!validDay(iso)) return "";
  const d = new Date(`${iso}T00:00:00Z`);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

// ----- words -----

const km = (n) => `${Math.round(Number(n)).toLocaleString("en")} km`;
const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
// An interval of days in the words a mechanic uses: 6 months, or 45 days.
export function daysText(days) {
  const n = Number(days) || 0;
  if (n <= 0) return "";
  return n % DAYS_PER_MONTH === 0 ? plural(n / DAYS_PER_MONTH, "month") : plural(n, "day");
}
export function everyText(s) {
  const parts = [Number(s?.interval_km) > 0 && km(s.interval_km), daysText(s?.interval_days)].filter(Boolean);
  return parts.length ? `Every ${parts.join(" or ")}` : "No interval set";
}
export function lastText(s) {
  const when = validDay(s?.last_service_date) ? dayText(s.last_service_date) : "";
  const at = Number(s?.last_service_mileage) > 0 ? `at ${km(s.last_service_mileage)}` : "";
  return when || at ? `Last done ${[when, at].filter(Boolean).join(" ")}` : "Not done here yet";
}

// ----- the state of one service -----

export const RANK = { overdue: 0, due: 1, ok: 2, unknown: 3, unset: 3, off: 4 };
export const STATE_LABEL = { overdue: "Overdue", due: "Due soon", ok: "OK", unknown: "Not known", unset: "Not set", off: "Not repeating" };
export const STATE_TONE = { overdue: "danger", due: "warning", ok: "success", unknown: "neutral", unset: "neutral", off: "neutral" };

export const reminderDaysFrom = (settings = []) => {
  const n = Number(settings?.[0]?.maintenance_reminder_days);
  return n > 0 ? n : DEFAULT_REMINDER_DAYS;
};

function kmCheck(s, odometer) {
  const every = Number(s.interval_km) || 0;
  const last = Number(s.last_service_mileage) || 0;
  // As the reminder does: a km service counts from its last km (0 if none);
  // a service kept by date counts its km too once a last km is recorded.
  if (every <= 0 || (s.due_type === "days" && last <= 0)) return null;
  const next = last + every;
  if (!(odometer > 0)) return { next, left: null, state: "unknown", text: "Odometer not recorded" };
  const left = next - odometer;
  const state = left <= 0 ? "overdue" : left <= KM_SOON ? "due" : "ok";
  const text = left === 0 ? "Due now" : state === "overdue" ? `Overdue by ${km(-left)}` : state === "due" ? `Due in ${km(left)}` : `In ${km(left)}`;
  return { next, left, state, text };
}

function dateCheck(s, today, reminderDays) {
  const every = Number(s.interval_days) || 0;
  if (every <= 0 || !validDay(s.last_service_date) || !validDay(today)) return null;
  const nextDay = dayNumber(s.last_service_date) + every;
  const left = nextDay - dayNumber(today);
  const state = left < 0 ? "overdue" : left <= reminderDays ? "due" : "ok";
  const text = state === "overdue" ? `Overdue by ${plural(-left, "day")}`
    : state === "due" ? (left === 0 ? "Due today" : left === 1 ? "Due tomorrow" : `Due in ${plural(left, "day")}`)
      : `By ${dayText(isoOfDay(nextDay))}`;
  return { next: isoOfDay(nextDay), left, state, text };
}

// One service: its km and date checks, the worse of the two, and a line to
// show. A check that can't be worked out (no odometer) doesn't hide one that can.
export function serviceState(s, { odometer = 0, today = todayIso(), reminderDays = DEFAULT_REMINDER_DAYS } = {}) {
  if (s?.status === "completed") return { state: "off", rank: RANK.off, text: STATE_LABEL.off, km: null, date: null };
  const k = kmCheck(s || {}, Number(odometer) || 0);
  const d = dateCheck(s || {}, today, reminderDays);
  const known = [k, d].filter((c) => c && c.state !== "unknown").sort((a, b) => RANK[a.state] - RANK[b.state]);
  if (known.length) return { state: known[0].state, rank: RANK[known[0].state], text: known[0].text, km: k, date: d };
  if (k) return { state: "unknown", rank: RANK.unknown, text: k.text, km: k, date: d };
  const text = Number(s?.interval_days) > 0 && !validDay(s?.last_service_date) ? "Set when it was last done" : "No interval set";
  return { state: "unset", rank: RANK.unset, text, km: null, date: null };
}

// The next one, in full: "Next at 108,000 km or by 12 May 2027".
export function nextText(state) {
  const parts = [state?.km && `at ${km(state.km.next)}`, state?.date && `by ${dayText(state.date.next)}`].filter(Boolean);
  return parts.length ? `Next ${parts.join(" or ")}` : "";
}

// The status kept on the record, which the older screens show: due or
// overdue as the rules say, otherwise upcoming.
export const savedStatus = (state) => (state === "overdue" || state === "due" ? state : "upcoming");

// ----- a bus's services, and the fleet's -----

export const odometerOf = (vehicle) => {
  const n = Number(vehicle?.record?.current_odometer);
  return n > 0 ? Math.round(n) : 0;
};

const byUrgency = (a, b) => a.rank - b.rank || String(a.schedule.service_type || "").localeCompare(String(b.schedule.service_type || ""));

// A bus's services, the most urgent first.
export function servicesFor(schedules = [], vehicle, opts = {}) {
  if (!vehicle || vehicle.kind !== "bus") return [];
  const odometer = odometerOf(vehicle);
  return schedules
    .filter((s) => s.vehicle_id === vehicle.id)
    .map((schedule) => ({ schedule, vehicle, ...serviceState(schedule, { ...opts, odometer }) }))
    .sort(byUrgency);
}

// Every bus's services, grouped for the Service page and the Home tile.
export function fleetDue(schedules = [], vehicles = [], opts = {}) {
  const all = vehicles.filter((v) => v.kind === "bus").flatMap((v) => servicesFor(schedules, v, opts)).sort(byUrgency);
  const group = (...states) => all.filter((i) => states.includes(i.state));
  return { overdue: group("overdue"), due: group("due"), later: group("ok"), unset: group("unknown", "unset"), total: all.filter((i) => i.state !== "off").length };
}

// A bus's services in a few words, for the link to its Service section.
export function serviceHint(items = []) {
  const live = items.filter((i) => i.state !== "off");
  if (!live.length) return "None set up yet";
  const overdue = live.filter((i) => i.state === "overdue").length;
  const due = live.filter((i) => i.state === "due").length;
  if (overdue || due) return [overdue && `${overdue} overdue`, due && `${due} due soon`].filter(Boolean).join(" · ");
  const unset = live.filter((i) => i.state === "unset" || i.state === "unknown").length;
  return unset === live.length ? "Set when each was last done" : "Nothing due";
}

// The worst state among a bus's services, for its tile: "overdue", "due" or "".
export function busServiceFlag(items = []) {
  if (items.some((i) => i.state === "overdue")) return "overdue";
  if (items.some((i) => i.state === "due")) return "due";
  return "";
}

// ----- from the model page -----

const sameName = (a, b) => String(a || "").trim().toLowerCase() === String(b || "").trim().toLowerCase();

// The model page's service intervals this bus doesn't have yet (by name).
export function fromModelPage(facts = [], guideId, existing = []) {
  if (!guideId) return [];
  return facts
    .filter((f) => f.guide_id === guideId && f.section === "service" && (Number(f.interval_km) > 0 || Number(f.interval_months) > 0))
    .filter((f) => !existing.some((s) => sameName(s.service_type, f.label)))
    .sort((a, b) => (Number(a.sort_order) || 0) - (Number(b.sort_order) || 0))
    .map((f) => ({
      key: f.id,
      service_type: String(f.label || "").trim().slice(0, SERVICE_NAME_LIMIT),
      interval_km: Number(f.interval_km) > 0 ? Math.round(Number(f.interval_km)) : 0,
      interval_days: Number(f.interval_months) > 0 ? Math.round(Number(f.interval_months) * DAYS_PER_MONTH) : 0,
    }));
}

// ----- the form -----

const digits = (v) => String(v ?? "").replace(/[,\s]/g, "");

export function scheduleForm(s = null, { today = todayIso(), odometer = 0 } = {}) {
  const days = Number(s?.interval_days) || 0;
  const months = days > 0 && days % DAYS_PER_MONTH === 0;
  return {
    service_type: s?.service_type || "",
    every_km: Number(s?.interval_km) > 0 ? String(s.interval_km) : "",
    every_time: days > 0 ? String(months ? days / DAYS_PER_MONTH : days) : "",
    time_unit: days > 0 && !months ? "days" : "months",
    last_date: s ? (validDay(s.last_service_date) ? s.last_service_date : "") : today,
    last_km: s ? (Number(s.last_service_mileage) > 0 ? String(s.last_service_mileage) : "") : (odometer > 0 ? String(odometer) : ""),
    notes: s?.notes || "",
  };
}

const wholeNumber = (v) => /^\d+$/.test(digits(v));

export function scheduleProblem(form, { today = todayIso() } = {}) {
  const name = String(form.service_type || "").trim();
  if (!name) return "Say what the service is, like Engine oil and filter.";
  if (name.length > SERVICE_NAME_LIMIT) return `The name is up to ${SERVICE_NAME_LIMIT} characters.`;
  const everyKm = digits(form.every_km);
  const everyTime = digits(form.every_time);
  if (everyKm && !(wholeNumber(everyKm) && Number(everyKm) <= MAX_INTERVAL_KM)) return "Every km is a whole number.";
  if (everyTime && !(wholeNumber(everyTime) && Number(everyTime) > 0)) return `Every ${form.time_unit === "days" ? "days" : "months"} is a whole number.`;
  if (!(Number(everyKm) > 0) && !(Number(everyTime) > 0)) return "Say how often: every so many km, months or both.";
  const days = Number(everyTime) * (form.time_unit === "days" ? 1 : DAYS_PER_MONTH);
  if (days > MAX_INTERVAL_DAYS) return "That's more than ten years.";
  const lastDate = String(form.last_date || "").trim();
  if (lastDate && !validDay(lastDate)) return "The last date isn't a date.";
  if (lastDate && validDay(today) && lastDate > today) return "The last date can't be in the future.";
  if (Number(everyTime) > 0 && !lastDate) return "Say when it was last done (today if you don't know).";
  const lastKm = digits(form.last_km);
  if (lastKm && !(wholeNumber(lastKm) && Number(lastKm) <= MAX_ODOMETER)) return "The last km is a whole number.";
  if (Number(everyKm) > 0 && !lastKm) return "Say at what km it was last done (the odometer now if you don't know).";
  if (String(form.notes || "").length > SERVICE_NOTES_LIMIT) return `Notes are up to ${SERVICE_NOTES_LIMIT.toLocaleString("en")} characters.`;
  return "";
}

// What to save. A new one also carries its bus (the server adds its company).
// The caller adds the status (savedStatus), worked out from what is saved.
export function scheduleData(form, vehicle = null) {
  const everyKm = Number(digits(form.every_km)) || 0;
  const everyTime = Number(digits(form.every_time)) || 0;
  const data = {
    service_type: String(form.service_type || "").trim(),
    interval_km: everyKm,
    interval_days: everyTime * (form.time_unit === "days" ? 1 : DAYS_PER_MONTH),
    due_type: everyKm > 0 ? "mileage" : "days",
    last_service_date: validDay(form.last_date) ? form.last_date : null,
    last_service_mileage: Number(digits(form.last_km)) || 0,
    notes: String(form.notes || "").trim(),
  };
  if (vehicle) Object.assign(data, { vehicle_id: vehicle.id, vehicle_name: vehicle.name, company_id: vehicle.record?.company_id || undefined, company_name: vehicle.record?.company_name || undefined });
  return data;
}

// ----- done -----

// A service done on a day at an odometer reading. Without a reading the last
// km stays as it was, so a km service isn't counted from 0.
export function doneData({ date, odometer } = {}, schedule = {}) {
  const reading = Number(digits(odometer)) || 0;
  return {
    last_service_date: validDay(date) ? date : todayIso(),
    last_service_mileage: reading > 0 ? reading : Number(schedule.last_service_mileage) || 0,
    status: "upcoming",
  };
}

export function doneProblem({ date, odometer } = {}, { today = todayIso() } = {}) {
  if (!validDay(date)) return "Say the day it was done.";
  if (validDay(today) && date > today) return "That day is in the future.";
  const reading = digits(odometer);
  if (reading && !(wholeNumber(reading) && Number(reading) <= MAX_ODOMETER)) return "The odometer is a whole number of km.";
  return "";
}

// A job's services: the ones its title names are ticked to start with.
export const ticksForJob = (job, items = []) => items.filter((i) => sameName(i.schedule.service_type, job?.title)).map((i) => i.schedule.id);

// The odometer typed for a bus: a whole number, and a reading lower than the
// last one is worth a second look.
export function odometerProblem(text) {
  const reading = digits(text);
  if (!reading) return "Type the odometer reading.";
  if (!(wholeNumber(reading) && Number(reading) > 0 && Number(reading) <= MAX_ODOMETER)) return "The odometer is a whole number of km.";
  return "";
}
export const odometerWarning = (text, current) => (Number(digits(text)) > 0 && current > 0 && Number(digits(text)) < current
  ? `That's lower than the last reading (${km(current)}). Check it before saving.` : "");
export const odometerValue = (text) => Number(digits(text)) || 0;
