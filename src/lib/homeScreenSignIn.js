// iPhone and iPad: an app added to the Home Screen starts with storage of its
// own, empty, so staff who had signed in (and joined their company) in Safari
// were asked to sign in again. While a passenger is signed in in Safari, this
// page's address and its app manifest carry a one-time code (?hs=), so the
// Home Screen icon opens with it, and the first open swaps it for a sign-in
// (functions homeScreenSignIn). Their company comes back from their membership.

import { installContext } from "./appInstall";

export const PARAM = "hs";
const CODE = /^[a-f0-9]{64}$/;
// Codes last 30 minutes on the server; a fresh one comes well before that.
export const REFRESH_MS = 20 * 60_000;

// The code this page opened with, and its address without it. null: none.
export function readHomeScreenCode(loc) {
  try {
    const url = new URL(loc.href);
    const code = url.searchParams.get(PARAM);
    if (code === null) return null;
    url.searchParams.delete(PARAM);
    const clean = url.pathname + url.search + url.hash;
    return { code: CODE.test(code) ? code : "", clean };
  } catch { return null; }
}

// The same address with the code in it (replacing an older one).
export function addressWithCode(loc, code) {
  const url = new URL(loc.href);
  url.searchParams.set(PARAM, code);
  return url.pathname + url.search + url.hash;
}

// Only Safari on an iPhone or iPad, not already the Home Screen app.
export function wantsHomeScreenCode(win, role) {
  if (!["staff", "passenger"].includes(role)) return false;
  const ctx = installContext(win);
  return ctx.ios && !ctx.standalone;
}

// The main manifest, opening the app with the code (Safari reads the manifest
// when the person adds the app; older iOS uses the page's address instead).
export function manifestWithCode(manifest, origin, code) {
  return { ...manifest, id: "/", start_url: `${origin}/?${PARAM}=${code}` };
}

let lastCode = null;
export function forgetHomeScreenCode() { lastCode = null; }

// Keep a fresh code in this page's address and manifest while it's open.
// Returns a stop function. Never throws: without a code the Home Screen app
// just asks them to sign in, as before.
export function keepHomeScreenCode({ win, issue, role, userId }) {
  if (!win || !userId || !wantsHomeScreenCode(win, role)) return () => {};
  let stopped = false, timer = null, blobUrl = null;
  // Moving between screens restarts this: reuse a recent code.
  const recent = () => (lastCode?.userId === userId && Date.now() - lastCode.at < REFRESH_MS ? lastCode.code : null);
  const link = win.document.querySelector('link[rel="manifest"]');
  const originalHref = link?.getAttribute("href") || "";
  const refresh = async () => {
    try {
      let code = recent();
      if (!code) {
        code = (await issue())?.code;
        if (typeof code !== "string" || !CODE.test(code)) return;
        // Kept even if they moved on meanwhile, so the next screen reuses it.
        lastCode = { code, userId, at: Date.now() };
      }
      if (stopped) return;
      win.history.replaceState(win.history.state, "", addressWithCode(win.location, code));
      if (link && originalHref) {
        const manifest = await (await win.fetch(originalHref)).json();
        if (stopped) return;
        const next = win.URL.createObjectURL(new win.Blob([JSON.stringify(manifestWithCode(manifest, win.location.origin, code))], { type: "application/manifest+json" }));
        link.setAttribute("href", next);
        if (blobUrl) win.URL.revokeObjectURL(blobUrl);
        blobUrl = next;
      }
    } catch { /* no code this time */ }
    if (!stopped) timer = win.setTimeout(() => { lastCode = null; refresh(); }, REFRESH_MS);
  };
  refresh();
  return () => {
    stopped = true;
    win.clearTimeout(timer);
    // Leaving the page (or signing out): its address and manifest go back.
    try {
      const carried = readHomeScreenCode(win.location);
      if (carried) win.history.replaceState(win.history.state, "", carried.clean);
      if (link && originalHref) link.setAttribute("href", originalHref);
      if (blobUrl) win.URL.revokeObjectURL(blobUrl);
    } catch { /* ignore */ }
  };
}
