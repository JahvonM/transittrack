// The last data a home screen showed, kept on this device for the person who
// saw it, so the screen opens with it straight away and refreshes behind it
// (the passenger home does the same with passengerSnapshot.js).
//
// Only what that person's own screen already showed is kept, it's never shown
// to anyone else signed in on the device, it goes after a day, and signing out
// clears it. The server still checks every request as before.
const PREFIX = "tt_screen_v1:";
export const SAVED_SCREEN_MAX_AGE_MS = 24 * 60 * 60 * 1000;
// Big enough for a home screen, small enough to leave room for everything else.
const MAX_CHARS = 1_500_000;

function storage() {
  try { return typeof window !== "undefined" ? window.localStorage : null; } catch { return null; }
}

export function loadScreen(name, userId, now = Date.now()) {
  if (!userId) return null;
  try {
    const saved = JSON.parse(storage()?.getItem(PREFIX + name) || "null");
    if (!saved || saved.userId !== userId) return null;
    if (!(now - saved.savedAt < SAVED_SCREEN_MAX_AGE_MS)) return null;
    return saved.data ?? null;
  } catch { return null; }
}

export function saveScreen(name, userId, data, now = Date.now()) {
  const store = storage();
  if (!store || !userId || data == null) return false;
  try {
    const text = JSON.stringify({ userId, savedAt: now, data });
    if (text.length > MAX_CHARS) { store.removeItem(PREFIX + name); return false; }
    store.setItem(PREFIX + name, text);
    return true;
  } catch {
    try { store.removeItem(PREFIX + name); } catch { /* storage blocked */ }
    return false;
  }
}

// Sign-out, or the server ended the sign-in: nothing of any screen stays behind.
export function forgetScreens() {
  const store = storage();
  if (!store) return;
  try {
    const keys = [];
    for (let i = 0; i < store.length; i++) { const key = store.key(i); if (key?.startsWith(PREFIX)) keys.push(key); }
    keys.forEach((key) => store.removeItem(key));
  } catch { /* storage blocked */ }
}
