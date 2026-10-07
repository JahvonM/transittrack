// The driver's 4-digit PIN is checked by the server. When the tablet has no
// usable connection, a tablet that has already verified this PIN online can
// check it here instead — so a bad Wi-Fi morning never leaves a driver stuck
// at the gate. Only a salted PBKDF2 hash is kept on the tablet, never the PIN.
import { base44 } from "@/api/base44Client";
import { deviceRequest, saveDriverGrant } from "@/lib/deviceAuth";
import { localDayKey } from "@/lib/localDay";
import { httpStatus, errorData } from '@/lib/requestError';

const KEY = (id) => `tt_driver_pin_check_${id}`;
const TRIES = (id) => `tt_driver_pin_tries_${id}`;
const ITERATIONS = 150000;
const MAX_OFFLINE_TRIES = 5;

const toHex = (bytes) => Array.from(new Uint8Array(bytes), (b) => b.toString(16).padStart(2, "0")).join("");

async function derive(pin, saltHex) {
  const salt = new Uint8Array(saltHex.match(/../g).map((h) => parseInt(h, 16)));
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(pin), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations: ITERATIONS }, key, 256);
  return toHex(bits);
}

// Called after the server confirms the PIN, so the same PIN also works with no
// connection next time.
export async function rememberPin(deviceId, pin) {
  try {
    const salt = toHex(crypto.getRandomValues(new Uint8Array(16)));
    const hash = await derive(pin, salt);
    const record = JSON.stringify({ salt, hash });
    localStorage.setItem(KEY(deviceId), record);
    if (localStorage.getItem(KEY(deviceId)) !== record) return false;
    localStorage.removeItem(TRIES(deviceId));
    return true;
  } catch { return false; }
}

// Clear only when the server rejects the previously verified PIN itself,
// not when someone enters a different, incorrect PIN.
export function forgetPin(deviceId) {
  try { localStorage.removeItem(KEY(deviceId)); localStorage.removeItem(TRIES(deviceId)); } catch { /* ignore */ }
}

function triesLeft(deviceId) {
  try {
    const raw = JSON.parse(localStorage.getItem(TRIES(deviceId)) || "null");
    if (!raw || raw.day !== localDayKey()) return MAX_OFFLINE_TRIES;
    return Math.max(0, MAX_OFFLINE_TRIES - raw.count);
  } catch { return MAX_OFFLINE_TRIES; }
}

function noteTry(deviceId) {
  try {
    const raw = JSON.parse(localStorage.getItem(TRIES(deviceId)) || "null");
    const count = raw && raw.day === localDayKey() ? raw.count + 1 : 1;
    localStorage.setItem(TRIES(deviceId), JSON.stringify({ day: localDayKey(), count }));
  } catch { /* ignore */ }
}

// True only when the entered PIN matches the one this tablet verified online
// before. Wrong tries are counted per local day, like the server's own limit.
export async function checkPinOffline(deviceId, pin) {
  if (triesLeft(deviceId) <= 0) return false;
  let stored = null;
  try { stored = JSON.parse(localStorage.getItem(KEY(deviceId)) || "null"); } catch { return false; }
  if (!stored?.salt || !stored?.hash) return false;
  let ok = false;
  try { ok = (await derive(pin, stored.salt)) === stored.hash; } catch { return false; }
  if (ok) { try { localStorage.removeItem(TRIES(deviceId)); } catch { /* ignore */ } } else noteTry(deviceId);
  return ok;
}

// An offline unlock still owes the server a PIN check: the driver's pass
// (driver_grant) only comes from that check, and every other action needs it.
// The PIN is held in memory only, never written to the tablet.
let pending = null;
let timer = null;
let listening = false;
let confirming = false;

export function confirmPinWhenOnline(deviceId, pin) {
  pending = { deviceId, pin };
  if (!listening) {
    listening = true;
    window.addEventListener("online", confirmPin);
  }
  if (!timer) timer = setInterval(confirmPin, 20000);
  confirmPin();
}

function stopConfirming() {
  pending = null;
  if (timer) { clearInterval(timer); timer = null; }
}

async function confirmPin() {
  if (!pending || confirming || (typeof navigator !== 'undefined' && navigator.onLine === false)) return;
  const confirmation = pending;
  const { deviceId, pin } = confirmation;
  confirming = true;
  try {
    const res = await base44.functions.invoke('driverSession', deviceRequest(deviceId, { action: 'verify_pin', pin }));
    if (pending !== confirmation) return;
    if (res.data?.ok !== true) throw new Error('PIN verification failed');
    saveDriverGrant(deviceId, res.data.driver_grant);
    stopConfirming();
  } catch (error) {
    if (pending !== confirmation) return;
    const data = errorData(error);
    // Only this tablet's own backend can say this PIN is no longer right. A
    // dropped connection says nothing about the PIN, and locking the driver out
    // of a moving bus over it is what made the PIN screen come back all shift —
    // so anything else is simply retried.
    if (httpStatus(error) === 403 && data.error) { forgetPin(deviceId); stopConfirming(); }
    else if (data.code === 'DEVICE_ACCESS_REQUIRED') stopConfirming();
  } finally { confirming = false; }
}