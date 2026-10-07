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

// Whether the helper can still reach this screen. The helper writes
// __ttHelperHealth every minute through FreeKiosk's REST API, the same way it
// delivers card taps, so if those reports stop, card taps aren't getting
// through either (usually the REST API key in FreeKiosk and the helper no
// longer match, or FreeKiosk's REST API is off).
//   "ok"   - a report arrived recently (or the page only just opened)
//   "lost" - this tablet has a helper, but nothing has arrived for 3 minutes
//   "none" - no helper has ever announced itself on this tablet
const LINK_GRACE_MS = 3 * 60 * 1000;
const PAGE_OPENED_AT = Date.now();

export function helperLink(now = Date.now()) {
  try {
    const h = typeof window !== "undefined" ? window.__ttHelperHealth : null;
    if (h && typeof h.at === "number" && now - h.at <= LINK_GRACE_MS) return "ok";
    if (localStorage.getItem("tt_badge_reader") !== "1") return "none";
    return now - PAGE_OPENED_AT < LINK_GRACE_MS ? "ok" : "lost";
  } catch {
    return "none";
  }
}

// Admin side: the tablet's app keeps checking in but its helper's reports
// stopped, so the helper can't reach the screen.
export function helperLinkLost(device, now = Date.now()) {
  const fresh = (iso) => !!iso && now - Date.parse(iso) < 10 * 60 * 1000;
  const app = device?.app_health;
  const hasHelper = !!device?.helper_health || app?.reader === "usb_reader";
  return hasHelper && fresh(app?.reported_at) && !fresh(device?.helper_health?.reported_at);
}

// "GPS problem" tapped on a driver tablet: ask the TransitTrack Helper to
// look for the USB GPS / card reader again now (Helper 1.8+, which listens on
// 127.0.0.1:8765 on every tablet; older helpers ignore it), and tell this
// page's location readers to start again so a GPS that has only just
// appeared is picked up.
export const GPS_RETRY_EVENT = "tt-gps-retry";
export function retryGps() {
  const url = `http://127.0.0.1:8765/rescan-usb?t=${Date.now()}`;
  try {
    fetch(url, { mode: "no-cors", cache: "no-store" }).catch(() => {});
  } catch { /* no helper on this device */ }
  try { window.dispatchEvent(new Event(GPS_RETRY_EVENT)); } catch { /* ignore */ }
}
