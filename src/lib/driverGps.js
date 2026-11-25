import { Capacitor, registerPlugin } from "@capacitor/core";

const UsbGps = registerPlugin("UsbGps");
const unsupported = { available: false, enabled: false, status: "Use the existing helper or tablet GPS", lastFixAt: 0 };
export const integratedGpsAvailable = () => Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android" && Capacitor.isPluginAvailable("UsbGps");
export async function readUsbGpsState() {
  if (!integratedGpsAvailable()) return unsupported;
  try { return await UsbGps.getState(); } catch { return unsupported; }
}
export async function setUsbGpsEnabled(enabled) { return UsbGps.setEnabled({ enabled: !!enabled }); }

// Admin → Kiosk tablets can choose a driver tablet's GPS: the USB module
// ("usb") or the tablet's own ("tablet"). Anything else leaves the choice
// made on the tablet alone.
export const adminGpsChoice = value => (value === "usb" || value === "tablet" ? value : null);
export async function applyAdminGpsChoice(choice) {
  const want = adminGpsChoice(choice);
  if (!want || !integratedGpsAvailable()) return null;
  const state = await readUsbGpsState();
  if (!state?.available) return null;
  const enabled = want === "usb";
  return state.enabled === enabled ? state : setUsbGpsEnabled(enabled);
}
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
  return { timestamp: t, ...(raw.nativeManaged === true ? { nativeManaged: true, nativePersisted: raw.nativePersisted === true } : {}),
    // The tablet app's background GPS filling in for a quiet USB module.
    ...(raw.backup === true ? { backup: true } : {}), coords: { latitude: c.latitude, longitude: c.longitude,
    accuracy: c.accuracy,
    speed: Number.isFinite(c.speed) && c.speed >= 0 && c.speed <= 100 ? c.speed : null,
    heading: Number.isFinite(c.heading) && c.heading >= 0 && c.heading <= 360 ? c.heading : null,
    altitude: Number.isFinite(c.altitude) ? c.altitude : null } };
}

// When the USB GPS module stops giving positions (no signal, unplugged, or it
// gave up), the tablet's own GPS takes over after this long, and hands back as
// soon as the module has a position again.
export const USB_BACKUP_AFTER_MS = 30000;

/** One source at a time: the USB GPS module when it is switched on, otherwise
 * the tablet's own GPS. If the module goes quiet for USB_BACKUP_AFTER_MS, the
 * tablet's GPS fills in (positions marked backup: true) until the module is
 * back, so the bus never sits on an old position. */
export function watchDriverPosition(success, failure = () => {}, options = {}) {
  let stopped = false, browserId = null, external = false, stateKnown = false;
  let backup = false, backupTimer = null;
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
      p => {
        if (stopped || !stateKnown) return;
        if (!external) success(p);
        else if (backup) success({ timestamp: p.timestamp, coords: p.coords, backup: true });
      },
      // While filling in for the module, the module's own status stays on screen.
      e => { if (!stopped && stateKnown && !external) failure(e); }, options
    );
  };
  const clearBackupTimer = () => { if (backupTimer != null) clearTimeout(backupTimer); backupTimer = null; };
  const armBackup = () => {
    clearBackupTimer();
    backupTimer = setTimeout(() => {
      backupTimer = null;
      if (stopped || !external || backup) return;
      backup = true;
      startBrowser();
    }, USB_BACKUP_AFTER_MS);
  };
  const endBackup = () => {
    clearBackupTimer();
    if (backup) { backup = false; stopBrowser(); }
  };
  const apply = state => {
    if (stopped) return;
    stateKnown = true;
    const wasExternal = external;
    external = (state?.enabled === true || state?.backgroundManaged === true) && state?.available === true;
    if (external) {
      if (!backup) stopBrowser();
      // Status updates ("Searching (3 sats)") arrive often; only a new switch
      // to the module starts the wait, so they never put the backup off.
      if (!wasExternal) armBackup();
      if (!backup && !String(state.status).startsWith("Fix (")) error(state.status || "Waiting for USB GPS");
    } else {
      // The tablet GPS is now the normal source; a backup watch simply carries on.
      clearBackupTimer();
      backup = false;
      startBrowser();
    }
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
          if (!p) return;
          endBackup();
          armBackup();
          success(p);
        });
        if (!stopped) apply(await readUsbGpsState());
      } catch { apply(unsupported); }
    })();
  }
  return () => {
    stopped = true; stopBrowser(); clearBackupTimer();
    void Promise.allSettled(handles.splice(0).map(h => h.remove()));
  };
}
export const clearDriverWatch = stop => { if (typeof stop === "function") stop(); };
