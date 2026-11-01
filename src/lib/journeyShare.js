import { TRANSIT_TIME_ZONE } from "@/lib/localTime";

// The shared-journey page (src/pages/ShareJourney.jsx): a link a passenger
// sends family, app.mcsweenstransport.com/share#j=<64-hex key>. The key stays
// after #, so it never reaches a server in an address or referrer.

const KEY = /^[a-f0-9]{64}$/;
export function readShareToken(hash) {
  const value = new URLSearchParams(String(hash || "").replace(/^#/, "")).get("j") || "";
  return KEY.test(value) ? value : null;
}

const clock = (iso) => {
  const t = Date.parse(iso || "");
  return Number.isFinite(t) ? new Date(t).toLocaleTimeString(undefined, { timeZone: TRANSIT_TIME_ZONE, hour: "numeric", minute: "2-digit" }) : "";
};

// Ask often while the passenger rides, now and then while they wait, never
// once it's over. (30 asks a minute per link are allowed, shared.)
export function nextShareCheckMs(view) {
  if (!view || view.state === "ended") return null;
  return view.state === "on_board" ? 15_000 : 45_000;
}

// The headline and a line underneath.
export function describeShare(view) {
  const who = view?.first_name || "Your passenger";
  const bus = view?.vehicle_name || "the bus";
  if (view?.state === "on_board") {
    const note = view.location_status === "live" ? `Heading to ${view.heading}. The map moves as the bus does.`
      : view.location_status === "stale" ? `Heading to ${view.heading}. Waiting for the bus's latest position…`
      : `Heading to ${view.heading}. The bus's position isn't available right now.`;
    return { title: `${who} is on ${bus}`, note: view.since ? `On board since ${clock(view.since)}. ${note}` : note, tone: "live" };
  }
  if (view?.state === "ended") return { title: `${who} got off ${bus}`, note: `At ${clock(view.ended_at)}. This shared journey has ended.`, tone: "done" };
  return { title: `${who} hasn't boarded yet`, note: `The bus shows here once they tap on to ${bus}.`, tone: "info" };
}
