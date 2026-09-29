// When driver-app inspections are due. Templates come from the driver
// session heartbeat (already filtered to this tablet's company and to
// templates sent to drivers); `recent` is this vehicle's latest inspections.

export const TRIGGERS = [
  { id: "start_of_day", label: "Start of the day", hint: "After the driver unlocks the tablet for the first time that day" },
  { id: "shift_start", label: "When a shift starts", hint: "Every time the driver taps Start shift" },
  { id: "shift_end", label: "When a shift ends", hint: "Every time the driver taps End shift" },
  { id: "on_demand", label: "Anytime", hint: "Only when the driver opens it from the Safety tab" },
];
export const TRIGGER_LABEL = Object.fromEntries(TRIGGERS.map((t) => [t.id, t.label]));
export const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const sameLocalDay = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

export function triggerOf(t) {
  return t?.driver_trigger || "start_of_day";
}

// Scheduled for today (day of week) and past its "from" time.
export function scheduledNow(t, now = new Date()) {
  const days = Array.isArray(t.driver_days) ? t.driver_days : [];
  if (days.length && !days.includes(now.getDay())) return false;
  if (t.driver_from_time && /^\d{1,2}:\d{2}$/.test(t.driver_from_time)) {
    const [h, m] = t.driver_from_time.split(":").map(Number);
    if (now.getHours() * 60 + now.getMinutes() < h * 60 + m) return false;
  }
  return true;
}

function lastDone(t, recent = [], localDone = {}) {
  let last = localDone[t.id] ? new Date(localDone[t.id]) : null;
  for (const r of recent) {
    if (r.template_id !== t.id || !r.created_date) continue;
    const d = new Date(r.created_date);
    if (!last || d > last) last = d;
  }
  return last;
}

export function doneToday(t, recent, localDone, now = new Date()) {
  const last = lastDone(t, recent, localDone);
  return !!last && sameLocalDay(last, now);
}

// "Send to drivers now": due until finished after it was sent (a send older
// than a week lapses so a forgotten one doesn't nag forever).
export function sentAndPending(t, recent, localDone, now = new Date()) {
  if (!t.driver_sent_at) return false;
  const sent = new Date(t.driver_sent_at);
  if (now - sent > 7 * 86400000) return false;
  const last = lastDone(t, recent, localDone);
  return !last || last < sent;
}

// Recently done (e.g. a shift-start check done 20 minutes ago shouldn't come
// straight back if the driver ends and restarts the shift).
export function doneWithin(t, recent, localDone, minutes, now = new Date()) {
  const last = lastDone(t, recent, localDone);
  return !!last && now - last < minutes * 60000;
}

// Inspections that should run at a given moment of the driver's day.
export function dueFor(moment, templates = [], recent = [], localDone = {}, now = new Date()) {
  return templates.filter((t) => {
    if (triggerOf(t) !== moment || !scheduledNow(t, now)) return false;
    if (moment === "start_of_day") return !doneToday(t, recent, localDone, now);
    return !doneWithin(t, recent, localDone, 60, now);
  });
}

// Everything the driver should be nudged about right now on the home screen.
export function dueNow(templates = [], recent = [], localDone = {}, now = new Date()) {
  const sent = templates.filter((t) => sentAndPending(t, recent, localDone, now));
  const daily = dueFor("start_of_day", templates, recent, localDone, now);
  const seen = new Set();
  return [...sent, ...daily].filter((t) => (seen.has(t.id) ? false : seen.add(t.id)));
}

export function statusFor(t, recent, localDone, now = new Date()) {
  if (sentAndPending(t, recent, localDone, now)) return "sent";
  if (doneToday(t, recent, localDone, now)) return "done";
  if (triggerOf(t) === "start_of_day" && scheduledNow(t, now)) return "due";
  return "available";
}
