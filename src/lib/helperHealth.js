// The TransitTrack Helper Android app on kiosk/driver tablets puts its status
// into the page every minute through FreeKiosk (window.__ttHelperHealth):
// helper version, battery %, charging, parked, card reader, last card, USB GPS.
// Heartbeats pass it on so admins see it per tablet in Admin → Kiosk Tablets.
const MAX_AGE_MS = 5 * 60 * 1000;

export function helperHealthPayload() {
  try {
    const legacy = typeof window !== "undefined" ? window.__ttHelperHealth : null;
    const native = typeof window !== "undefined" ? window.__ttNativeHealth : null;
    const fresh = value => value && typeof value === "object" && typeof value.at === "number" && Date.now() - value.at <= MAX_AGE_MS && value.at <= Date.now() + 5000;
    const h = legacy && (typeof legacy.at !== "number" || fresh(legacy)) ? legacy : null;
    const n = fresh(native) && native.available ? native : null;
    if (!h && !n && !(typeof window !== "undefined" && fresh(window.__ttNativeNetwork) && window.__ttNativeNetwork.enabled)) return {};
    const { at, ...report } = h || {};
    if (n) {
      report.version = report.version || "native-0.2";
      report.native_version = "0.2"; // bridge capability, not installed APK version
      report.native_app_version = n.appVersion;
      report.native_app_code = n.appVersionCode;
      report.native_app_package = n.appPackage;
      report.recordings_available = n.recordingsAvailable === true;
      report.support_available = n.supportAvailable === true;
      if(n.supportTransport === "webrtc") report.support_transport = "webrtc";
      report.native_update_available = n.updateAvailable === true;
      if (Number.isFinite(n.battery)) report.battery = n.battery;
      if (typeof n.charging === "boolean") report.charging = n.charging;
      report.battery_temperature = n.batteryTemperature;
      report.free_storage_mb = n.freeStorageMb;
      report.model = n.model;
      report.android_version = n.androidVersion;
      report.network_type = n.network;
      report.usb_devices = n.usbDevices;
      if (n.gps?.enabled) report.gps = n.gps.status;
      if (n.reader?.enabled) {
        report.reader = n.reader.status;
        if (n.reader.lastTapAt) report.last_card_at = new Date(n.reader.lastTapAt).toISOString();
      }
    }
    const direct = typeof window !== "undefined" ? window.__ttNativeNetwork : null;
    const network = fresh(direct) ? direct : n?.networkControl;
    if (network?.available) { report.network_available = true; report.network_native = network.enabled === true; }
    if (network?.enabled) {
      report.network_native = true;
      report.hotspot = network.hotspot;
      report.hotspot_always = network.hotspot_always === true;
      const w = network.wifi || {};
      report.wifi = {
        enabled: w.enabled === true, ssid: typeof w.ssid === "string" ? w.ssid.slice(0, 32) : "",
        bars: w.bars, scanned_at: w.scanned_at,
        networks: Array.isArray(w.networks) ? w.networks.slice(0, 25).map(x => ({ ssid: x.ssid, bars: x.bars, lock: x.lock })) : [],
        ...(w.join && typeof w.join === "object" ? { join: { id: w.join.id, ssid: w.join.ssid, state: w.join.state, message: w.join.message, at: w.join.at } } : {}),
      };
    }
    const management = typeof window !== "undefined" ? window.__ttNativeControl : null;
    if (fresh(management) && management.available === true) {
      report.management_available = true;
      report.management_owner = management.deviceOwner === true;
      report.management_locked = management.locked === true;
    }
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
    const n = typeof window !== "undefined" ? window.__ttNativeHealth : null;
    if (n?.reader?.enabled && typeof n.at === "number" && now - n.at <= LINK_GRACE_MS) return "ok";
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
  import("@/lib/driverGps").then(({ rescanUsbGps }) => rescanUsbGps()).catch(() => {});
  const url = `http://127.0.0.1:8765/rescan-usb?t=${Date.now()}`;
  try {
    fetch(url, { mode: "no-cors", cache: "no-store" }).catch(() => {});
  } catch { /* no helper on this device */ }
  try { window.dispatchEvent(new Event(GPS_RETRY_EVENT)); } catch { /* ignore */ }
}
