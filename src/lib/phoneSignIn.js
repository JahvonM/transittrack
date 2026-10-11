// The TransitTrack phone app (iPhone/Android) signs in with Google or Apple
// through the phone's own browser, because Google refuses to sign in inside an
// app's web view. RFC 8252 style, like TransitTrack Desktop:
//
// 1. In the app, "Continue with Google" makes a random state and a random
//    256-bit key, keeps both in the app, and opens
//      /phone-signin?state=<state>&provider=google#k=<key>
//    in the phone's browser (Safari view / Chrome custom tab). The key is in
//    the # part, so it is never sent to any server.
// 2. That page signs in there as usual. Once signed in, and only after the
//    person taps "Open TransitTrack app", it seals the session with the key
//    (AES-GCM, bound to the state) and opens
//      com.transittrack.app://signin?state=..&iv=..&data=..
// 3. The app accepts only its own state, within 10 minutes, once, and only
//    what its key can open, then signs in with that session.
//
// Another app claiming the same link name gets only sealed data it can't
// open, and a link someone else made can't sign this app in or out.
import { Capacitor } from "@capacitor/core";

export const PHONE_SIGNIN_SCHEME = "com.transittrack.app";
export const PHONE_SIGNIN_PATH = "/phone-signin";
export const PHONE_PROVIDERS = { google: "Google", apple: "Apple" };
export const PHONE_SIGNIN_MAX_AGE_MS = 10 * 60 * 1000;

const APP_STORAGE_KEY = "tt_phone_signin";
const PAGE_KEY_PREFIX = "tt_phone_signin_key_";
const RANDOM = /^[A-Za-z0-9_-]{43}$/; // 32 random bytes, base64url
const TOKEN = /^[A-Za-z0-9._~+/=-]{16,8192}$/;

const named = (name, message = name) => Object.assign(new Error(message), { name });

