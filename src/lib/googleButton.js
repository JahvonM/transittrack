import { BACKEND } from "tt-backend";
import { phoneSignInAvailable } from "@/lib/phoneSignIn";

// "Continue with Google" through Google's own sign-in button (Google Identity
// Services) instead of a redirect through Supabase. Google then shows the
// app's own address (app.mcsweenstransport.com) instead of the Supabase
// project address, and the app hands Google's ID token to Supabase
// (signInWithIdToken). The redirect stays as the fallback when Google's
// script can't load.
//
// The web client ID is public by design: Google shows it in every sign-in
// address. Its Authorized JavaScript origins in Google Cloud must include each
// site that shows the button (app. and new.mcsweenstransport.com are there).
export const GOOGLE_WEB_CLIENT_ID = "411225112950-79slmr303ghsfe4h3lf90h6u7midn7ri.apps.googleusercontent.com";
export const GIS_SCRIPT = "https://accounts.google.com/gsi/client";
export const GIS_ORIGINS = ["https://app.mcsweenstransport.com", "https://new.mcsweenstransport.com"];

// Only on the Supabase build, in a normal browser on one of the allowed
// sites. Inside the phone and desktop apps Google refuses to sign in at all,
// so those open the person's browser first (phoneSignIn.js, desktopSignIn.js)
// and the button shows there.
export function googleButtonAvailable(win = typeof window !== "undefined" ? window : null) {
  if (BACKEND !== "supabase" || !win) return false;
  if (!GIS_ORIGINS.includes(win.location?.origin)) return false;
  if (win.transittrackDesktop || /Electron\//i.test(win.navigator?.userAgent || "")) return false;
  if (phoneSignInAvailable()) return false;
  return true;
}

let loading = null;
// Loads Google's script once. Rejects after `ms` so the page falls back to the
// redirect instead of waiting forever (blocked by an extension, no signal).
export function loadGoogleButtonScript(doc = document, ms = 6000) {
  if (typeof window !== "undefined" && window.google?.accounts?.id) return Promise.resolve(window.google);
  loading ||= new Promise((resolve, reject) => {
    const timer = setTimeout(() => { loading = null; reject(new Error("Google sign-in didn't load")); }, ms);
    const s = doc.createElement("script");
    s.src = GIS_SCRIPT;
    s.async = true;
    s.defer = true;
    s.onload = () => { clearTimeout(timer); window.google?.accounts?.id ? resolve(window.google) : reject(new Error("Google sign-in didn't load")); };
    s.onerror = () => { clearTimeout(timer); loading = null; reject(new Error("Google sign-in didn't load")); };
    doc.head.appendChild(s);
  });
  return loading;
}

const hex = (bytes) => Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");

// A fresh nonce per button: Google puts the hashed one in its ID token and
// Supabase checks the plain one against it, so a token can't be replayed.
export async function makeNonce(crypto = globalThis.crypto) {
  const raw = hex(crypto.getRandomValues(new Uint8Array(32)));
  const hashed = hex(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(raw))));
  return { raw, hashed };
}

// Only paths on this site: where to go once signed in.
export function signedInPath(path) {
  const p = String(path || "/");
  return p.startsWith("/") && !p.startsWith("//") ? p : "/";
}
