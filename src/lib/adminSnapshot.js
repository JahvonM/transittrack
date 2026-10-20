// The admin overview as this admin last saw it on this device: shown straight
// away when the console opens, while every list is fetched fresh in the
// background and replaces it (the same idea as passengerSnapshot.js).
//
// - Only the overview's lists (and the fleet), for the same account, up to a
//   day old; anything else waits for the server as before.
// - Join codes, PINs, card numbers and other codes are never kept.
// - Wiped on sign-out (savedSignIn.forgetProfile).
// - Admin.jsx never raises the SOS alarm from this copy: only live data can.
const KEY = "tt_admin_snapshot_v1";
export const ADMIN_SNAPSHOT_KEY = KEY;
export const ADMIN_SNAPSHOT_MAX_AGE_MS = 24 * 60 * 60 * 1000;
// Too big to be worth keeping on the device (localStorage is small).
const MAX_CHARS = 1_500_000;

export const SNAPSHOT_KEYS = new Set(["vehicles", "routes", "companies", "parts", "faultsOpen", "schedulesDue", "trips", "kiosks", "checkIns"]);

const NOT_SAVED = new Set(["driver_pin", "entry_code", "access_code", "access_code_expires_at", "one_time_code", "one_time_code_expires_at",
  "nfc_tag_id", "nfc_card_tag", "nfc_card_uid", "card_uid", "card_tag", "card_fingerprint", "pairing_code", "pairing_expires_at",
  "token", "token_hash", "salt", "pin_hash", "password", "device_token", "driver_grant", "verification_grant"]);

function scrub(value) {
  if (Array.isArray(value)) return value.map(scrub);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).filter(([k]) => !NOT_SAVED.has(k)).map(([k, v]) => [k, scrub(v)]));
  }
  return value;
}

function read() {
  try { return JSON.parse(localStorage.getItem(KEY) || "null"); } catch { return null; }
}

// The saved lists for this admin, or null.
export function loadAdminSnapshot(userId, now = Date.now()) {
  const saved = read();
  if (!saved || !userId || saved.userId !== userId || !saved.data || typeof saved.data !== "object") return null;
  const age = now - Date.parse(saved.savedAt);
  if (!Number.isFinite(age) || age < 0 || age > ADMIN_SNAPSHOT_MAX_AGE_MS) return null;
  const data = Object.fromEntries(Object.entries(saved.data).filter(([k, v]) => SNAPSHOT_KEYS.has(k) && Array.isArray(v)));
  return Object.keys(data).length ? { savedAt: saved.savedAt, data } : null;
}

// Keep the overview's lists that just arrived from the server.
export function saveAdminSnapshot(userId, lists, now = Date.now()) {
  if (!userId || !lists) return;
  const fresh = Object.fromEntries(Object.entries(lists).filter(([k, v]) => SNAPSHOT_KEYS.has(k) && Array.isArray(v)).map(([k, v]) => [k, scrub(v)]));
  if (!Object.keys(fresh).length) return;
  const prev = read();
  const data = { ...(prev?.userId === userId ? prev.data : {}), ...fresh };
  const text = JSON.stringify({ userId, savedAt: new Date(now).toISOString(), data });
  try {
    if (text.length > MAX_CHARS) localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, text);
  } catch { /* storage full or blocked: the console just opens the slower way */ }
}

export function clearAdminSnapshot() {
  try { localStorage.removeItem(KEY); } catch { /* storage blocked */ }
}
