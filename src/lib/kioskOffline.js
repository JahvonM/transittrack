// What a bus boarding tablet keeps on the device so it still works with no
// WiFi: its own setup (so it opens straight into boarding), and the list of
// who can board - names, card IDs and keypad codes for this company -
// refreshed every few minutes while online. Check-ins made offline are
// queued (lib/offlineQueue) and uploaded with the time they really happened.
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
  if (device) write(DEVICE_KEY, device);
}
export function loadDevice(deviceId) {
  const d = read(DEVICE_KEY, null);
  return d && (d.device_id === deviceId || d.id === deviceId || !deviceId) ? d : null;
}
export function forgetTablet() {
  for (const k of [DEVICE_KEY, DIRECTORY_KEY, LAST_STATUS_KEY]) {
    try { localStorage.removeItem(k); } catch { /* ignore */ }
  }
}

export function saveDirectory(data) {
  if (data?.staff) write(DIRECTORY_KEY, { generated_at: data.generated_at || new Date().toISOString(), staff: data.staff });
}
export function directoryInfo() {
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

const normalizeTag = (v) => String(v || "").replace(/[^0-9a-f]/gi, "").toUpperCase();
const notFound = (error) => Object.assign(new Error(error), { response: { status: 404, data: { error } }, offline: true });
const toStaff = (s) => ({ id: s.id, full_name: s.full_name, photo_url: s.photo_url });

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
const refuse = (data) => Object.assign(new Error(data.error), { response: { status: 403, data }, offline: true });

// Answers lookup_tag / lookup_code from the saved list. Returns null when
// there's no saved list (nothing to answer from); throws the same "not
// recognised" errors the server gives.
export function offlineLookup(action, payload = {}) {
  const dir = read(DIRECTORY_KEY, null);
  if (!dir?.staff?.length) return null;
  if (action === "lookup_tag") {
    const tag = normalizeTag(payload.card_tag);
    const person = dir.staff.find((s) => s.nfc_tag && normalizeTag(s.nfc_tag) === tag);
    if (!person) throw notFound("badge_not_registered");
    const no = busRefusal(person, read(DEVICE_KEY, null)?.vehicle_id);
    if (no) throw refuse(no);
    return { staff: toStaff(person), next_status: nextStatus(person.id), offline: true };
  }
  if (action === "lookup_code") {
    const code = String(payload.code || "").trim();
    let person = dir.staff.find((s) => s.access_code && s.access_code === code);
    let codeType = "access";
    if (!person) {
      person = dir.staff.find((s) => s.one_time_code && s.one_time_code === code
        && s.one_time_code_expires_at && new Date(s.one_time_code_expires_at).getTime() > Date.now());
      codeType = "one_time";
    }
    if (!person) throw notFound("code_not_recognized");
    const no = busRefusal(person, read(DEVICE_KEY, null)?.vehicle_id);
    if (no) throw refuse(no);
    return { staff: toStaff(person), next_status: nextStatus(person.id), code_type: codeType, offline: true };
  }
  return null;
}

// A one-time code used offline mustn't work twice on this tablet.
export function burnOneTimeCode(staffId) {
  const dir = read(DIRECTORY_KEY, null);
  if (!dir?.staff) return;
  const s = dir.staff.find((x) => x.id === staffId);
  if (s) { s.one_time_code = ""; write(DIRECTORY_KEY, dir); }
}
