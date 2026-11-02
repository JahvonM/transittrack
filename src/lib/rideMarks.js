import { TRANSIT_TIME_ZONE } from "@/lib/localTime";

// What a driver can mark about a passenger's ride (bus tablet and driver
// phone), and how a ride reads. A ride comes from the passenger's own taps and
// the driver's marks, never from GPS.

const hhmm = (iso) => (iso ? new Date(iso).toLocaleTimeString([], { timeZone: TRANSIT_TIME_ZONE, hour: "numeric", minute: "2-digit" }) : "");

export const MARKS = {
  no_show: { label: "Didn't show", confirm: (n) => `Mark ${n} as not at the pickup?`, done: (n) => `${n} marked as a no-show` },
  undo_no_show: { label: "Undo no-show", confirm: null, done: (n) => `No-show taken back for ${n}` },
  got_on: { label: "Got on (no tap)", confirm: (n) => `Record ${n} getting on without a tap?`, done: (n) => `${n} recorded on board` },
  got_off: { label: "Got off (no tap)", confirm: (n) => `Record ${n} getting off without a tap?`, done: (n) => `${n} recorded as got off` },
};

// The marks that fit where the ride is now.
export const marksFor = (state) => (state === "on_board" ? ["got_off"] : state === "no_show" ? ["undo_no_show"] : state === "got_off" ? ["got_on"] : ["got_on", "no_show"]);

export const markNote = (kind) => (kind === "no_show" ? "The office sees this. You can undo it." : "The office sees this, marked as recorded by the driver.");

// Where this passenger's ride is today, in words.
export function rideText(ride) {
  if (!ride) return "";
  const by = ride.by_driver ? " · marked by driver" : "";
  if (ride.state === "on_board") return `On board since ${hhmm(ride.at)}${by}`;
  if (ride.state === "got_off") return `Got off at ${hhmm(ride.at)}${by}`;
  if (ride.state === "no_show") return "Didn't show at the pickup";
  return "";
}

// Text colour for a ride line.
export const rideTone = (ride) => (ride?.state === "on_board" ? "text-success" : ride?.state === "no_show" ? "text-warning" : "text-muted-foreground");
