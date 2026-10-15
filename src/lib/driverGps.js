import { Capacitor, registerPlugin } from "@capacitor/core";

const UsbGps = registerPlugin("UsbGps");
const unsupported = { available: false, enabled: false, status: "Use the existing helper or tablet GPS", lastFixAt: 0 };
export const integratedGpsAvailable = () => Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android" && Capacitor.isPluginAvailable("UsbGps");
export async function readUsbGpsState() {
  if (!integratedGpsAvailable()) return unsupported;
  try { return await UsbGps.getState(); } catch { return unsupported; }
}
export async function setUsbGpsEnabled(enabled) { return UsbGps.setEnabled({ enabled: !!enabled }); }
export async function openUsbAutoAcceptSettings() { await UsbGps.openAutoAcceptSettings(); }
export async function rescanUsbGps() {
  if (integratedGpsAvailable()) await UsbGps.rescan();
}
export function onUsbGpsState(callback) {
  let stopped = false, handle;
  if (integratedGpsAvailable()) {
    UsbGps.addListener("gpsState", state => { if (!stopped) callback(state); })
      .then(h => { if (stopped) void h.remove(); else handle = h; }).catch(() => {});
  }
  return () => { stopped = true; void handle?.remove(); };
}

// Same units/shape as watchPosition: speed m/s, heading degrees, timestamp ms.
// Never upload malformed, stale or future-dated receiver samples.
export function usbPosition(raw, now = Date.now()) {
  const c = raw?.coords, t = raw?.timestamp;
  if (!c || !Number.isFinite(t) || now - t > 10000 || t > now + 2000 ||
      !Number.isFinite(c.latitude) || Math.abs(c.latitude) > 90 ||
      !Number.isFinite(c.longitude) || Math.abs(c.longitude) > 180 ||
      !Number.isFinite(c.accuracy) || c.accuracy < 0) return null;
  return { timestamp: t, coords: { latitude: c.latitude, longitude: c.longitude,
    accuracy: c.accuracy,
    speed: Number.isFinite(c.speed) && c.speed >= 0 && c.speed <= 100 ? c.speed : null,
    heading: Number.isFinite(c.heading) && c.heading >= 0 && c.heading <= 360 ? c.heading : null,
    altitude: Number.isFinite(c.altitude) ? c.altitude : null } };
}

/** One source at a time. Explicit USB mode never silently falls back to a stale
 * Android/mock-provider position when the receiver is unplugged. */
export function watchDriverPosition(success, failure = () => {}, options = {}) {
  let stopped = false, browserId = null, external = false, stateKnown = false;
  const handles = [];
  const error = message => {
    if (!stopped) failure({ code: 2, POSITION_UNAVAILABLE: 2, PERMISSION_DENIED: 1, message, source: "usb" });
  };
  const stopBrowser = () => {
    if (browserId != null) navigator.geolocation?.clearWatch(browserId);
    browserId = null;
  };
  const startBrowser = () => {
    if (stopped || browserId != null) return;
    if (!navigator.geolocation) { error("Location is unavailable on this device"); return; }
    browserId = navigator.geolocation.watchPosition(
      p => { if (!stopped && stateKnown && !external) success(p); },
      e => { if (!stopped && stateKnown && !external) failure(e); }, options
    );
  };
  const apply = state => {
    if (stopped) return;
    stateKnown = true;
    external = state?.enabled === true && state?.available === true;
    if (external) {
      stopBrowser();
      if (!String(state.status).startsWith("Fix (")) error(state.status || "Waiting for USB GPS");
    } else startBrowser();
  };
  const listen = async (name, callback) => {
    const h = await UsbGps.addListener(name, callback);
    if (stopped) await h.remove(); else handles.push(h);
  };
  if (!integratedGpsAvailable()) apply(unsupported);
  else {
    (async () => {
      try {
        await listen("gpsState", apply);
        if (stopped) return;
        await listen("gpsPosition", raw => {
          if (stopped || !stateKnown || !external) return;
          const p = usbPosition(raw);
          if (p) success(p);
        });
        if (!stopped) apply(await readUsbGpsState());
      } catch { apply(unsupported); }
    })();
  }
  return () => {
    stopped = true; stopBrowser();
    void Promise.allSettled(handles.splice(0).map(h => h.remove()));
  };
}
export const clearDriverWatch = stop => { if (typeof stop === "function") stop(); };
