import { haversineKm } from "@/lib/geo";

// The guest's tracking page: minutes until their ride reaches them (or, once
// they're on board, their drop-off). The server sends the next stop only while
// the ride's live position is shown (visitorTracking's `eta`).

// Driving time from the map service, asked again at most once a minute (the
// page itself checks every 15 seconds). In between, and if the map service
// can't answer, the straight-line distance with room for bends at town speed.
export const ROAD_REFRESH_MS = 60_000;
const BENDS = 1.35, TOWN_KMH = 30;
// Longer than this is a bad position or a bad stop, not a real estimate.
const MAX_MINUTES = 180;

export function roughMinutes(from, to) {
  if (![from?.lat, from?.lng, to?.lat, to?.lng].every(Number.isFinite)) return null;
  return ((haversineKm(from.lat, from.lng, to.lat, to.lng) * BENDS) / TOWN_KMH) * 60;
}

export function etaText(minutes) {
  if (!Number.isFinite(minutes) || minutes < 0 || minutes > MAX_MINUTES) return "";
  const m = Math.round(minutes);
  if (m < 1) return "Less than a minute away";
  if (m === 1) return "About 1 minute away";
  if (m < 60) return `About ${m} minutes away`;
  const h = Math.floor(m / 60), rest = m % 60;
  return `About ${h} hour${h > 1 ? "s" : ""}${rest ? ` ${rest} min` : ""} away`;
}
