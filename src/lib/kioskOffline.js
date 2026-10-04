import { cleanTabletSession } from "./tabletSession";
// Cache tablet display information only. Credential verification requires a connection.
const DEVICE_KEY = "tt_kiosk_device_cache";
const DIRECTORY_KEY = "tt_kiosk_directory";
const LAST_STATUS_KEY = "tt_kiosk_last_status";

const read = (key, fallback) => {
  try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; } catch { return fallback; }
};
const write = (key, value) => {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage full */ }
};

export function saveDevice(device) {
  if (device) write(DEVICE_KEY, cleanTabletSession(device));
}
export function loadDevice(deviceId) {
  clearLegacyDirectory();
  const d = cleanTabletSession(read(DEVICE_KEY, null));
  if (d) write(DEVICE_KEY, d);
  return d && (d.device_id === deviceId || d.id === deviceId || !deviceId) ? d : null;
}
export function forgetTablet() {
  for (const k of [DEVICE_KEY, DIRECTORY_KEY, LAST_STATUS_KEY]) {
    try { localStorage.removeItem(k); } catch { /* ignore */ }
  }
}

export function saveDirectory(data) {
  if (data?.staff) write(DIRECTORY_KEY, { generated_at: data.generated_at || new Date().toISOString(), staff: data.staff.map(s => Object.fromEntries(["id", "full_name", "photo_url", "vehicle_id", "vehicle_name"].filter(k => s[k] !== undefined).map(k => [k, s[k]]))) });
}
export function directoryInfo() {
  clearLegacyDirectory();
  const d = read(DIRECTORY_KEY, null);
  return d ? { count: d.staff.length, updated: d.generated_at } : null;
}

// Prefetch photos so the service worker keeps a copy for offline use.
export function warmPhotos(staff = []) {
  for (const s of staff.slice(0, 300)) {
    if (s.photo_url) { try { const img = new Image(); img.src = s.photo_url; } catch { /* ignore */ } }
  }
}

export function noteStatus(staffId, status) {
  if (!staffId || !status) return;
  const map = read(LAST_STATUS_KEY, {});
  map[staffId] = status;
  write(LAST_STATUS_KEY, map);
}
const nextStatus = (staffId) => (read(LAST_STATUS_KEY, {})[staffId] === "boarded" ? "off_board" : "boarded");

// Same rule as the server (kioskCheckIn's wrongBus): a card or code only
// works on the passenger's own bus. Lists saved before this rule existed have
// no vehicle_id on anyone, so they're not checked until the next refresh.
export function busRefusal(person, vehicleId) {
  if (!person || !vehicleId || person.vehicle_id === undefined) return null;
  if (!person.vehicle_id) {
    return { error: "no_bus", message: `${person.full_name} isn't assigned to a bus yet. Ask the office to pick their bus in Card issuing.` };
  }
  if (person.vehicle_id !== vehicleId) {
    return { error: "wrong_bus", message: `${person.full_name} rides ${person.vehicle_name || "another bus"}, not this one.` };
  }
  return null;
}
// Legacy caches are scrubbed even when the tablet starts without a connection.
export function clearLegacyDirectory() {
 const dir = read(DIRECTORY_KEY, null);
 if (dir) write(DIRECTORY_KEY, cleanTabletSession(dir));
}
export function offlineLookup(action) {
 clearLegacyDirectory();
 if (["lookup_tag", "lookup_code"].includes(action)) throw Object.assign(new Error("Connect to verify your card or code"), { response: { status: 503, data: { error: "verification_requires_connection" } } });
 return null;
}
export function burnOneTimeCode() { clearLegacyDirectory(); }
