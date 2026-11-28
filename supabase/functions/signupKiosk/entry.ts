import { createClientFromRequest } from '../_shared/base44-compat.ts';
import { secrets } from '../_shared/base44-compat.ts';
import { retry429 } from '../_shared/retry429.ts';
import { reserveAttempt } from '../_shared/atomicOps.ts';

// Sign-up day iPads (KioskDevice kiosk_type "signup"). Hotel staff sign
// themselves up on an iPad at the sign-up table; the admin's PC sees what is
// typed as it is typed and decides what the iPads show.
//
// Admin (an administrator, or the hotel's own approved manager):
//   { action: 'pair_start', company_id, label }  -> { device_id, pairing_code, expires_at }  (QR: /signup-kiosk#pair=CODE)
//   { action: 'list', company_id }               -> { kiosks: [{ id, label, online, live, screen }] }
//   { action: 'screen', device_id, screen }      -> show { kind: 'none'|'company_code'|'join_qr'|'message'|'start'|'lock', text }
//   { action: 'remove', device_id }              -> stop the iPad (it has to be connected again)
// iPad (device_id + device_token from pairKioskDevice):
//   { action: 'state' }                          -> { hotel, screen }
//   { action: 'live', step, draft }              -> what is on its screen now, for the admin's live view
//   { action: 'register', name, email, phone, employee_id } -> { person_ref, sign_in_code | existing, company_code }
//   { action: 'pickup', person_ref, pickup_name, pickup_lat, pickup_lng }
// Anyone (the phone's sign-in screen):
//   { action: 'redeem', code }                   -> { token_hash } (verifyOtp, type 'magiclink')
//
// A personal sign-in code is only ever made for an account this iPad has just
// created, so typing a colleague's email never gives a way into their account.

const SCREENS = ['none', 'company_code', 'join_qr', 'message', 'start', 'lock'];
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const CODE_PURPOSE = 'kiosk_sign_in';
const CODE_TTL_MS = 7 * 86400_000;
const ONLINE_MS = 30_000;
const PAIR_MS = 15 * 60_000;

const text = (v: unknown, max = 120) => String(v ?? '').replace(/[\u0000-\u001F\u007F<>]/g, '').trim().slice(0, max);
const emailOf = (v: unknown) => { const e = text(v, 160).toLowerCase(); return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) ? e : ''; };
const fail = (status: number, error: string, extra = {}) => Response.json({ error, ...extra }, { status });
async function digest(value: string) {
 const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
 return Array.from(new Uint8Array(bytes), (b) => b.toString(16).padStart(2, '0')).join('');
}
function sameDigest(a: unknown, b: string) {
 if (typeof a !== 'string' || a.length !== b.length) return false;
 let diff = 0;
 for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
 return diff === 0;
}
function randomFrom(alphabet: string, len: number) {
 let out = '';
 while (out.length < len) { const b = crypto.getRandomValues(new Uint8Array(1))[0]; if (b < alphabet.length * Math.floor(256 / alphabet.length)) out += alphabet[b % alphabet.length]; }
 return out;
}
// The code as typed on a phone: any case, with or without the dash or spaces.
export const normalCode = (v: unknown) => String(v ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
const shownCode = (c: string) => `${c.slice(0, 4)}-${c.slice(4)}`;

function adminApi() {
 const url = String(secrets.get('SUPABASE_URL') || '').replace(/\/+$/, '');
 let key = '';
 try { key = JSON.parse(secrets.get('SUPABASE_SECRET_KEYS') || '{}').default || ''; } catch { /* use the older key */ }
 key ||= secrets.get('SUPABASE_SERVICE_ROLE_KEY') || '';
 if (!/^https:\/\/[^/]+\.supabase\.co$/.test(url) || !key) return null;
 return { url, headers: { apikey: key, ...(key.startsWith('sb_secret_') ? {} : { Authorization: `Bearer ${key}` }), 'Content-Type': 'application/json' } };
}

// The same check pairKioskDevice and the other tablet functions make.
async function pairedSignupIpad(db: any, body: any) {
 const id = text(body.device_id, 80);
 const token = body.device_token;
 if (!id || typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token)) return null;
 const device = await retry429(async () => db.KioskDevice.get(id)).catch(() => null);
 if (!device || device.kiosk_type !== 'signup' || !device.paired || device.status !== 'active' || !device.company_id) return null;
 const credential = (await retry429(async () => db.DeviceCredential.filter({ device_id: device.id }, '-issued_at', 1)))[0];
 if (!credential || !(Date.parse(credential.expires_at) > Date.now())) return null;
 if (credential.company_id !== device.company_id || credential.kiosk_type !== 'signup') return null;
 if (!sameDigest(credential.pairing_code_hash, await digest(device.pairing_code || ''))) return null;
 return sameDigest(credential.token_hash, await digest(token)) ? device : null;
}

