// The company portal: what a company (a hotel whose staff and guests ride the
// buses) sees. The server decides where a bus may be shown: only while a
// driver's shift is open on it, or while a job shared with the company is on
// the way. It marks each bus with `location_shared` ('shift', 'job' or '').
import { SITE_SERVICES, bookingProblems, grenadaInputToIso, isAirportService } from "@/lib/bookingSite";
import { busStatusLine } from "@/components/passenger/passengerState";

export const JOB_LIVE = ["on_the_way", "arrived"];
const CLOSED = ["completed", "cancelled"];

export const busSharedBy = (v) => (v?.location_shared === "shift" || v?.location_shared === "job" ? v.location_shared : "");
export const busOnMap = (v) => !!busSharedBy(v) && v?.current_lat != null && v?.current_lng != null;

// Why a bus is on the map, or why it isn't, in a few words.
export function busSharingLine(v) {
  const why = busSharedBy(v);
  if (why === "job") return "On the way for your job";
  if (why === "shift") return "On shift";
  return "Hidden until a shift or your job starts";
}

// The line under a bus in the live map's list.
export function busPlace(v, route, now = Date.now()) {
  if (!busSharedBy(v)) return busSharingLine(v);
  return `${busSharingLine(v)} · ${busStatusLine(v, route, now)}`;
}

const when = (t) => Date.parse(t?.scheduled_time || "") || 0;

// The company's jobs: on the way now, coming up, and done.
export function jobGroups(trips = [], now = Date.now()) {
  const live = trips.filter((t) => JOB_LIVE.includes(t.status)).sort((a, b) => when(a) - when(b));
  const upcoming = trips.filter((t) => !JOB_LIVE.includes(t.status) && !CLOSED.includes(t.status)).sort((a, b) => when(a) - when(b));
  const done = trips.filter((t) => CLOSED.includes(t.status)).sort((a, b) => when(b) - when(a)).slice(0, 20);
  const today = new Date(now).toDateString();
  const todayCount = trips.filter((t) => t.status !== "cancelled" && t.scheduled_time && new Date(t.scheduled_time).toDateString() === today).length;
  return { live, upcoming, done, todayCount };
}

export const REQUEST_STATUS = {
  new: { label: "Waiting for McSween", tone: "warning" },
  confirmed: { label: "Confirmed", tone: "success" },
  declined: { label: "Declined", tone: "danger" },
};

export const blankRequest = (phone = "") => ({
  service: "airport_pickup", when: "", pickup: "", dropoff: "", guests: "1", luggage: "", flight_number: "", name: "", phone, notes: "",
});

// The website form's checks, in the company's words. The account's own email
// gets the replies, so there is no email to check here.
export function companyRequestProblems(form, now = Date.now()) {
  const out = bookingProblems({ ...form, email: "portal@mcsweenstransport.com" }, now);
  delete out.email;
  if (out.name) out.name = "Add the guest's name.";
  if (out.pickup) out.pickup = "Say where to pick up.";
  if (out.dropoff) out.dropoff = "Say where to go.";
  if (out.phone) out.phone = "Add a phone number we can call about this job, with its country code.";
  if (out.when && /WhatsApp/.test(out.when)) out.when = "Choose a time at least an hour from now. For anything sooner, call us.";
  return out;
}

export function companyRequestBody(form) {
  const trim = (v) => String(v ?? "").trim();
  return {
    action: "company_request",
    service: form.service,
    requested_time: grenadaInputToIso(form.when),
    pickup: trim(form.pickup),
    dropoff: trim(form.dropoff),
    guests: Number(form.guests),
    luggage: form.luggage === "" ? 0 : Number(form.luggage),
    flight_number: isAirportService(form.service) ? trim(form.flight_number).toUpperCase() : "",
    name: trim(form.name),
    phone: trim(form.phone),
    notes: trim(form.notes),
  };
}

export const serviceName = (id) => SITE_SERVICES.find((s) => s.id === id)?.name || "Ride";
