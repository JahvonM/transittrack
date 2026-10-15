import { Capacitor, registerPlugin } from "@capacitor/core";
const TabletNetwork = registerPlugin("TabletNetwork");
export const nativeTabletNetworkAvailable = () => Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android" && Capacitor.isPluginAvailable("TabletNetwork");
const mode = () => typeof window !== "undefined" && /^\/driver(\/|$)/.test(window.location.pathname) ? "driver"
  : typeof window !== "undefined" && /^\/kiosk\/?$/.test(window.location.pathname) ? "boarding" : "";
export function cacheNetworkState(state) {
  if (typeof window !== "undefined" && state?.available) {
    window.__ttNativeNetwork = { ...state, at: Date.now() };
    window.dispatchEvent(new Event("tt-native-network"));
  }
  return state;
}
export async function nativeNetworkState() {
  if (!nativeTabletNetworkAvailable()) return { available: false, enabled: false };
  try { return cacheNetworkState(await TabletNetwork.getState()); } catch { return { available: false, enabled: false }; }
}
export async function setNativeNetworkMode(value = mode()) {
  if (nativeTabletNetworkAvailable()) await TabletNetwork.setMode({ mode: value });
}
export async function enableNativeNetwork(enabled) {
  await setNativeNetworkMode();
  return cacheNetworkState(await TabletNetwork.setEnabled({ enabled: !!enabled }));
}
export async function executeNativeNetwork(command) {
  await setNativeNetworkMode();
  const result = await TabletNetwork.execute({ command });
  await nativeNetworkState();
  return result;
}
export async function requestNetworkScanAccess() { return cacheNetworkState(await TabletNetwork.requestScanAccess()); }
export const openHotspotPermission = () => TabletNetwork.openHotspotPermission();
export function onNativeNetworkState(callback) {
  let stopped = false, handle;
  if (nativeTabletNetworkAvailable()) void TabletNetwork.addListener("networkState", state => {
    if (!stopped) callback(cacheNetworkState(state));
  }).then(h => { if (stopped) void h.remove(); else handle = h; }).catch(() => {});
  return () => { stopped = true; void handle?.remove(); };
}
const messages = {
  NETWORK_DISABLED: "Integrated network controls are off.", NETWORK_CONTEXT_REQUIRED: "Open the matching driver or boarding screen.",
  LOCATION_PERMISSION_REQUIRED: "Allow Wi-Fi scan access on the tablet.", LOCATION_SERVICES_REQUIRED: "Turn Android Location on to scan for Wi-Fi.",
  MANAGED_WIFI_REQUIRED: "Android requires managed-device access to change Wi-Fi directly. Use Android Wi-Fi settings or the current helper.",
  HOTSPOT_PERMISSION_REQUIRED: "Allow Modify system settings on the tablet, then retry.", HOTSPOT_UNSUPPORTED: "Android blocked hotspot automation on this tablet. Use Android hotspot settings.",
  HOTSPOT_NOT_CONFIRMED: "Android did not confirm that the hotspot switched on.", LOW_BATTERY: "Connect the charger before enabling the hotspot.",
  WIFI_OFF: "Turn Wi-Fi on in Android settings first.", WIFI_SCAN_UNAVAILABLE: "No fresh Wi-Fi scan. Android may be limiting scans; wait and retry.",
  WIFI_SCAN_COMPLETE: "Wi-Fi scan completed.", WIFI_JOIN_CONNECTED: "Connected to the selected Wi-Fi; internet access is checked separately.",
  WIFI_JOIN_FAILED: "Could not join. The previous network was requested again; check Android settings.",
  WIFI_POWER_REQUESTED: "Android accepted the Wi-Fi power request.", HOTSPOT_ON: "Android confirmed the hotspot is on.",
  HOTSPOT_POLICY_OFF: "Automatic hotspot maintenance stopped. Current hotspot power was left unchanged.",
  NETWORK_ERROR: "Android could not complete this network action.",
};
export const nativeNetworkResultText = code => messages[code] || "Could not confirm the network action.";
export const nativeNetworkSuccess = code => ["WIFI_SCAN_COMPLETE", "WIFI_JOIN_CONNECTED", "WIFI_POWER_REQUESTED", "HOTSPOT_ON", "HOTSPOT_POLICY_OFF"].includes(code);
