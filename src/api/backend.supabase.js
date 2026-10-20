// The app's backend client on Supabase (step 7 of the move from Base44).
// Used by `vite build --mode supabase` (the Cloudflare build); the normal build
// keeps backend.base44.js. It answers the same calls the app already makes on
// the Base44 client, so the screens don't change:
//   auth.*                 Supabase Auth (email + password with a code,
//                          Google/Apple, password reset)
//   functions.invoke       the same functions, on Supabase Edge Functions
//   integrations.Core.*    uploads, private-file links and the admin assistant,
//                          through the `integrations` function
//   users.inviteUser       through the `integrations` function
// Records (base44.entities) already go through the entityAccess function
// (src/lib/scopedEntities.js), so the browser never reads the database itself.
// Only the sign-in part of Supabase is loaded (@supabase/auth-js): the browser
// never uses the database, realtime or storage clients, so the full
// supabase-js package would add ~110 KB to the first download for nothing.
import { AuthClient } from '@supabase/auth-js';

export const BACKEND = 'supabase';

// The project's address and its publishable key are public by design: the
// browser sends them with every request, and they open nothing by themselves
// (every table is locked; the functions check who is asking).
const SUPABASE_URL = String(import.meta.env.VITE_SUPABASE_URL || 'https://ghqpznxqngvhmkiwcauj.supabase.co').replace(/\/+$/, '');
const PUBLISHABLE_KEY = String(import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_XeQJGv6I-Yicnl3WAu659g_Q7AqBc2C');
const REF = (() => { try { return new URL(SUPABASE_URL).hostname.split('.')[0]; } catch { return 'app'; } })();
export const AUTH_STORAGE_KEY = `sb-${REF}-auth-token`;
// A sign-in handed over by the desktop or phone app: "<access JWT>~<refresh token>".
const HANDOFF = /^([A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)~([A-Za-z0-9_-]{8,512})$/;
// Marks our own return from Google/Apple, so another ?code= is never taken for one.
const OAUTH_FLAG = 'tt_oauth';
const FUNCTION_NAME = /^[A-Za-z][A-Za-z0-9_-]{0,63}$/;
const PROVIDERS = { google: 'google', apple: 'apple', microsoft: 'azure', facebook: 'facebook' };

// The same settings supabase-js's createClient would hand its auth client.
const authClient = (settings) => ({
  auth: new AuthClient({
    url: `${SUPABASE_URL}/auth/v1`,
    headers: { Authorization: `Bearer ${PUBLISHABLE_KEY}`, apikey: PUBLISHABLE_KEY },
    ...settings,
  }),
});

let supabase = null;
const sb = () => (supabase ||= authClient({
  flowType: 'pkce', persistSession: true, autoRefreshToken: true, detectSessionInUrl: false, storageKey: AUTH_STORAGE_KEY,
}));

// "Forgot password" emails are asked for without PKCE, so the email's one-time
// key isn't tied to the browser that asked: the person can open it on their
// phone. (Signing in with Google/Apple still uses PKCE above.)
let recoveryClient = null;
const sbRecovery = () => (recoveryClient ||= authClient({
  flowType: 'implicit', persistSession: false, autoRefreshToken: false, detectSessionInUrl: false, storageKey: `${AUTH_STORAGE_KEY}-recovery`,
}));

const hasWindow = () => typeof window !== 'undefined';

// A reset or invite link from Supabase's standard email lands on the site with
// the sign-in in the address: #access_token=...&refresh_token=...&type=recovery.
// (The McSween emails link straight to /reset-password instead; this keeps the
// standard ones working too.) Returns the sign-in and the page to open, or null.
export function linkLanding(hash) {
  const h = new URLSearchParams(String(hash || '').replace(/^#/, ''));
  const type = h.get('type');
  const access_token = h.get('access_token') || '';
  const refresh_token = h.get('refresh_token') || '';
  if (type !== 'recovery' && type !== 'invite') return null;
  if (!/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(access_token) || !/^[A-Za-z0-9_-]{8,512}$/.test(refresh_token)) return null;
  return { access_token, refresh_token, next: `/reset-password?token=session${type === 'invite' ? '&type=invite' : ''}` };
}

// Finishes a sign-in that arrived in the address (a Google/Apple return or a
// desktop/phone hand-over) once, then tidies the address.
let ready = null;
function init() {
  ready ||= (async () => {
    if (!hasWindow()) return;
    const url = new URL(window.location.href);
    const q = url.searchParams;
    let changed = false;
    const landing = linkLanding(url.hash);
    if (landing) {
      const { error } = await sb().auth.setSession({ access_token: landing.access_token, refresh_token: landing.refresh_token })
        .catch((e) => ({ error: e }));
      window.location.replace(error ? '/forgot-password' : landing.next);
      return;
    }
    if (q.get('clear_access_token') === 'true') {
      await sb().auth.signOut({ scope: 'local' }).catch(() => {});
      q.delete('clear_access_token'); changed = true;
    }
    if (q.has('access_token')) {
      const handoff = HANDOFF.exec(q.get('access_token') || '');
      if (handoff) await sb().auth.setSession({ access_token: handoff[1], refresh_token: handoff[2] }).catch(() => {});
      q.delete('access_token'); changed = true;
    }
    if (q.get(OAUTH_FLAG) === '1') {
      const code = q.get('code');
      if (code) await sb().auth.exchangeCodeForSession(code).catch(() => {});
      for (const k of [OAUTH_FLAG, 'code', 'error', 'error_code', 'error_description']) q.delete(k);
      changed = true;
    }
    if (changed) window.history.replaceState(window.history.state, '', url.pathname + (q.toString() ? `?${q}` : '') + url.hash);
  })();
  return ready;
}

async function accessToken() {
  await init();
  const { data } = await sb().auth.getSession();
  return data?.session?.access_token || null;
}

// The saved sign-in, read straight away so the first screen knows whether to check it.
export function storedAccessToken() {
  if (!hasWindow()) return null;
  const q = new URLSearchParams(window.location.search);
  if (q.get('clear_access_token') === 'true') return null;
  if (HANDOFF.test(q.get('access_token') || '')) return 'handoff';
  if (linkLanding(window.location.hash)) return 'email-link';
  if (q.get(OAUTH_FLAG) === '1' && q.get('code')) return 'oauth-return';
  try {
    const saved = JSON.parse(window.localStorage.getItem(AUTH_STORAGE_KEY) || 'null');
    return saved?.refresh_token ? (saved.access_token || 'saved') : null;
  } catch { return null; }
}

// Who the saved sign-in belongs to, so a profile saved on this device is only
// reused for the same person. Null while a new sign-in is arriving in the
// address (hand-over, Google/Apple return, email link): that one isn't saved yet.
export function sessionSubject() {
  const token = storedAccessToken();
  if (!token || token === 'handoff' || token === 'oauth-return' || token === 'email-link') return null;
  try {
    const saved = JSON.parse(window.localStorage.getItem(AUTH_STORAGE_KEY) || 'null');
    return saved?.refresh_token && saved?.user?.id ? `sb:${saved.user.id}` : null;
  } catch { return null; }
}

// What the desktop and phone apps are handed: this browser's whole session.
export function sessionHandoffToken(storage) {
  try {
    const saved = JSON.parse(storage?.getItem(AUTH_STORAGE_KEY) || 'null');
    const token = saved?.access_token && saved?.refresh_token ? `${saved.access_token}~${saved.refresh_token}` : null;
    return token && HANDOFF.test(token) ? token : null;
  } catch { return null; }
}

// After handing the session to the desktop/phone app this browser lets go of it
// (without ending it), so the two never refresh the same sign-in and cancel it.
export async function afterSessionHandoff() {
  await sb().auth.signOut({ scope: 'local' }).catch(() => {});
}

// Which "Continue with ..." buttons work: the providers turned on in the
// Supabase dashboard (Authentication -> Sign In / Providers). Null when it
// can't be read (offline), so the screen keeps what it showed last time.
export async function signInOptions(fetchImpl = globalThis.fetch) {
  try {
    const res = await fetchImpl(`${SUPABASE_URL}/auth/v1/settings`, { headers: { apikey: PUBLISHABLE_KEY } });
    if (!res.ok) return null;
    const external = (await res.json())?.external || {};
    return { google: external.google === true, apple: external.apple === true };
  } catch {
    return null;
  }
}

function apiError(status, data, fallback) {
  const body = data && typeof data === 'object' ? data : { error: String(data || '') };
  const message = body.error || body.message || fallback;
  return Object.assign(new Error(message), { status, data: body, response: { status, data: body } });
}

const AUTH_MESSAGES = {
  invalid_credentials: 'Invalid email or password',
  email_not_confirmed: 'Please confirm your email with the code we sent first',
  user_already_exists: 'An account with this email already exists. Sign in instead.',
  email_exists: 'An account with this email already exists. Sign in instead.',
  otp_expired: 'That code has expired or was already used. Ask for a new one.',
  over_email_send_rate_limit: 'Too many emails were sent. Wait a minute and try again.',
  over_request_rate_limit: 'Too many tries. Wait a minute and try again.',
  same_password: 'Choose a password different from your current one.',
};
function authError(error, status) {
  const code = error?.code || '';
  const message = AUTH_MESSAGES[code] || error?.message || 'Sign-in failed';
  const s = status || error?.status || 400;
  return apiError(s, { error: message, code }, message);
}

// A reset or invite link that can't be used (any more).
const LINK_USED = 'This link has expired or was already used. Ask for a new one.';
function linkError(error) {
  const code = error?.code || '';
  return code === 'otp_expired' || code === 'flow_state_expired' || code === 'flow_state_not_found'
    ? apiError(400, { error: LINK_USED, code: 'otp_expired' }, LINK_USED)
    : authError(error);
}
// The link this page already used, so a second try (say, the first password
// was too short) doesn't ask Supabase for it again.
let usedLink = null;

function sameOriginPath(value, fallback = '/') {
  if (!hasWindow() || !value) return fallback;
  try {
    const u = new URL(value, window.location.origin);
    return u.origin === window.location.origin ? u.pathname + u.search + u.hash : fallback;
  } catch { return fallback; }
}

// Inside McSween Transport Desktop, Google and Apple refuse to sign in within
// the app's own window. The installed desktop app watches for the Base44
// sign-in addresses and then signs in through the person's browser instead
// (/desktop-signin, desktop/browser-signin.cjs), so in the desktop app the
// buttons go to one of those addresses rather than straight to Supabase.
// Null outside the desktop app.
export function desktopProviderUrl(provider, fromUrl = '/', win = hasWindow() ? window : null) {
  const inDesktop = Boolean(win?.transittrackDesktop) || /Electron\//i.test(win?.navigator?.userAgent || '');
  if (!inDesktop || !PROVIDERS[provider]) return null;
  const u = new URL(provider === 'google' ? '/api/apps/auth/login' : `/api/apps/auth/${provider}/login`, win.location.origin);
  let back = '/';
  try {
    const target = new URL(fromUrl || '/', win.location.origin);
    if (target.origin === win.location.origin) back = target.pathname + target.search;
  } catch { /* keep '/' */ }
  u.searchParams.set('from_url', new URL(back, win.location.origin).href);
  return u.href;
}

async function invoke(name, payload = {}) {
  if (!FUNCTION_NAME.test(String(name))) throw apiError(400, { error: 'Unknown function' }, 'Unknown function');
  const token = await accessToken();
  const form = typeof FormData !== 'undefined' && payload instanceof FormData;
  let res;
  try {
    res = await fetch(`${SUPABASE_URL}/functions/v1/${name}`, {
      method: 'POST',
      headers: {
        apikey: PUBLISHABLE_KEY,
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(form ? {} : { 'Content-Type': 'application/json' }),
      },
      body: form ? payload : JSON.stringify(payload ?? {}),
    });
  } catch (error) {
    throw Object.assign(new Error('No connection'), { originalError: error });
  }
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!res.ok) {
    const error = apiError(res.status, data, `Request failed (${res.status})`);
    error.response.headers = res.headers;
    throw error;
  }
  return { data, status: res.status, headers: res.headers };
}

async function upload(area, params) {
  const file = params?.file;
  if (typeof Blob === 'undefined' || !(file instanceof Blob)) throw apiError(400, { error: 'No file' }, 'No file');
  const form = new FormData();
  form.append('area', area);
  form.append('file', file, file.name || 'file');
  return (await invoke('integrations', form)).data;
}

export function createBackend() {
  if (hasWindow()) void init();
  const auth = {
    async me() {
      const { data } = await invoke('entityAccess', { entity: 'User', operation: 'get', id: 'me' });
      return data.result;
    },
    async isAuthenticated() { return !!(await accessToken()); },
    async setToken(token) {
      const handoff = HANDOFF.exec(String(token || ''));
      if (handoff) await sb().auth.setSession({ access_token: handoff[1], refresh_token: handoff[2] });
      // A bare access token (e.g. from verifyOtp) is already the current session.
    },
    async loginViaEmailPassword(email, password) {
      const { data, error } = await sb().auth.signInWithPassword({ email: String(email || '').trim(), password });
      if (error) throw authError(error);
      return { access_token: data.session?.access_token, user: data.user };
    },
    async loginWithProvider(provider, fromUrl = '/') {
      const id = PROVIDERS[provider];
      if (!id) throw apiError(400, { error: 'That sign-in option is not available' }, 'Unknown provider');
      const desktop = desktopProviderUrl(provider, fromUrl);
      if (desktop) { window.location.assign(desktop); return; }
      const back = new URL(sameOriginPath(fromUrl), window.location.origin);
      back.searchParams.set(OAUTH_FLAG, '1');
      const { error } = await sb().auth.signInWithOAuth({ provider: id, options: { redirectTo: back.href } });
      if (error) throw authError(error);
    },
    async register({ email, password, full_name }) {
      const { data, error } = await sb().auth.signUp({
        email: String(email || '').trim(),
        password,
        options: { data: full_name ? { full_name } : undefined, emailRedirectTo: `${window.location.origin}/login` },
      });
      if (error) throw authError(error);
      // Supabase answers a repeat sign-up without saying so; this is how it shows.
      if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
        throw authError({ code: 'user_already_exists' }, 409);
      }
      return { user: data.user };
    },
    async verifyOtp({ email, otpCode }) {
      const { data, error } = await sb().auth.verifyOtp({ email: String(email || '').trim(), token: String(otpCode || '').trim(), type: 'signup' });
      if (error) throw authError(error);
      return { access_token: data.session?.access_token, user: data.user };
    },
    async resendOtp(email) {
      const { error } = await sb().auth.resend({ type: 'signup', email: String(email || '').trim() });
      if (error) throw authError(error);
    },
    async resetPasswordRequest(email) {
      // The email (tools/supabase/auth-emails.mjs) links to <this site>/reset-password
      // with a one-time key that is only used when the new password is saved, so
      // it works in any browser and mail scanners that open links can't spend it.
      const { error } = await sbRecovery().auth.resetPasswordForEmail(String(email || '').trim(), {
        redirectTo: window.location.origin,
      });
      if (error) throw authError(error);
    },
    // Also finishes an invitation: the invite email links here with type=invite.
    async resetPassword({ resetToken, newPassword }) {
      await init();
      if (resetToken && resetToken !== 'session' && resetToken !== usedLink) {
        const invited = hasWindow() && new URLSearchParams(window.location.search).get('type') === 'invite';
        const { error } = await sb().auth.verifyOtp({ token_hash: resetToken, type: invited ? 'invite' : 'recovery' });
        if (error) throw linkError(error);
        usedLink = resetToken;
      }
      const { data } = await sb().auth.getSession();
      if (!data?.session) throw linkError({ code: 'otp_expired' });
      const { error } = await sb().auth.updateUser({ password: newPassword });
      if (error) throw authError(error);
      usedLink = null;
      await sb().auth.signOut({ scope: 'local' }).catch(() => {});
    },
    async changePassword({ currentPassword, newPassword }) {
      const { data } = await sb().auth.getSession();
      const email = data?.session?.user?.email;
      if (!email) throw apiError(401, { error: 'Sign in again to change your password' }, 'Not signed in');
      const check = await sb().auth.signInWithPassword({ email, password: currentPassword });
      if (check.error) throw apiError(400, { error: 'Your current password is incorrect' }, 'Wrong password');
      const { error } = await sb().auth.updateUser({ password: newPassword });
      if (error) throw authError(error);
    },
    async logout(redirectUrl) {
      await sb().auth.signOut({ scope: 'local' }).catch(() => {});
      if (redirectUrl && hasWindow()) window.location.href = redirectUrl;
    },
    redirectToLogin(nextUrl) {
      if (!hasWindow()) return;
      window.location.href = `/login?returnTo=${encodeURIComponent(sameOriginPath(nextUrl || window.location.href))}`;
    },
  };
  return {
    auth,
    functions: { invoke },
    integrations: {
      Core: {
        UploadFile: (params) => upload('public', params),
        UploadPublicFile: (params) => upload('public', params),
        UploadPrivateFile: (params) => upload('private', params),
        CreateFileSignedUrl: async (params) => (await invoke('integrations', { action: 'sign', ...params })).data,
      },
    },
    users: {
      inviteUser: async (email, role) => (await invoke('integrations', { action: 'invite', email, role })).data,
    },
    app: { getPublicSettings: async () => ({ id: 'supabase', public_settings: {} }) },
  };
}