// An administrator, or the hotel's own approved manager.
async function mayRunHotel(db: any, user: any, companyId: string) {
 if (!user || !companyId) return false;
 if (user.role === 'admin') return true;
 if (user.role !== 'company') return false;
 const rows = await retry429(async () => db.CompanyMembership.filter({ user_id: user.id, company_id: companyId, scope: 'manager', active: true }, '-updated_date', 20));
 return rows.some((r: any) => r.company_id === companyId && r.active && (!r.expires_at || Date.parse(r.expires_at) > Date.now()));
}

function kioskView(d: any) {
 const live = d.signup_live && typeof d.signup_live === 'object' ? d.signup_live : null;
 return {
  id: d.id, label: d.label || 'Sign-up iPad', paired: !!d.paired, pairing_expires_at: d.paired ? null : d.pairing_expires_at || null,
  online: !!d.last_seen && Date.now() - Date.parse(d.last_seen) < ONLINE_MS, last_seen: d.last_seen || null,
  live, screen: d.signup_screen && typeof d.signup_screen === 'object' ? d.signup_screen : { kind: 'none' },
 };
}

export default async function(req: Request) {
 try {
  if (req.method !== 'POST') return fail(405, 'POST required');
  const base44 = createClientFromRequest(req);
  const db = base44.asServiceRole.entities;
  const body = await req.json().catch(() => ({}));
  const action = body.action;
  const now = new Date();

  // ---------- the phone's sign-in screen ----------
  if (action === 'redeem') {
   const forwarded = req.headers.get('x-forwarded-for') || '';
   const from = (req.headers.get('cf-connecting-ip') || forwarded.split(',')[0] || 'unknown').trim().slice(0, 64);
   if (!(await reserveAttempt(base44, 'kiosk-sign-in:' + from, 10, 15 * 60_000))) return fail(429, 'Too many tries. Wait 15 minutes, or sign in with your email.');
   const code = normalCode(body.code);
   const wrong = () => fail(404, "That code didn't work. Check it, or sign in with your email.");
   if (code.length !== 8) return wrong();
   const row = (await retry429(async () => db.VerificationGrant.filter({ token_hash: await digest(code) }, '-created_date', 1)))[0];
   if (!row || row.purpose !== CODE_PURPOSE) return wrong();
   await retry429(async () => db.VerificationGrant.delete(row.id)); // used once, whatever happens next
   if (!(Date.parse(row.expires_at) > Date.now())) return fail(410, 'That code has expired. Sign in with your email instead.');
   const account = await retry429(async () => db.User.get(row.member_user_id)).catch(() => null);
   if (!account || 'user:' + account.id !== row.subject || !['staff', 'passenger'].includes(account.role) || !account.email || account.disabled) return wrong();
   const api = adminApi();
   if (!api) return fail(503, 'Sign-in is not available right now. Sign in with your email.');
   const res = await fetch(api.url + '/auth/v1/admin/generate_link', { method: 'POST', headers: api.headers, redirect: 'error', signal: AbortSignal.timeout(15000), body: JSON.stringify({ type: 'magiclink', email: account.email }) });
   const link = await res.json().catch(() => ({}));
   const token_hash = link?.hashed_token || link?.properties?.hashed_token || '';
   if (!res.ok || !token_hash) return fail(503, 'Sign-in is not available right now. Sign in with your email.');
   return Response.json({ token_hash });
  }

  // ---------- the iPad ----------
  if (['state', 'live', 'register', 'pickup'].includes(action)) {
   const device = await pairedSignupIpad(db, body);
   if (!device) return fail(401, 'This iPad is not connected. Scan a new QR from the admin screen.', { code: 'NOT_PAIRED' });
   const company = await retry429(async () => db.Company.get(device.company_id)).catch(() => null);
   if (!company) return fail(404, 'This hotel was removed. Connect the iPad again.', { code: 'NOT_PAIRED' });

   if (action === 'state') {
    await retry429(async () => db.KioskDevice.update(device.id, { last_seen: now.toISOString() }));
    const screen = device.signup_screen && typeof device.signup_screen === 'object' ? device.signup_screen : { kind: 'none' };
    // The company code goes to the screen only while the admin shows it.
    const shows = ['company_code', 'join_qr'].includes(screen.kind);
    return Response.json({ hotel: { name: company.name || '', logo_url: company.logo_url || '' }, screen: { ...screen, company_code: shows ? company.access_code || '' : undefined } });
   }

   if (action === 'live') {
    const d = body.draft && typeof body.draft === 'object' ? body.draft : {};
    const live = { step: text(body.step, 20), at: now.toISOString(), draft: { name: text(d.name, 120), email: text(d.email, 160), phone: text(d.phone, 40), employee_id: text(d.employee_id, 40), pickup_name: text(d.pickup_name, 120) } };
    await retry429(async () => db.KioskDevice.update(device.id, { signup_live: live, last_seen: now.toISOString() }));
    return Response.json({ ok: true });
   }

   if (action === 'register') {
    const name = text(body.name, 120), email = emailOf(body.email), phone = text(body.phone, 40), employeeId = text(body.employee_id, 40);
    if (!name) return fail(400, 'Type your name');
    if (!email) return fail(400, 'Type your email address');
    // Their entry on the hotel's sign-up list (the same record Sign-up day adds).
    const contacts = (await retry429(async () => db.Contact.filter({ company_id: company.id }, '-updated_date', 5000)))
     .filter((c: any) => c.company_id === company.id && ['staff', 'passenger'].includes(c.type || 'staff') && emailOf(c.email) === email);
    let contact = contacts[0];
    if (contact) await retry429(async () => db.Contact.update(contact.id, { name, phone: phone || contact.phone || '', employee_id: employeeId || contact.employee_id || '' }));
    else contact = await retry429(async () => db.Contact.create({ name, email, phone, employee_id: employeeId, type: 'staff', company_id: company.id, company_name: company.name || '' }));
    const result: any = { ok: true, person_ref: 'email:' + email, company_code: company.access_code || '' };
    // An account for them, unless they have one already.
    const existing = (await retry429(async () => db.User.filter({ email }, '-updated_date', 5))).filter((u: any) => emailOf(u.email) === email);
    if (existing.length) {
     result.existing = true;
    } else {
     const api = adminApi();
     let created = false;
     if (api) {
      const res = await fetch(api.url + '/auth/v1/admin/users', { method: 'POST', headers: api.headers, redirect: 'error', signal: AbortSignal.timeout(15000), body: JSON.stringify({ email, email_confirm: true, user_metadata: { full_name: name } }) });
      await res.body?.cancel().catch(() => {});
      created = res.ok;
      if (!res.ok) result.existing = res.status === 422; // a sign-in with this email already exists
     }
     // The new sign-in makes its app account (link_app_user); give it a moment.
     let account = null;
     for (let i = 0; created && !account && i < 5; i++) {
      account = (await retry429(async () => db.User.filter({ email }, '-updated_date', 5))).find((u: any) => emailOf(u.email) === email) || null;
      if (!account) await new Promise((r) => setTimeout(r, 400));
     }
     if (account) {
      if (!['admin', 'company', 'driver', 'mechanic'].includes(account.role)) {
       await retry429(async () => db.User.update(account.id, { role: 'staff', full_name: name, display_name: name, phone }));
       await retry429(async () => db.CompanyMembership.create({ user_id: account.id, company_id: company.id, scope: 'passenger', active: true, code_hash: await digest(company.access_code || '') }));
       const code = randomFrom(CODE_ALPHABET, 8);
       await retry429(async () => db.VerificationGrant.create({ token_hash: await digest(code), purpose: CODE_PURPOSE, subject: 'user:' + account.id, member_user_id: account.id, company_id: company.id, device_id: device.id, expires_at: new Date(Date.now() + CODE_TTL_MS).toISOString() }));
       result.sign_in_code = shownCode(code);
      }
     } else if (!result.existing) result.account_later = true; // they make one on their phone; the list links it
    }
    await retry429(async () => db.AuditLog.create({ action: 'create', entity: 'Contact', record_id: contact.id, page: '/signup-kiosk', actor_email: '', actor_name: device.label || 'Sign-up iPad', actor_role: 'kiosk', summary: `Sign-up iPad: ${name} signed up for ${company.name || 'the hotel'}${result.sign_in_code ? ', account made' : ''}` })).catch(() => {});
    return Response.json(result);
   }

   if (action === 'pickup') {
    const email = String(body.person_ref || '').startsWith('email:') ? emailOf(String(body.person_ref).slice(6)) : '';
    const lat = Number(body.pickup_lat), lng = Number(body.pickup_lng), pickupName = text(body.pickup_name, 120);
    if (!email) return fail(400, 'Sign up first');
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180 || !pickupName) return fail(400, 'Choose your pickup spot on the map and give it a name');
    const patch = { pickup_name: pickupName, pickup_lat: lat, pickup_lng: lng };
    const contacts = (await retry429(async () => db.Contact.filter({ company_id: company.id }, '-updated_date', 5000))).filter((c: any) => c.company_id === company.id && emailOf(c.email) === email);
    if (!contacts.length) return fail(404, 'Sign up first');
    for (const c of contacts) await retry429(async () => db.Contact.update(c.id, patch));
    // Their new passenger account, when this iPad made one.
    for (const u of (await retry429(async () => db.User.filter({ email }, '-updated_date', 5))).filter((u: any) => emailOf(u.email) === email && ['staff', 'passenger'].includes(u.role) && u.pickup_lat == null)) {
     await retry429(async () => db.User.update(u.id, { ...patch, pickup_route_id: '' }));
    }
    return Response.json({ ok: true });
   }
  }

  // ---------- the admin's PC ----------
  const user = await base44.auth.me().catch(() => null);
  if (!user) return fail(401, 'Sign in to continue');
  if (action === 'pair_start') {
   const companyId = text(body.company_id, 80);
   if (!(await mayRunHotel(db, user, companyId))) return fail(403, 'You can only connect iPads for your own hotel');
   const company = await retry429(async () => db.Company.get(companyId)).catch(() => null);
   if (!company) return fail(404, 'Hotel not found');
   const count = (await retry429(async () => db.KioskDevice.filter({ company_id: companyId, kiosk_type: 'signup' }, '-created_date', 200))).length;
   const pairing_code = randomFrom('ABCDEFGHJKLMNPQRSTUVWXYZ0123456789', 12);
   const expires_at = new Date(Date.now() + PAIR_MS).toISOString();
   const device = await retry429(async () => db.KioskDevice.create({
    kiosk_type: 'signup', label: text(body.label, 60) || `Sign-up iPad ${count + 1}`, company_id: companyId, company_name: company.name || '',
    status: 'active', paired: false, pairing_code, pairing_expires_at: expires_at, signup_screen: { kind: 'none', at: now.toISOString() },
   }));
   return Response.json({ device_id: device.id, pairing_code, expires_at });
  }
  const device = body.device_id ? await retry429(async () => db.KioskDevice.get(text(body.device_id, 80))).catch(() => null) : null;
  if (action === 'list') {
   const companyId = text(body.company_id, 80);
   if (!(await mayRunHotel(db, user, companyId))) return fail(403, 'You can only see your own hotel');
   const rows = (await retry429(async () => db.KioskDevice.filter({ company_id: companyId, kiosk_type: 'signup' }, '-created_date', 200)))
    .filter((d: any) => d.company_id === companyId && d.kiosk_type === 'signup' && d.status === 'active' && (d.paired || Date.parse(d.pairing_expires_at) > Date.now()));
   return Response.json({ kiosks: rows.map(kioskView) });
  }
  if (!device || device.kiosk_type !== 'signup' || !(await mayRunHotel(db, user, device.company_id))) return fail(404, 'iPad not found');
  if (action === 'screen') {
   const s = body.screen && typeof body.screen === 'object' ? body.screen : {};
   if (!SCREENS.includes(s.kind)) return fail(400, 'Unknown screen');
   const screen = { kind: s.kind, text: text(s.text, 200), at: now.toISOString(), by: text(user.display_name || user.full_name || user.email, 80) };
   await retry429(async () => db.KioskDevice.update(device.id, { signup_screen: screen }));
   return Response.json({ ok: true, screen });
  }
  if (action === 'remove') {
   await retry429(async () => db.KioskDevice.update(device.id, { status: 'revoked', paired: false, signup_live: null }));
   for (const c of await retry429(async () => db.DeviceCredential.filter({ device_id: device.id }, '-issued_at', 10))) await retry429(async () => db.DeviceCredential.delete(c.id));
   return Response.json({ ok: true });
  }
  return fail(400, 'Unknown action');
 } catch (error) {
  const status = Number((error as any)?.status) || 500;
  return fail(status >= 500 ? 500 : status, status >= 500 ? 'Something went wrong. Try again.' : String((error as any)?.message || 'Request refused'));
 }
}
