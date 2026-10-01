// The TransitTrack Helper Android app on kiosk/driver tablets puts its status
// into the page every minute through FreeKiosk (window.__ttHelperHealth):
// helper version, battery %, charging, parked, card reader, last card, USB GPS.
// Heartbeats pass it on so admins see it per tablet in Admin → Kiosk Tablets.
const MAX_AGE_MS = 5 * 60 * 1000;

export function helperHealthPayload() {
  try {
    const h = typeof window !== "undefined" ? window.__ttHelperHealth : null;
    if (!h || typeof h !== "object") return {};
    if (typeof h.at === "number" && Date.now() - h.at > MAX_AGE_MS) return {};
    const { at, ...report } = h;
    return { helper_health: report };
  } catch {
    return {};
  }
}
