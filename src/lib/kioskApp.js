import { Capacitor } from "@capacitor/core";

// Identifies installed builds containing the tablet helper, never a web URL
// or a storage flag. This is navigation policy, not server authorization.
export function isKioskInstall() {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android"
    && Capacitor.isPluginAvailable("TabletHealth")
    && (Capacitor.isPluginAvailable("UsbGps") || Capacitor.isPluginAvailable("UsbNfc"));
}
// McSween Driver, the store app for a driver's own phone (Android store
// flavor or driver-app/ios): it has the driver GPS plugin and none of the
// kiosk ones. It only ever shows the driver screens.
export function isDriverStoreInstall() {
  return Capacitor.isNativePlatform() && Capacitor.isPluginAvailable("DriverBackground") && !isKioskInstall();
}
export function driverStorePathAllowed(path) {
  return /^\/(driver(?:\/[^/]+)?|privacy|terms)\/?$/.test(path);
}
const MODE_KEY = "tt_tablet_mode";
export function rememberTabletMode(mode, storage) {
  if (!["driver", "kiosk"].includes(mode)) return;
  try { (storage || globalThis.localStorage).setItem(MODE_KEY, mode); } catch { /* Session still works without storage. */ }
}
export function savedTabletPath(storage) {
  try {
    storage = storage || globalThis.localStorage;
    const mode = storage.getItem(MODE_KEY);
    if (mode === "driver" || mode === "kiosk") return "/" + mode;
    // Upgrade an existing paired install without clearing credentials or queues.
    const driver = !!storage.getItem("tt_driver_device_id");
    const kiosk = !!storage.getItem("tt_kiosk_device_id");
    if (driver !== kiosk) return driver ? "/driver" : "/kiosk";
  } catch { /* Show chooser if storage is blocked. */ }
  return "/tablet";
}
export function kioskPathAllowed(path) {
  return /^\/(driver(?:\/[^/]+)?|kiosk|tablet|privacy|terms)\/?$/.test(path);
}
export function tabletModeForPath(path) {
  return /^\/driver(?:\/|$)/.test(path) ? "driver" : path === "/kiosk" ? "kiosk" : null;
}
