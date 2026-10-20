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

// What the desktop and phone apps are handed when they sign in through the
// browser (see desktopSignIn.js / phoneSignIn.js).
export function sessionHandoffToken(storage, fallback = null) {
  let token = null;
  try { token = storage ? storage.getItem('base44_access_token') : null; } catch { /* storage blocked */ }
  return token || fallback || null;
}
