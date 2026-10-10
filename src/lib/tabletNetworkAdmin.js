// Admin → Kiosk tablets: what to show for a tablet's Wi-Fi (boarding) or
// hotspot (driver) controls. Pure functions; see TabletNetworkControls.jsx.

export const NETWORK_HELPER_VERSION = "1.9";

// "1.10" is newer than "1.9".
export function helperAtLeast(version, min = NETWORK_HELPER_VERSION) {
  if (typeof version !== "string" || !/^\d+(\.\d+)*$/.test(version)) return false;
  const a = version.split(".").map(Number);
  const b = min.split(".").map(Number);
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const x = a[i] || 0, y = b[i] || 0;
    if (x !== y) return x > y;
  }
  return true;
}

// The admin's latest command, while it is still on its way to the tablet.
export function pendingCommand(device) {
  const s = device?.network_status;
  return s && (s.state === "waiting" || s.state === "sent") ? s : null;
}

// One line about where the latest command is.
export function commandProgress(device) {
  const s = device?.network_status;
  if (!s || !s.state) return "";
  if (s.state === "waiting") return "Waiting for the tablet to check in (it needs internet)…";
  if (s.state === "sent") return "Sent to the tablet…";
  if (s.state === "expired") return "The tablet didn't pick this up within 10 minutes. It may be offline, or its Helper is older than 1.9.";
  return "";
}

// The result of the latest Wi-Fi change, if the tablet has reported it.
export function latestJoin(device) {
  const join = device?.helper_health?.wifi?.join;
  if (!join || !join.state) return null;
  const s = device?.network_status;
  // Only the result of the admin's latest Wi-Fi change counts (not an older one).
  if (s?.type === "wifi_join" && s.id && join.id && join.id !== s.id) return null;
  return join;
}

// Networks from the latest scan, the one the tablet is on first.
export function scannedNetworks(device) {
  const wifi = device?.helper_health?.wifi;
  const list = Array.isArray(wifi?.networks) ? wifi.networks.filter((n) => n && typeof n.ssid === "string" && n.ssid) : [];
  const current = wifi?.ssid || "";
  return [...list].sort((a, b) => (b.ssid === current) - (a.ssid === current) || (b.bars || 0) - (a.bars || 0));
}

// Why this password can't be used, or "" if it can.
export function wifiPasswordProblem(lock, password) {
  if (lock === "open") return "";
  if (lock !== "password") return "This network needs a company log-in, which the tablet can't use.";
  if (typeof password !== "string" || password.length < 8) return "Wi-Fi passwords are at least 8 characters.";
  if (password.length > 63) return "Wi-Fi passwords are at most 63 characters.";
  if (!/^[\x20-\x7e]+$/.test(password)) return "Use only letters, numbers and symbols you can type on a keyboard.";
  return "";
}

// Whether the driver tablet's hotspot switch shows on: a change on its way wins.
export function hotspotAlwaysOn(device) {
  const s = pendingCommand(device);
  if (s?.type === "hotspot" && typeof s.always_on === "boolean") return s.always_on;
  return device?.helper_health?.hotspot_always === true;
}
