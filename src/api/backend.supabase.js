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
import { createClient } from '@supabase/supabase-js';

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

let supabase = null;
const sb = () => (supabase ||= createClient(SUPABASE_URL, PUBLISHABLE_KEY, {
  auth: { flowType: 'pkce', persistSession: true, autoRefreshToken: true, detectSessionInUrl: false, storageKey: AUTH_STORAGE_KEY },
}));

const hasWindow = () => typeof window !== 'undefined';

// Finishes a sign-in that arrived in the address (a Google/Apple return or a
// desktop/phone hand-over) once, then tidies the address.
let ready = null;
function init() {
  ready ||= (async () => {
    if (!hasWindow()) return;
    const url = new URL(window.location.href);
    const q = url.searchParams;
    let changed = false;
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
  if (q.get(OAUTH_FLAG) === '1' && q.get('code')) return 'oauth-return';
  try {
    const saved = JSON.parse(window.localStorage.getItem(AUTH_STORAGE_KEY) || 'null');
    return saved?.refresh_token ? (saved.access_token || 'saved') : null;
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

function sameOriginPath(value, fallback = '/') {
  if (!hasWindow() || !value) return fallback;
  try {
    const u = new URL(value, window.location.origin);
    return u.origin === window.location.origin ? u.pathname + u.search + u.hash : fallback;
  } catch { return fallback; }
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
      // The emailed link comes back to /reset-password, already signed in for the reset.
      const { error } = await sb().auth.resetPasswordForEmail(String(email || '').trim(), {
        redirectTo: `${window.location.origin}/reset-password?token=session&${OAUTH_FLAG}=1`,
      });
      if (error) throw authError(error);
    },
    async resetPassword({ resetToken, newPassword }) {
      await init();
      if (resetToken && resetToken !== 'session') {
        const { error } = await sb().auth.verifyOtp({ token_hash: resetToken, type: 'recovery' });
        if (error) throw authError(error);
      }
      const { data } = await sb().auth.getSession();
      if (!data?.session) throw authError({ code: 'otp_expired' }, 400);
      const { error } = await sb().auth.updateUser({ password: newPassword });
      if (error) throw authError(error);
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
        InvokeLLM: async (params) => (await invoke('integrations', { action: 'llm', ...params })).data,
      },
    },
    users: {
      inviteUser: async (email, role) => (await invoke('integrations', { action: 'invite', email, role })).data,
    },
    app: { getPublicSettings: async () => ({ id: 'supabase', public_settings: {} }) },
  };
}
