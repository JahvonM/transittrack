// "Trust the phone": the app opens straight away with what this device's
// sign-in last looked like (the person's profile and the app's public
// settings) and checks the account with the server in the background. If the
// server says the sign-in has ended, AuthContext logs out as before.
//
// The UI is all this decides. Every record still comes from the server, which
// checks the real sign-in on each request, so a stale profile (say, a role an
// admin just changed) can only show a screen for a moment, never its data.
import { sessionSubject } from 'tt-backend';
import { ADMIN_SNAPSHOT_KEY } from '@/lib/adminSnapshot';

const PROFILE_KEY = 'tt_saved_profile_v1';
const SETTINGS_KEY = 'tt_saved_public_settings_v1';
// After this long without the app being opened, wait for the server again.
export const SAVED_PROFILE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

function read(key) {
  try { return JSON.parse(window.localStorage.getItem(key) || 'null'); } catch { return null; }
}
function write(key, value) {
  try { window.localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage full or blocked: just slower next time */ }
}

// The profile this sign-in last had, or null (different person, too old, none).
export function savedProfile(now = Date.now()) {
  const subject = sessionSubject();
  const saved = subject ? read(PROFILE_KEY) : null;
  if (!saved || saved.subject !== subject || !saved.user?.id) return null;
  if (!(now - saved.savedAt < SAVED_PROFILE_MAX_AGE_MS)) return null;
  return saved.user;
}

// Codes and card numbers that let someone board or sign in are never kept on
// the device: the screens don't need them, and the account check returns them
// fresh when something does. (The same list the server strips in entityAccess.)
const NOT_SAVED = new Set(['driver_pin', 'entry_code', 'access_code', 'one_time_code', 'one_time_code_expires_at',
  'nfc_tag_id', 'nfc_card_tag', 'nfc_card_uid', 'card_uid', 'card_tag', 'pairing_code', 'token', 'token_hash',
  'salt', 'pin_hash', 'password', 'device_token', 'driver_grant', 'verification_grant']);

export function rememberProfile(user, now = Date.now()) {
  const subject = sessionSubject();
  if (!subject || !user?.id) return;
  const safe = Object.fromEntries(Object.entries(user).filter(([key]) => !NOT_SAVED.has(key)));
  write(PROFILE_KEY, { subject, savedAt: now, user: safe });
}

export function savedPublicSettings() {
  return read(SETTINGS_KEY);
}

export function rememberPublicSettings(settings) {
  if (settings && typeof settings === 'object') write(SETTINGS_KEY, settings);
}

// Sign-out, or the server ended the sign-in. The admin overview's saved copy
// (adminSnapshot.js) goes too.
export function forgetProfile() {
  try { window.localStorage.removeItem(PROFILE_KEY); window.localStorage.removeItem(ADMIN_SNAPSHOT_KEY); } catch { /* storage blocked */ }
}
