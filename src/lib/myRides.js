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