export function toBase64Url(bytes) {
  let text = "";
  for (const b of bytes) text += String.fromCharCode(b);
  return btoa(text).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function fromBase64Url(value) {
  if (typeof value !== "string" || !/^[A-Za-z0-9_-]*$/.test(value)) throw named("BadLink");
  const padded = value.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((value.length + 3) % 4);
  const text = atob(padded);
  const out = new Uint8Array(text.length);
  for (let i = 0; i < text.length; i += 1) out[i] = text.charCodeAt(i);
  return out;
}

function randomValue(cryptoImpl) {
  const bytes = new Uint8Array(32);
  cryptoImpl.getRandomValues(bytes);
  return toBase64Url(bytes);
}

function aesKey(key, usage, cryptoImpl) {
  return cryptoImpl.subtle.importKey("raw", fromBase64Url(key), { name: "AES-GCM" }, false, [usage]);
}

function safePath(path) {
  return typeof path === "string" && path.startsWith("/") && !path.startsWith("//") && !path.includes("\\") ? path : "/";
}

// ---- In the phone app ----------------------------------------------------

// Only inside the phone app, and only when the installed copy can open the
// phone's browser (older installs keep the normal in-app sign-in).
export function phoneSignInAvailable() {
  try {
    return Capacitor.isNativePlatform() && Capacitor.isPluginAvailable("Browser") && Capacitor.isPluginAvailable("App");
  } catch {
    return false;
  }
}

export function phoneSignInUrl({ origin, state, provider, key }) {
  return `${origin}${PHONE_SIGNIN_PATH}?${new URLSearchParams({ state, provider }).toString()}#k=${key}`;
}

export async function startPhoneSignIn({ provider, returnTo, origin, storage, openBrowser, cryptoImpl = globalThis.crypto, now = Date.now() }) {
  if (!Object.prototype.hasOwnProperty.call(PHONE_PROVIDERS, provider)) throw named("BadProvider");
  const state = randomValue(cryptoImpl);
  const key = randomValue(cryptoImpl);
  storage.setItem(APP_STORAGE_KEY, JSON.stringify({ state, key, provider, returnTo: safePath(returnTo), at: now }));
  const url = phoneSignInUrl({ origin, state, provider, key });
  await openBrowser(url);
  return url;
}

export function isPhoneSignInLink(url) {
  return typeof url === "string" && url.toLowerCase().startsWith(`${PHONE_SIGNIN_SCHEME}://signin`);
}

// The link the browser page opened. Returns { token, returnTo } or throws:
// NotOurs (not a sign-in this app started: ignore), Expired, BadLink.
export async function openPhoneSignInLink(url, { storage, cryptoImpl = globalThis.crypto, now = Date.now() }) {
  if (!isPhoneSignInLink(url)) throw named("NotOurs");
  let link;
  try {
    link = new URL(url);
  } catch {
    throw named("BadLink");
  }
  const state = link.searchParams.get("state") || "";
  let pending = null;
  try {
    pending = JSON.parse(storage.getItem(APP_STORAGE_KEY) || "null");
  } catch {
    pending = null;
  }
  if (!pending || !RANDOM.test(state) || pending.state !== state) throw named("NotOurs");
  // One use only, whatever happens next.
  storage.removeItem(APP_STORAGE_KEY);
  if (!(now - pending.at >= 0 && now - pending.at < PHONE_SIGNIN_MAX_AGE_MS)) throw named("Expired");
  let token;
  try {
    const iv = fromBase64Url(link.searchParams.get("iv") || "");
    const data = fromBase64Url(link.searchParams.get("data") || "");
    if (iv.length !== 12 || data.length < 17) throw named("BadLink");
    const key = await aesKey(pending.key, "decrypt", cryptoImpl);
    const plain = await cryptoImpl.subtle.decrypt({ name: "AES-GCM", iv, additionalData: new TextEncoder().encode(state) }, key, data);
    token = new TextDecoder().decode(plain);
  } catch {
    throw named("BadLink");
  }
  if (!TOKEN.test(token)) throw named("BadLink");
  return { token, returnTo: safePath(pending.returnTo) };
}

// Where the app goes once signed in: the login page's normal "returning from
// Google" path, which waits for the server to confirm the account.
export function afterPhoneSignInPath(returnTo) {
  return `/login?authReturn=1&returnTo=${encodeURIComponent(safePath(returnTo))}`;
}

// ---- In the phone's browser (the /phone-signin page) --------------------

// Validated request, or null when the link is not one the app could have
// made. The key comes from the # part on the first visit and is kept for this
// tab only, so it survives the trip to Google and back.
export function readPhoneSignIn(search, hash, sessionStore) {
  const q = new URLSearchParams(search || "");
  const state = q.get("state") || "";
  const provider = q.get("provider") || "google";
  if (!RANDOM.test(state)) return null;
  if (!Object.prototype.hasOwnProperty.call(PHONE_PROVIDERS, provider)) return null;
  const storeKey = PAGE_KEY_PREFIX + state.slice(0, 22);
  let key = new URLSearchParams(String(hash || "").replace(/^#/, "")).get("k") || "";
  if (RANDOM.test(key)) {
    try { sessionStore?.setItem(storeKey, key); } catch { /* storage blocked */ }
  } else {
    key = "";
    try { key = sessionStore?.getItem(storeKey) || ""; } catch { /* storage blocked */ }
    if (!RANDOM.test(key)) key = "";
  }
  return { state, provider, key: key || null };
}

export function phoneSignInPath({ state, provider }) {
  return `${PHONE_SIGNIN_PATH}?${new URLSearchParams({ state, provider }).toString()}`;
}

export async function sealSessionForPhone({ state, key }, token, cryptoImpl = globalThis.crypto) {
  if (!RANDOM.test(state) || !RANDOM.test(key || "") || !TOKEN.test(token || "")) throw named("BadLink");
  const iv = new Uint8Array(12);
  cryptoImpl.getRandomValues(iv);
  const cryptoKey = await aesKey(key, "encrypt", cryptoImpl);
  const sealed = await cryptoImpl.subtle.encrypt({ name: "AES-GCM", iv, additionalData: new TextEncoder().encode(state) }, cryptoKey, new TextEncoder().encode(token));
  const q = new URLSearchParams({ state, iv: toBase64Url(iv), data: toBase64Url(new Uint8Array(sealed)) });
  return `${PHONE_SIGNIN_SCHEME}://signin?${q.toString()}`;
}

export function forgetPhoneSignInKey(state, sessionStore) {
  try { sessionStore?.removeItem(PAGE_KEY_PREFIX + String(state).slice(0, 22)); } catch { /* storage blocked */ }
}
