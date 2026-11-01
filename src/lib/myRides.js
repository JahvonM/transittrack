// A passenger's own rides, built from their boarding and exit events (taps
// on the bus tablet). Each event: { id, status: "boarded"|"off_board",
// boarded_at (when it happened), vehicle_name }.
//
// A ride is a boarding followed by the next exit on the same bus. Events are
// ordered by when they happened, not when they reached the server, so taps
// saved offline land in the right place. A second boarding before any exit
// is the same ride (a repeated tap), not a new one.

const SAME_RIDE_MS = 6 * 3600_000; // an exit more than 6 h after boarding isn't the same ride

const at = (e) => Date.parse(e?.boarded_at || "") || 0;

export function groupRides(events = []) {
  const sorted = [...events].filter((e) => at(e) > 0).sort((a, b) => at(a) - at(b) || String(a.id).localeCompare(String(b.id)));
  const rides = [];
  const open = new Map(); // bus -> ride still waiting for its exit
  for (const e of sorted) {
    const bus = e.vehicle_name || "Bus";
    const current = open.get(bus);
    if (e.status === "boarded") {
      if (current && at(e) - current.boardedAt < SAME_RIDE_MS) { current.repeats += 1; continue; }
      const ride = { id: e.id, bus, boardedAt: at(e), exitedAt: null, repeats: 0, state: "open" };
      rides.push(ride);
      open.set(bus, ride);
    } else if (e.status === "off_board") {
      if (current && at(e) - current.boardedAt < SAME_RIDE_MS) {
        current.exitedAt = at(e);
        current.state = "completed";
        open.delete(bus);
      } else {
        // Exit with no boarding recorded (a missed tap at the door).
        rides.push({ id: e.id, bus, boardedAt: null, exitedAt: at(e), repeats: 0, state: "exit_only" });
      }
    }
  }
  // A boarding with no exit that's older than a ride can last: the exit tap was missed.
  const now = Date.now();
  for (const ride of rides) if (ride.state === "open" && now - ride.boardedAt >= SAME_RIDE_MS) ride.state = "no_exit";
  return rides.sort((a, b) => (b.boardedAt || b.exitedAt) - (a.boardedAt || a.exitedAt));
}

export const RIDE_STATE_TEXT = {
  open: "On board now",
  completed: "Completed",
  no_exit: "No exit recorded",
  exit_only: "Exit only (no boarding recorded)",
};

// Today's regular rides for a passenger with assigned transport: to work and
// home again. Nothing is booked: they follow the company schedule unless the
// passenger says they're not travelling or running late.
export function todayRides({ bus, pickup, destination, returning, skip, late, lateUntil }) {
  const state = skip ? "not_travelling" : late ? "running_late" : "scheduled";
  const base = { bus: bus?.name || "", state, lateUntil: late ? lateUntil || null : null };
  return [
    { key: "to_work", label: "To work", from: pickup || "", to: destination || "", current: !returning, ...base },
    { key: "return", label: "Return", from: destination || "", to: pickup || "", current: !!returning, ...base, state: skip ? "not_travelling" : "scheduled", lateUntil: null },
  ];
}

export const TODAY_STATE_TEXT = {
  scheduled: "Scheduled",
  not_travelling: "Not travelling",
  running_late: "Running late",
};

// "Coming up" and "Cancelled" on My rides, from the passenger's booked rides
// and their own requests. Days are the transit day (YYYY-MM-DD).
const DAY_MS = 86_400_000;
const isoDay = (ms) => new Date(ms).toLocaleDateString("en-CA", { timeZone: "America/Grenada" });
const tripDay = (t) => (t?.scheduled_time ? isoDay(Date.parse(t.scheduled_time)) : "");
const route = (t) => [t.pickup_name, t.dropoff_name].filter(Boolean).join(" to ") || "Booked ride";

export function upcomingAndCancelled({ trips = [], cancelledTrips = [], cases = [], now = Date.now() } = {}) {
  const today = isoDay(now);
  const monthAgo = isoDay(now - 30 * DAY_MS);
  const upcoming = [];
  const cancelled = [];
  for (const t of trips) {
    if (!t || t.status === "cancelled" || t.status === "completed") continue;
    if (tripDay(t) && tripDay(t) < today) continue;
    upcoming.push({ key: "trip:" + t.id, at: t.scheduled_time || "", day: tripDay(t), title: route(t), note: t.status === "scheduled" ? "Booked" : "Booked · " + String(t.status || "").replace(/_/g, " "), kind: "trip" });
  }
  for (const c of cases) {
    if (!c || !c.requested_date) continue;
    if (["time_change", "pickup_change"].includes(c.kind) && c.status === "confirmed" && c.requested_date >= today) {
      const what = c.kind === "time_change" ? `New time${c.requested_time ? " " + c.requested_time : ""}` : `New pickup${c.requested_pickup ? ": " + c.requested_pickup : ""}`;
      upcoming.push({ key: "case:" + c.id, at: c.requested_date, day: c.requested_date, title: what, note: "Confirmed", ref: c.reference, kind: "change" });
    }
    if (c.kind === "cancel_ride" && c.requested_date >= monthAgo) {
      if (c.status === "confirmed") cancelled.push({ key: "case:" + c.id, at: c.requested_date, day: c.requested_date, title: "Ride cancelled at your request", note: "Cancelled", ref: c.reference, kind: "cancelled" });
      else if (["requested", "pending"].includes(c.status)) cancelled.push({ key: "case:" + c.id, at: c.requested_date, day: c.requested_date, title: "Cancellation asked for", note: "Waiting", ref: c.reference, kind: "asked" });
      else if (c.status === "rejected") cancelled.push({ key: "case:" + c.id, at: c.requested_date, day: c.requested_date, title: "Cancellation not possible: your ride stays booked", note: "Not possible", ref: c.reference, kind: "refused" });
    }
  }
  for (const t of cancelledTrips) {
    if (!t || t.status !== "cancelled") continue;
    if (tripDay(t) && tripDay(t) < monthAgo) continue;
    cancelled.push({ key: "trip:" + t.id, at: t.scheduled_time || "", day: tripDay(t), title: route(t), note: "Cancelled", kind: "cancelled" });
  }
  const byTime = (a, b) => String(a.at).localeCompare(String(b.at));
  return { upcoming: upcoming.sort(byTime), cancelled: cancelled.sort((a, b) => byTime(b, a)) };
}
