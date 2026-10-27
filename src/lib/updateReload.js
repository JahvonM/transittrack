// When the app is published while someone has it open, the next screen they
// open asks for a file from the old version that no longer exists ("Failed to
// fetch dynamically imported module"). Reloading picks up the new version, so
// do that once for them instead of showing an error. If it happens again
// within a minute, or the device is offline, the error shows as before.

const KEY = "tt_update_reload_at";
const WINDOW_MS = 60_000;
let reloading = false;

export const reloadingForUpdate = () => reloading;

export function reloadForUpdate({ now = Date.now(), storage = window.sessionStorage, online = navigator.onLine, reload = () => window.location.reload() } = {}) {
  if (reloading) return true;
  if (online === false) return false;
  try {
    const last = storage.getItem(KEY);
    if (last && now - Number(last) < WINDOW_MS) return false;
    storage.setItem(KEY, String(now));
  } catch {
    return false; // can't remember the try, so don't risk a reload loop
  }
  reloading = true;
  reload();
  return true;
}

// What to do when a screen's file can't be loaded. Reload once, as above. If
// that doesn't help and the file is only the screen's styling (the browser
// blocked it, or the connection dropped it), the screen opens without it
// rather than failing; onStyleMissing notes it. A missing script still shows
// the error screen.
export function handlePreloadError(event, { reload = reloadForUpdate, onStyleMissing } = {}) {
  if (reload()) { event.preventDefault(); return "reload"; }
  if (/^Unable to preload CSS/.test(String(event?.payload?.message || ""))) {
    event.preventDefault();
    onStyleMissing?.(event.payload);
    return "without-style";
  }
  return "error";
}

let installed = false;
export function installUpdateReload({ onStyleMissing } = {}) {
  if (installed || typeof window === "undefined") return;
  installed = true;
  // Vite raises this whenever a screen's file can't be loaded.
  window.addEventListener("vite:preloadError", (event) => { handlePreloadError(event, { onStyleMissing }); });
}
