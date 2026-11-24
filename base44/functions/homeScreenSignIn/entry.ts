import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';
import { secrets } from 'base44:runtime';
import { retry429 } from '../../shared/retry429.ts';

// iPhone: an app added to the Home Screen starts with its own empty storage,
// so staff who had signed in (and joined their company) in Safari were asked
// to sign in again, and could lose a join that hadn't finished. While a
// passenger is signed in in Safari the page gets a one-time code that the Home
// Screen icon opens with (issue); the Home Screen app's first open swaps it for
// a sign-in (redeem). Their company then comes back from their membership.
//
// A code: 256 random bits, kept only as a hash, works once, for 30 minutes,
// and only for a passenger login (never admin, office, driver or manager).
//
//   { action: 'issue' }            signed in  -> { code, expires_at }
//   { action: 'redeem', code }     no sign-in -> { token_hash } (verifyOtp, type 'magiclink')

const PURPOSE = 'home_screen_sign_in';
const TTL_MS = 30 * 60_000;
const PASSENGER = ['staff', 'passenger'];

async function hash(value: string) {
 const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
 return Array.from(new Uint8Array(bytes), (b) => b.toString(16).padStart(2, '0')).join('');
}
const randomCode = () => Array.from(crypto.getRandomValues(new Uint8Array(32)), (b) => b.toString(16).padStart(2, '0')).join('');

function adminApi() {
 const url = String(secrets.get('SUPABASE_URL') || '').replace(/\/+$/, '');
 let key = '';
 try { key = JSON.parse(secrets.get('SUPABASE_SECRET_KEYS') || '{}').default || ''; } catch { /* use the older key */ }
 key ||= secrets.get('SUPABASE_SERVICE_ROLE_KEY') || '';
 if (!/^https:\/\/[^/]+\.supabase\.co$/.test(url) || !key) return null;
 return { url, headers: { apikey: key, ...(key.startsWith('sb_secret_') ? {} : { Authorization: `Bearer ${key}` }), 'Content-Type': 'application/json' } };
}

const unusable = () => Response.json({ error: 'This Home Screen sign-in has expired. Sign in to continue.', code: 'CODE_UNUSABLE' }, { status: 410 });

export default async function(req) {
 try {
  const base44 = createClientFromRequest(req);
  const db = base44.asServiceRole.entities;
  const body = await req.json().catch(() => ({}));

  if (body.action === 'issue') {
   const user = await base44.auth.me().catch(() => null);
   if (!user) return Response.json({ error: 'Sign in to continue' }, { status: 401 });
   const account = await retry429(async () => db.User.get(user.id)).catch(() => null);
   if (!account || !PASSENGER.includes(account.role) || !account.email) return Response.json({ code: null });
   const subject = 'user:' + account.id;
   // One live code per person: a new one replaces the last.
   for (const row of await retry429(async () => db.VerificationGrant.filter({ purpose: PURPOSE, subject }, '-created_date', 20))) {
    if (row.purpose === PURPOSE && row.subject === subject) await retry429(async () => db.VerificationGrant.delete(row.id));
   }
   const code = randomCode();
   const expires_at = new Date(Date.now() + TTL_MS).toISOString();
   await retry429(async () => db.VerificationGrant.create({ token_hash: await hash(code), purpose: PURPOSE, subject, member_user_id: account.id, expires_at }));
   return Response.json({ code, expires_at });
  }

  if (body.action === 'redeem') {
   const code = typeof body.code === 'string' && /^[a-f0-9]{64}$/.test(body.code) ? body.code : '';
   if (!code) return unusable();
   const rows = await retry429(async () => db.VerificationGrant.filter({ token_hash: await hash(code) }, '-created_date', 1));
   const row = rows[0];
   if (!row || row.purpose !== PURPOSE) return unusable();
   // Used once, whatever happens next.
   await retry429(async () => db.VerificationGrant.delete(row.id));
   if (!(Date.parse(row.expires_at) > Date.now())) return unusable();
   const account = await retry429(async () => db.User.get(row.member_user_id)).catch(() => null);
   if (!account || 'user:' + account.id !== row.subject || !PASSENGER.includes(account.role) || !account.email || account.disabled) return unusable();
   const api = adminApi();
   if (!api) return Response.json({ error: 'Sign-in is not available right now. Sign in to continue.' }, { status: 503 });
   const res = await fetch(api.url + '/auth/v1/admin/generate_link', {
    method: 'POST', headers: api.headers, redirect: 'error', signal: AbortSignal.timeout(15000),
    body: JSON.stringify({ type: 'magiclink', email: account.email }),
   });
   const link = await res.json().catch(() => ({}));
   const token_hash = link?.hashed_token || link?.properties?.hashed_token || '';
   if (!res.ok || typeof token_hash !== 'string' || !token_hash) {
    console.warn(`[homeScreenSignIn] could not make a sign-in (${res.status})`);
    return Response.json({ error: 'Sign-in is not available right now. Sign in to continue.' }, { status: 503 });
   }
   return Response.json({ token_hash });
  }

  return Response.json({ error: 'Unknown action' }, { status: 400 });
 } catch {
  return Response.json({ error: 'Something went wrong. Sign in to continue.' }, { status: 500 });
 }
}
