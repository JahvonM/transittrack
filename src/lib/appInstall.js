import { Capacitor } from "@capacitor/core";

// The "get the app" step people see the first time they open McSween
// Transport in a browser. The app installs from the browser itself (it is a
// web app with a manifest and a service worker): Chrome and Edge on Android
// and computers offer an Install prompt, while iPhone and iPad only add it by
// hand from Safari's Share menu, so those get a walkthrough.

export const FIRST_OPEN_KEY = "tt_first_open_v1";

// Pages that open for one job and shouldn't be interrupted: the bus tablets,
// a guest following a ride link, the desktop/phone sign-in hand-offs, the
// legal pages, the public website and the app-store reviewers' sandbox.
const SKIP_PATH = /^\/(kiosk|tablet|driver|track|desktop-signin|phone-signin|oauth|privacy|terms|site|reviewer-sandbox)(\/|$)/;

const IN_APP = /FBAN|FBAV|FB_IAB|FBIOS|Instagram|Line\/|Snapchat|musical_ly|TikTok|Twitter|LinkedInApp|GSA\//;

// What this device and browser are, as far as installing goes.
export function installContext(win = typeof window !== "undefined" ? window : null) {
  const nav = win?.navigator || {};
  const ua = String(nav.userAgent || "");
  // iPadOS Safari says it is a Mac; only the touch screen gives it away.
  const ipad = /iPad/.test(ua) || (/Macintosh/.test(ua) && (nav.maxTouchPoints || 0) > 1);
  const ios = ipad || /iPhone|iPod/.test(ua);
  const android = /Android/i.test(ua);
  const media = (q) => { try { return !!win?.matchMedia?.(q)?.matches; } catch { return false; } };
  const standalone = nav.standalone === true || media("(display-mode: standalone)") || media("(display-mode: fullscreen)") || media("(display-mode: minimal-ui)");
  let browser = "other";
  if (IN_APP.test(ua) || (android && /; wv\)/.test(ua))) browser = "inapp";
  else if (ios) browser = /CriOS/.test(ua) ? "chrome" : /EdgiOS/.test(ua) ? "edge" : /FxiOS/.test(ua) ? "firefox" : /OPiOS|OPT\/|YaBrowser|DuckDuckGo/.test(ua) ? "other" : "safari";
  else if (/SamsungBrowser/.test(ua)) browser = "samsung";
  else if (/Edg(A|e)?\//.test(ua)) browser = "edge";
  else if (/Firefox\//.test(ua)) browser = "firefox";
  else if (/OPR\//.test(ua)) browser = "other";
  else if (/Chrome\//.test(ua)) browser = "chrome";
  else if (/Safari\//.test(ua)) browser = "safari";
  return { ios, ipad, android, mobile: ios || android || /Mobi/i.test(ua), standalone, browser };
}

// Chrome and Edge announce that the app can be installed with
// beforeinstallprompt, usually just after the page loads, so it is caught at
// start-up (main.jsx) and kept until the Install button uses it.
let deferred = null;
let installed = false;
const listeners = new Set();
const changed = () => listeners.forEach((fn) => { try { fn(); } catch { /* one listener can't stop the rest */ } });

export function captureInstallPrompt(win = typeof window !== "undefined" ? window : null) {
  if (!win?.addEventListener || win.__ttInstallCapture) return;
  win.__ttInstallCapture = true;
  win.addEventListener("beforeinstallprompt", (event) => {
    // Our own "Get the app" screen asks instead of the browser's banner.
    event.preventDefault();
    deferred = event;
    changed();
  });
  win.addEventListener("appinstalled", () => { deferred = null; installed = true; changed(); });
}
export const canPromptInstall = () => !!deferred;
export const appWasInstalled = () => installed;
export function onInstallChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }

// Shows the browser's own Install dialog. "accepted", "dismissed" or
// "unavailable" (the browser no longer offers it).
export async function promptInstall() {
  const event = deferred;
  if (!event?.prompt) return "unavailable";
  deferred = null;
  try {
    await event.prompt();
    const choice = await event.userChoice;
    if (choice?.outcome === "accepted") installed = true;
    return choice?.outcome === "accepted" ? "accepted" : "dismissed";
  } catch {
    return "unavailable";
  } finally {
    changed();
  }
}
export function resetInstallPromptForTests() { deferred = null; installed = false; listeners.clear(); }

// Which "get the app" screen this device gets, or null for none: already
// installed, or a computer whose browser can't install it.
export function installStep(ctx, promptable = canPromptInstall()) {
  if (!ctx || ctx.standalone) return null;
  if (ctx.browser === "inapp") return "inapp";
  if (ctx.ios) return ctx.browser === "safari" ? "ios-safari" : "ios-other";
  if (ctx.android) return promptable ? "prompt" : "android-menu";
  return promptable ? "prompt" : null;
}

function nativeApp() {
  try { return Capacitor.isNativePlatform(); } catch { return false; }
}

// The first-open screens show once per browser (an iPhone's Home Screen app
// has storage of its own, so it gets them once more, for its permissions).
export function firstOpenWanted({ win = typeof window !== "undefined" ? window : null, path, storage, native = nativeApp() } = {}) {
  if (!win || native) return false;
  const nav = win.navigator || {};
  // Automated browsers: the test suite and the store-screenshot tool.
  if (nav.webdriver) return false;
  // The Windows desktop app has its own window and notifications.
  if (win.transittrackDesktop || /Electron\//i.test(nav.userAgent || "")) return false;
  try { if (win.self !== win.top) return false; } catch { return false; }
  if (SKIP_PATH.test(path ?? win.location?.pathname ?? "/")) return false;
  try {
    return !(storage || win.localStorage).getItem(FIRST_OPEN_KEY);
  } catch {
    // No storage: it couldn't remember being closed and would show every time.
    return false;
  }
}
export function markFirstOpenDone(storage) {
  try { (storage || globalThis.localStorage).setItem(FIRST_OPEN_KEY, new Date().toISOString()); } catch { /* shows again next time */ }
}
