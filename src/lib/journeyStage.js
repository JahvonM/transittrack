import { RIDE_MAX_MS, tapTime } from "../../base44/shared/boardingEvents.ts";
import { haversineKm } from "./geo";

// The passenger's own journey, for the Home screen. Boarding and getting off
// come only from their own taps (card, QR or code on the bus), never from
// where the bus is: GPS only says how close the bus is.
//
//   scheduled → approaching → at_pickup → boarded → onboard →
//   near_destination → exited → completed
//
// Plus the cases where there is no journey to show: choose (no pickup yet),
// unassigned (no bus), not_travelling (they said so), out_of_service.

export const STAGES = ["scheduled", "approaching", "at_pickup", "boarded", "onboard", "near_destination", "exited", "completed"];

const BOARDED_MS = 3 * 60_000; // "Boarding confirmed" for a few minutes, then "On board"
const EXITED_MS = 10 * 60_000; // "Exit confirmed", then "Journey complete"
const COMPLETED_MS = 45 * 60_000; // after that, the next ride's state shows
const NEAR_DESTINATION_KM = 1.5;

const sorted = (taps) => [...(taps || [])].map((t) => ({ ...t, at: t.at ?? t.boarded_at })).filter((t) => Number.isFinite(tapTime(t))).sort((a, b) => tapTime(a) - tapTime(b));

/**
 * @param tripKind     passengerTripState kind (choose, unassigned, problem, signal_lost, arriving, live, not_started, no_eta, departed)
 * @param arrivalKind  pickupArrival kind (on_way, nearby, at_stop, arrived) or null
 * @param taps         this passenger's own taps today [{ id, status, boarded_at }]
 * @param notTravelling the passenger said they are not travelling today
 * @param destinationKm straight-line km from the bus (fresh GPS only) to their destination, or null
 */
export function journeyStage({ tripKind, arrivalKind = null, taps = [], notTravelling = false, destinationKm = null, now = Date.now() }) {
  const list = sorted(taps).filter((t) => tapTime(t) <= now + 60_000);
  const last = list.at(-1) || null;
  const lastAt = last ? tapTime(last) : null;
  const boardTap = last?.status === "boarded" ? last : [...list].reverse().find((t) => t.status === "boarded" && (!lastAt || tapTime(t) <= lastAt)) || null;

  if (last && last.status === "boarded" && now - lastAt < RIDE_MAX_MS) {
    const base = { tap: last, since: lastAt, rideId: last.id || String(lastAt) };
    if (destinationKm != null && destinationKm <= NEAR_DESTINATION_KM) return { stage: "near_destination", ...base };
    return { stage: now - lastAt < BOARDED_MS ? "boarded" : "onboard", ...base };
  }
  if (last && last.status === "off_board" && now - lastAt < COMPLETED_MS) {
    const rideId = (boardTap?.id || "") + ":" + (last.id || String(lastAt));
    return { stage: now - lastAt < EXITED_MS ? "exited" : "completed", tap: last, since: lastAt, boardedAt: boardTap ? tapTime(boardTap) : null, rideId };
  }
  // The ride before this one, so the next pickup alert is its own.
  const afterRide = last ? last.id || String(lastAt) : "start";
  if (notTravelling) return { stage: "not_travelling", afterRide };
  if (tripKind === "choose") return { stage: "choose", afterRide };
  if (tripKind === "unassigned") return { stage: "unassigned", afterRide };
  if (tripKind === "problem") return { stage: "out_of_service", afterRide };
  if (["at_stop", "arrived"].includes(arrivalKind)) return { stage: "at_pickup", afterRide };
  if (["live", "arriving", "signal_lost", "departed"].includes(tripKind)) return { stage: "approaching", afterRide };
  return { stage: "scheduled", afterRide };
}

// How much to trust an arrival time, said with it.
//   live        fresh position, time from the road or this bus's past trips
//   approximate fresh position, rough time (straight line or no road yet)
//   scheduled   no position, but a booked time
//   last_known  the position is old: show where it was, not a countdown
//   unavailable nothing to go on
export function etaQuality({ eta, fresh, tracking, scheduledTime = null }) {
  if (tracking && fresh === false) return "last_known";
  if (tracking && fresh && eta && Number.isFinite(eta.mins)) return eta.isDriving || eta.isLearned ? "live" : "approximate";
  if (scheduledTime) return "scheduled";
  return "unavailable";
}
export const ETA_QUALITY_TEXT = {
  live: "Live estimate",
  approximate: "Approximate",
  scheduled: "Scheduled time",
  last_known: "Last known position",
  unavailable: "Location unavailable",
};

// Alert keys: one alert per passenger, per ride (or the wait for the next
// ride), per event. Two rides on the same bus in a day each get their own.
export function alertKey(userId, stageInfo, event, { busId = "", date = "", direction = "" } = {}) {
  const ride = stageInfo?.rideId ? `ride:${stageInfo.rideId}` : `wait:${date}:${direction}:${busId}:after:${stageInfo?.afterRide || "start"}`;
  return `tt_alert_v2:${userId || "me"}:${ride}:${event}`;
}

// Once per key on this phone (and once per visit if storage is blocked).
const seenThisVisit = new Set();
export function firstTime(key) {
  if (seenThisVisit.has(key)) return false;
  seenThisVisit.add(key);
  try {
    if (localStorage.getItem(key)) return false;
    localStorage.setItem(key, String(Date.now()));
    // Keep the store small: drop alert keys older than two days.
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i);
      if (k?.startsWith("tt_alert_v2:") && Date.now() - Number(localStorage.getItem(k)) > 2 * 86_400_000) localStorage.removeItem(k);
    }
  } catch { /* storage blocked: once per visit */ }
  return true;
}

// Stops left until the passenger's destination, counted on the bus's route
// (just a number: other riders' stops are never named). Null when the
// destination isn't one of the route's stops.
export function stopsLeftTo(stops, nextIndex, destination) {
  if (nextIndex == null || destination?.lat == null || !stops?.length) return null;
  let best = -1, bestKm = Infinity;
  stops.forEach((s, i) => {
    const km = haversineKm(Number(s.lat), Number(s.lng), Number(destination.lat), Number(destination.lng));
    if (km < bestKm) { bestKm = km; best = i; }
  });
  if (best < 0 || bestKm > 0.4 || best < nextIndex) return null;
  return best - nextIndex + 1;
}
