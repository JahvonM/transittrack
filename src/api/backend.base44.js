// The app's backend client while it runs on Base44 (the normal build).
// vite.config.js points `tt-backend` here unless the build is `--mode supabase`,
// which uses backend.supabase.js instead. Both export the same two functions.
import { createClient, getAccessToken } from '@base44/sdk';

export const BACKEND = 'base44';

export function createBackend({ appId, token, functionsVersion, appBaseUrl }) {
  return createClient({ appId, token, functionsVersion, serverUrl: '', appBaseUrl });
}

// The saved sign-in, read straight away so the first screen knows whether to
// check it (the Base44 SDK also picks up ?access_token= from the address).
export function storedAccessToken() {
  return getAccessToken();
}

// Who the saved sign-in belongs to (the `sub` of Base44's token), so a profile
// saved on this device is only reused for the same person. Null when unknown
// or expired.
export function sessionSubject() {
  const token = getAccessToken();
  const part = typeof token === 'string' ? token.split('.')[1] : '';
  if (!part) return null;
  try {
    const b64 = part.replace(/-/g, '+').replace(/_/g, '/');
    const claims = JSON.parse(atob(b64.padEnd(Math.ceil(b64.length / 4) * 4, '=')));
    if (claims.exp && claims.exp * 1000 < Date.now()) return null;
    const who = claims.sub || claims.user_id || claims.email;
    return who ? `b44:${who}` : null;
  } catch { return null; }
}

// What the desktop and phone apps are handed when they sign in through the
// browser (see desktopSignIn.js / phoneSignIn.js).
export function sessionHandoffToken(storage, fallback = null) {
  let token = null;
  try { token = storage ? storage.getItem('base44_access_token') : null; } catch { /* storage blocked */ }
  return token || fallback || null;
}

// Base44 sessions can be shared, so the browser keeps its sign-in.
export async function afterSessionHandoff() {}

// Which "Continue with ..." buttons work: Base44 offers both.
export async function signInOptions() {
  return { google: true, apple: true };
}
