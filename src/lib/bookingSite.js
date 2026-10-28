// The public website (mcsweenstransport.com): which address shows it, the
// rides it offers, and the booking form's checks. The bookingRequest function
// checks everything again; these give the visitor an answer before sending.
import { JOB_TYPES } from "@/lib/jobs";

// The website's own addresses. Anywhere else (app.mcsweenstransport.com, the
// Base44 copy, the installed apps) the app opens, and the site is at /site.
export const SITE_HOSTS = ["mcsweenstransport.com", "www.mcsweenstransport.com"];
export const APP_ORIGIN = "https://app.mcsweenstransport.com";
export const isSiteHost = (host) => SITE_HOSTS.includes(String(host || "").toLowerCase());
// Pages the website has. Any other address on the website's host belongs to
// the app (an old bookmark to /login, say), so it goes there.
export const SITE_PAGES = ["/", "/book", "/track", "/privacy", "/terms"];
export const sitePage = (path) => {
  const p = String(path || "/").replace(/\/+$/, "") || "/";
  return SITE_PAGES.includes(p) ? p : null;
};

// What the company offers, in the words the website uses. `id` is the job
// type a request becomes in Admin → Jobs.
export const SITE_SERVICES = [
  {
    id: "airport_pickup", name: "Airport pickup",
    text: "We meet you at Maurice Bishop International Airport and take you to your hotel, villa or home. Add your flight number so the driver knows when you land.",
  },
  {
    id: "airport_dropoff", name: "Airport drop-off",
    text: "We collect you from where you are staying and take you to the airport in good time for your flight.",
  },
  {
    id: "transfer", name: "Transfers",
    text: "From one place to another anywhere on the island: hotels, villas, restaurants and events.",
  },
  {
    id: "hotel_tour", name: "Island tours",
    text: "A bus and a driver for your group for a day out around Grenada. Tell us what you would like to see.",
  },
  {
    id: "staff_run", name: "Staff transport",
    text: "Regular runs for hotels and businesses that need their staff brought to work and taken home again.",
  },
];
export const AIRPORT_NAME = "Maurice Bishop International Airport";
export const isAirportService = (id) => id === "airport_pickup" || id === "airport_dropoff";

// Grenada keeps the same clock all year (UTC−4, no summer time), so a time
// typed on the form is read as Grenada time wherever the visitor is.
const GRENADA_OFFSET = "-04:00";
const pad = (n) => String(n).padStart(2, "0");
export function grenadaInputToIso(value) {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(String(value || ""))) return null;
  const t = Date.parse(`${value}:00${GRENADA_OFFSET}`);
  return Number.isFinite(t) ? new Date(t).toISOString() : null;
}
// The form value (YYYY-MM-DDTHH:mm, Grenada time) for a moment.
export function grenadaInputFor(ms) {
  const d = new Date(ms - 4 * 3600_000);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}T${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}

// Choosing an airport ride puts the airport on the right side (swapping the
// two places when someone switches between pickup and drop-off).
export function withService(form, service) {
  const next = { ...form, service };
  const isAirport = (v) => v === AIRPORT_NAME;
  if (service === "airport_pickup") {
    if (isAirport(next.dropoff)) [next.pickup, next.dropoff] = [AIRPORT_NAME, next.pickup];
    else if (!next.pickup) next.pickup = AIRPORT_NAME;
  } else if (service === "airport_dropoff") {
    if (isAirport(next.pickup)) [next.pickup, next.dropoff] = [next.dropoff, AIRPORT_NAME];
    else if (!next.dropoff) next.dropoff = AIRPORT_NAME;
  } else {
    if (isAirport(next.pickup)) next.pickup = "";
    if (isAirport(next.dropoff)) next.dropoff = "";
  }
  if (!isAirportService(service)) next.flight_number = "";
  return next;
}

const EMAIL = /^[^\s@<>"']{1,64}@[^\s@<>"']{1,190}\.[a-z]{2,24}$/i;
const PHONE = /^\+?[\d\s().-]{6,24}$/;
const FLIGHT = /^[A-Z0-9][A-Z0-9 -]{1,11}$/i;
const trim = (v) => String(v ?? "").trim();

// Problems with the form, by field, in words the visitor can act on. Empty
// when it is ready to send.
export function bookingProblems(form, now = Date.now()) {
  const out = {};
  if (!SITE_SERVICES.some((s) => s.id === form.service)) out.service = "Choose the kind of ride.";
  const at = Date.parse(grenadaInputToIso(form.when) || "");
  if (!Number.isFinite(at)) out.when = "Choose the date and time.";
  else if (at < now + 60 * 60_000) out.when = "Choose a time at least an hour from now. For a ride sooner than that, message us on WhatsApp.";
  else if (at > now + 366 * 86400_000) out.when = "Choose a date within the next year.";
  if (trim(form.pickup).length < 2) out.pickup = "Say where to pick you up.";
  if (trim(form.dropoff).length < 2) out.dropoff = "Say where you are going.";
  const guests = Number(form.guests);
  if (!Number.isInteger(guests) || guests < 1 || guests > 60) out.guests = "From 1 to 60 passengers.";
  const bags = form.luggage === "" ? 0 : Number(form.luggage);
  if (!Number.isInteger(bags) || bags < 0 || bags > 100) out.luggage = "From 0 to 100 bags.";
  if (trim(form.flight_number) && !FLIGHT.test(trim(form.flight_number))) out.flight_number = "Check the flight number, for example AA 1234.";
  if (trim(form.name).length < 2) out.name = "Add your name.";
  if (!PHONE.test(trim(form.phone))) out.phone = "Add a phone number with its country code, for example +1 473 555 0123.";
  if (!EMAIL.test(trim(form.email))) out.email = "Check your email address.";
  if (trim(form.notes).length > 1000) out.notes = "Keep the note under 1000 characters.";
  return out;
}

// What the form sends to bookingRequest.
export function bookingBody(form, startedAt, now = Date.now()) {
  const airport = isAirportService(form.service);
  return {
    action: "request",
    service: form.service,
    requested_time: grenadaInputToIso(form.when),
    pickup: trim(form.pickup),
    dropoff: trim(form.dropoff),
    guests: Number(form.guests),
    luggage: form.luggage === "" ? 0 : Number(form.luggage),
    flight_number: airport ? trim(form.flight_number).toUpperCase() : "",
    name: trim(form.name),
    phone: trim(form.phone),
    email: trim(form.email),
    notes: trim(form.notes),
    website: form.website || "",
    form_ms: Math.max(0, now - startedAt),
  };
}

// A new job filled in from a ride request (Admin → Jobs → Requests): asked
// for on the website, or by a company in its portal. A company's job is
// shared back with it.
export function draftFromRequest(r) {
  const type = JOB_TYPES.some((t) => t.id === r.service) ? r.service : "transfer";
  const text = (name) => (name ? { name, address: "", lat: null, lng: null } : null);
  const from = r.company_id ? `Asked for by ${r.company_name || "the company"} in their portal` : r.email ? `Booked on the website by ${r.email}` : "";
  const note = [r.notes, from].filter(Boolean).join("\n");
  return {
    job_type: type, scheduled_time: r.requested_time, pickup: text(r.pickup), dropoff: text(r.dropoff),
    flight_number: r.flight_number || "", guests: r.guests ?? "", luggage: r.luggage ?? "",
    passenger_name: r.name || "", passenger_phone: r.phone || "", notes: note,
    shared_with_company: !!r.company_id,
  };
}
