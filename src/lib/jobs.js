// Jobs dispatch hands to a bus: airport runs, hotel tours, extra staff runs
// and transfers. They are stored as Trip records; trips made before job types
// existed read as a transfer.

export const JOB_TYPES = [
  { id: "airport_pickup", label: "Airport pickup", short: "Airport in", minutes: 90 },
  { id: "airport_dropoff", label: "Airport drop-off", short: "Airport out", minutes: 90 },
  { id: "hotel_tour", label: "Hotel tour", short: "Tour", minutes: 240 },
  { id: "staff_run", label: "Staff run", short: "Staff", minutes: 60 },
  { id: "transfer", label: "Transfer", short: "Transfer", minutes: 60 },
];
const BY_ID = Object.fromEntries(JOB_TYPES.map((t) => [t.id, t]));

export const jobTypeOf = (trip) => (BY_ID[trip?.job_type] ? trip.job_type : "transfer");
export const jobTypeLabel = (trip) => BY_ID[jobTypeOf(trip)].label;
export const isAirportJob = (type) => type === "airport_pickup" || type === "airport_dropoff";
export const defaultMinutes = (type) => (BY_ID[type] || BY_ID.transfer).minutes;

export const ACTIVE_JOB_STATUSES = ["scheduled", "on_the_way", "arrived"];
export const CURRENCIES = ["XCD", "USD"];
const CURRENCY_SIGN = { XCD: "EC$", USD: "US$" };

export function formatMoney(amount, currency = "XCD") {
  const n = Number(amount);
  if (amount === null || amount === undefined || amount === "" || !Number.isFinite(n)) return "";
  const sign = CURRENCY_SIGN[currency] || `${currency || ""} `;
  return `${sign}${n.toLocaleString("en", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// When a job starts and ends, in ms. A job without a finish time takes its
// type's usual length; a job without a start time has no window.
export function jobWindow(trip) {
  const start = Date.parse(trip?.scheduled_time);
  if (!Number.isFinite(start)) return null;
  const end = Date.parse(trip?.end_time);
  return { start, end: Number.isFinite(end) && end > start ? end : start + defaultMinutes(jobTypeOf(trip)) * 60_000 };
}

// Other jobs on the same bus whose times overlap this one.
export function findClashes(job, trips) {
  const mine = jobWindow(job);
  if (!mine || !job?.vehicle_id) return [];
  return (trips || []).filter((t) => {
    if (t.id && t.id === job.id) return false;
    if (t.vehicle_id !== job.vehicle_id || !ACTIVE_JOB_STATUSES.includes(t.status)) return false;
    const other = jobWindow(t);
    return !!other && other.start < mine.end && mine.start < other.end;
  });
}

// Signed at pickup / drop-off. Older trips kept a public link; newer ones keep
// a private file the tablet never sees, so the time is what tells.
export const pickupSigned = (t) => !!(t?.pickup_signed_at || t?.pickup_signature_url || t?.pickup_signature_uri);
export const dropoffSigned = (t) => !!(t?.dropoff_signed_at || t?.dropoff_signature_url || t?.dropoff_signature_uri);

// The parts of a job the driver acts on. A change to any of them is worth
// telling the driver about.
const DRIVER_FIELDS = ["job_type", "scheduled_time", "end_time", "pickup_name", "pickup_address", "dropoff_name", "dropoff_address",
  "flight_number", "flight_time", "guests", "luggage", "passenger_name", "passenger_phone", "client_name", "notes"];
export function jobVersion(trip) {
  const stops = (trip?.stops || []).map((s) => `${s?.name || ""}@${s?.lat ?? ""},${s?.lng ?? ""}`).join("|");
  return JSON.stringify([...DRIVER_FIELDS.map((k) => trip?.[k] ?? null), stops]);
}

// datetime-local input value (this computer's time) <-> ISO string.
const pad = (n) => String(n).padStart(2, "0");
export function toLocalInput(iso) {
  const d = iso ? new Date(iso) : null;
  if (!d || Number.isNaN(d.getTime())) return "";
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
export function fromLocalInput(value) {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}
export function addMinutesToInput(value, minutes) {
  const iso = fromLocalInput(value);
  return iso ? toLocalInput(new Date(Date.parse(iso) + minutes * 60_000).toISOString()) : "";
}

// On a signing tablet: the job waiting for the guests' signature. Pickup once
// the driver has started it, drop-off once the driver has arrived. signed:
// "<job id>:<pickup|dropoff>" already signed on this tablet.
export function waitingSignature(jobs, signed = new Set()) {
  const sorted = [...(jobs || [])].sort((a, b) => String(a.scheduled_time || "").localeCompare(String(b.scheduled_time || "")));
  for (const job of sorted) {
    if (job.status === "on_the_way" && !job.pickup_signed_at && !signed.has(`${job.id}:pickup`)) return { job, mode: "pickup" };
    if (job.status === "arrived" && !job.dropoff_signed_at && !signed.has(`${job.id}:dropoff`)) return { job, mode: "dropoff" };
  }
  return null;
}
