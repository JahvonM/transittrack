// The visitor ride-tracking page (src/pages/TrackRide.jsx): a link an admin
// sends a guest, app.mcsweenstransport.com/track#trip=<64-hex key>. The key
// stays in the # part, so it is never sent to any server in an address or
// referrer; the page passes it to the visitorTracking function itself.

const KEY = /^[a-f0-9]{64}$/;

export function readTrackToken(hash) {
  const value = new URLSearchParams(String(hash || "").replace(/^#/, "")).get("trip") || "";
  return KEY.test(value) ? value : null;
}

const CLOSED = new Set(["completed", "cancelled"]);
export const rideClosed = (view) => CLOSED.has(view?.status);

// How soon to ask again: often while the bus is coming, rarely before the
// ride, never once it is over. (The server allows 30 asks a minute per link,
// shared by everyone who has it open.)
export function nextCheckMs(view) {
  if (!view || rideClosed(view)) return null;
  return ["on_the_way", "arrived"].includes(view.status) ? 15_000 : 60_000;
}

// The headline and a short line underneath, for each state of the ride.
export function describeRide(view) {
  switch (view?.status) {
    case "scheduled":
      return { title: "Your ride is booked", note: "The bus's location appears here once your ride starts.", tone: "info" };
    case "on_the_way":
      return view.location_status === "live"
        ? { title: "Your bus is on the way", note: "The map moves as the bus does.", tone: "live" }
        : { title: "Your bus is on the way", note: view.location_status === "stale" ? "Waiting for the bus's latest position…" : "The bus's position isn't available right now.", tone: "info" };
    case "arrived":
      return { title: "Your bus has arrived", note: "Look out for it at your pickup point.", tone: "live" };
    case "completed":
      return { title: "This ride is complete", note: "Thank you for riding with McSween Transport.", tone: "done" };
    case "cancelled":
      return { title: "This ride was cancelled", note: "Contact McSween Transport if you still need a ride.", tone: "done" };
    default:
      return { title: "Your ride", note: "", tone: "info" };
  }
}
