// Presentation rules for the passenger home. These only *describe* data the
// page already has (the approaching bus, its ETA, its last fix); they never
// change it and never invent schedule status such as "on time" or "late".
import { freshnessOf } from "@/components/system/status";
import { routeProgress } from "@/components/TripProgress";

/**
 * Which state the arrival area is in.
 *   choose      – no stop picked yet
 *   problem     – the bus has been taken out of service
 *   signal_lost – the bus stopped reporting its position (over 10 min)
 *   arriving    – a minute or less away
 *   live        – on its way, with an ETA when one is known
 *   not_started – your bus exists but isn't on a trip yet
 *   no_eta      – no bus serves this stop right now
 *
 * Emergencies are never shown to passengers (SOS is admin-only); callers pass
 * vehicles with that status already masked.
 */
export function passengerTripState({ stop, approaching, eta, myVehicle, now = Date.now() }) {
  if (!stop) return { kind: "choose", bus: null, fresh: null, mins: null };
  const bus = approaching?.v || myVehicle || null;
  const fresh = bus ? freshnessOf(bus.last_location_update, { now }) : null;
  if (bus && bus.in_service === false) return { kind: "problem", bus, fresh, mins: null };
  if (approaching) {
    const mins = eta?.mins != null && Number.isFinite(eta.mins) ? Math.max(0, eta.mins) : null;
    if (fresh?.state === "lost") return { kind: "signal_lost", bus, fresh, mins };
    if (mins != null && mins <= 1) return { kind: "arriving", bus, fresh, mins };
    return { kind: "live", bus, fresh, mins };
  }
  if (myVehicle) return { kind: "not_started", bus, fresh, mins: null };
  return { kind: "no_eta", bus: null, fresh: null, mins: null };
}

export const clock = (date) =>
  date ? new Date(date).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : "";

// "7:42" style arrival time, from minutes from now.
export const arrivalClock = (mins, now = Date.now()) => (mins == null ? "" : clock(now + mins * 60_000));

// Last seen, phrased for people: "6:55" today, "yesterday, 5:40 pm", or a date.
export function lastSeen(iso, now = Date.now()) {
  if (!iso) return "";
  const d = new Date(iso);
  const today = new Date(now);
  if (d.toDateString() === today.toDateString()) return clock(d);
  const y = new Date(now - 86_400_000);
  if (d.toDateString() === y.toDateString()) return `yesterday, ${clock(d)}`;
  return d.toLocaleDateString([], { day: "numeric", month: "short" });
}

export const sortStops = (stops) =>
  [...(stops || [])].sort((a, b) => (a.order ?? 0) - (b.order ?? 0)).filter((s) => s && s.name);

/**
 * Rows for the vertical route line. Earlier passed stops collapse to one,
 * and stops after yours collapse to the last stop.
 * placeBus: false keeps a bus that isn't on its trip yet above the first stop.
 *  -> { rows: [{ type: "stop"|"bus", ... }], hiddenBefore, hiddenAfter, stopsToGo }
 */
export function timelineRows({ route, bus, stopName, placeBus = true, showAllPassed = false }) {
  const stops = sortStops(route?.stops).filter((s) => s.lat != null && s.lng != null);
  if (stops.length < 2) return null;
  const moving = placeBus && bus && bus.current_lat != null;
  const progress = moving ? routeProgress(stops, bus.current_lat, bus.current_lng) : null;
  const nextIndex = progress ? progress.nextIndex : null;
  const mine = stops.findIndex((s) => s.name === stopName);
  const rows = [];
  if (bus && nextIndex == null) rows.push({ type: "bus", index: -1 });
  stops.forEach((s, i) => {
    if (nextIndex != null && i === nextIndex) rows.push({ type: "bus", index: i });
    const status = nextIndex == null ? "upcoming" : i < nextIndex ? "passed" : i === nextIndex ? "next" : "upcoming";
    rows.push({ type: "stop", index: i, stop: s, status, mine: i === mine, last: i === stops.length - 1 });
  });

  // Collapse passed stops (keep the most recent one).
  let hiddenBefore = 0;
  let out = rows;
  if (!showAllPassed && nextIndex != null && nextIndex > 1) {
    hiddenBefore = nextIndex - 1;
    out = out.filter((r) => !(r.type === "stop" && r.status === "passed" && r.index < nextIndex - 1));
  }
  // After your stop, only the last stop stays.
  let hiddenAfter = 0;
  if (mine >= 0) {
    const before = out.length;
    out = out.filter((r) => !(r.type === "stop" && r.index > mine && !r.last));
    hiddenAfter = before - out.length;
  }
  const stopsToGo = nextIndex != null && mine >= nextIndex ? mine - nextIndex + 1 : null;
  return { rows: out, hiddenBefore, hiddenAfter, stopsToGo, nextIndex, stops, total: stops.length };
}

// Short label for a bus: its number when the name has one ("Bus 12" -> "12").
export function busNumber(name) {
  const m = String(name || "").match(/(\d+)\s*$/) || String(name || "").match(/(\d+)/);
  return m ? m[1] : null;
}
