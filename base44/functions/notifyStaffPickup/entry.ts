import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';


async function liveMembership(base44, row) {
 if (!row.expires_at && !row.code_hash) return true; // Explicit admin approval.
 if (!row.code_hash || (row.scope !== 'passenger' && !(Date.parse(row.expires_at) > Date.now()))) return false;
 const company=await base44.asServiceRole.entities.Company.get(row.company_id).catch(()=>null);
 if(!company) return false;
 const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(company.access_code || ''));
 const hash=Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('');
 return row.code_hash===hash;
}

async function approvedCompanies(base44, user, scope) {
  const rows = await base44.asServiceRole.entities.CompanyMembership.filter({ user_id: user.id, active: true }, '-updated_date', 100);
  const approved=[];
  for(const row of rows) if(row.scope === (scope || (user.role === 'company' ? 'manager' : 'passenger')) && await liveMembership(base44,row)) approved.push(row.company_id);
  return approved;
}
async function approvedStaffIds(base44, companyId) {
  const rows = await base44.asServiceRole.entities.CompanyMembership.filter({ company_id: companyId, active: true, scope: 'passenger' }, '-updated_date', 5000);
  const ids=new Set();
  for(const row of rows) if(await liveMembership(base44,row)) ids.add(row.user_id);
  return ids;
}
import { secrets } from 'base44:runtime';
import { reserveAttempt } from '../../shared/atomicOps.ts';
import { pushWithPolicy, emailWithPolicy } from '../../shared/notificationPolicy.ts';

// --- Firebase Cloud Messaging (push) helpers ---
// Functions can't share files across function boundaries in this runtime, so
// this small helper is duplicated here and in driverSession/entry.ts.
function base64UrlEncode(bytes) {
  const arr = new Uint8Array(bytes);
  let binary = '';
  for (let i = 0; i < arr.length; i++) binary += String.fromCharCode(arr[i]);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function pemToArrayBuffer(pem) {
  const b64 = pem.replace(/-----BEGIN PRIVATE KEY-----/, '').replace(/-----END PRIVATE KEY-----/, '').replace(/\s+/g, '');
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}
async function getFcmAccessToken(serviceAccount) {
  const { client_email, private_key, token_uri } = serviceAccount;
  const now = Math.floor(Date.now() / 1000);
  const encoder = new TextEncoder();
  const headerB64 = base64UrlEncode(encoder.encode(JSON.stringify({ alg: 'RS256', typ: 'JWT' })));
  const claimsB64 = base64UrlEncode(encoder.encode(JSON.stringify({
    iss: client_email, scope: 'https://www.googleapis.com/auth/firebase.messaging',
    aud: token_uri, exp: now + 3600, iat: now,
  })));
  const signingInput = `${headerB64}.${claimsB64}`;
  const cryptoKey = await crypto.subtle.importKey('pkcs8', pemToArrayBuffer(private_key), { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
  const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', cryptoKey, encoder.encode(signingInput));
  const jwt = `${signingInput}.${base64UrlEncode(signature)}`;
  const res = await fetch(token_uri, {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=${encodeURIComponent('urn:ietf:params:oauth:grant-type:jwt-bearer')}&assertion=${encodeURIComponent(jwt)}`,
  });
  const data = await res.json();
  if (!res.ok || !data.access_token) throw new Error(`FCM auth failed: ${data.error_description || data.error || res.status}`);
  return data.access_token;
}
async function sendPushToToken(serviceAccountJson, token, payload) {
  try {
    const serviceAccount = JSON.parse(serviceAccountJson);
    const accessToken = await getFcmAccessToken(serviceAccount);
    const res = await fetch(`https://fcm.googleapis.com/v1/projects/${serviceAccount.project_id}/messages:send`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({ message: { token, notification: { title: payload.title, body: payload.body }, data: payload.data || {}, webpush: { fcm_options: { link: '/' } } } }),
    });
    return res.ok;
  } catch { return false; }
}
async function sendPushToTokens(serviceAccountJson, tokens, payload) {
  const results = await Promise.all(tokens.map((t) => sendPushToToken(serviceAccountJson, t, payload)));
  return { sent: results.filter(Boolean).length };
}

const ALLOWED_ROLES = ['driver', 'company', 'admin'];

// Strip control characters and angle brackets so no field can inject markup/headers.
function sanitize(value) {
  if (value == null) return '';
  return String(value)
    .replace(/[\u0000-\u001F\u007F]/g, '')
    .replace(/[<>]/g, '')
    .trim();
}

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch((e) => { const s = e?.status ?? e?.response?.status; if (s === 401 || s === 403) return null; throw e; }); // no session: signed out; an outage stays an error
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (!ALLOWED_ROLES.includes(user.role)) {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await req.json();
    const to = sanitize(body?.to_email);
    const vehicleId = sanitize(body?.vehicle_id);
    if (!to) return Response.json({ error: 'Missing recipient' }, { status: 400 });
    if (!vehicleId) return Response.json({ error: 'Missing vehicle' }, { status: 400 });

    // Resolve the vehicle from trusted server data — names must never come from the request body.
    const vehicle = await base44.asServiceRole.entities.Vehicle.get(vehicleId);
    if (!vehicle) return Response.json({ error: 'Vehicle not found' }, { status: 404 });

    // Authorization: the caller may only notify about a vehicle they operate.
    const isAuthorized =
      user.role === 'admin' ||
      (user.role === 'company' && (await approvedCompanies(base44, user)).includes(vehicle.company_id)) ||
      (user.role === 'driver' && vehicle.driver_email === user.email);
    if (!isAuthorized) return Response.json({ error: 'Forbidden' }, { status: 403 });
    if (!(await reserveAttempt(base44, 'pickup-notice:' + user.id, 60, 60 * 60_000))) return Response.json({ error: 'Too many pickup notices this hour. Try again later.' }, { status: 429 });

    // Recipient must be a registered user in the same company as the vehicle.
    let recipient = null;
    try {
      const matches = await base44.asServiceRole.entities.User.filter({ email: to });
      recipient = Array.isArray(matches) ? matches[0] : matches;
    } catch {
      /* tolerate lookup errors — SendEmail still enforces delivery rules */
    }
    if (!recipient || !(await approvedCompanies(base44, recipient, 'passenger')).includes(vehicle.company_id)) return Response.json({ error: 'Recipient not in your company' }, { status: 403 });

    const vehicleName = sanitize(vehicle.name);
    const driverName = sanitize(vehicle.driver_name);
    const companyName = sanitize(vehicle.company_name);

    const subject = `Your bus is approaching — ${vehicleName}`;
    const message =
      `Hello,\n\n` +
      `${vehicleName}${driverName ? ` (driver ${driverName})` : ''} is near your pickup location` +
      `${companyName ? ` for ${companyName}` : ''} and will arrive shortly. Please get ready to board.\n\n` +
      `— TransitTrack`;

    const email = await emailWithPolicy(base44, 'bus_approaching_email', [{ email: to }],
      (r) => base44.asServiceRole.integrations.Core.SendEmail({ to: r.email, subject, body: message }),
      { title: subject, companyId: vehicle.company_id });
    if (email.failed) return Response.json({ error: 'The email could not be sent' }, { status: 502 });

    // Real device push — this is what actually reaches a staff member's phone
    // when they're not sitting in the app; email above stays as a fallback.
    try {
      const serviceAccountJson = secrets.get('FIREBASE_SERVICE_ACCOUNT');
      if (serviceAccountJson) {
        const tokens = await base44.asServiceRole.entities.PushToken.filter({ email: to });
        if (tokens.length) {
          const payload = {
            title: `${vehicleName} is approaching`,
            body: `Arriving shortly${companyName ? ` — ${companyName}` : ''}. Get ready to board.`,
            data: { type: 'pickup_approaching', vehicle_id: vehicleId },
          };
          await pushWithPolicy(base44, 'bus_approaching_push', tokens.map((t) => t.token), payload,
            (list) => sendPushToTokens(serviceAccountJson, list, payload), { companyId: vehicle.company_id });
        }
      }
    } catch { /* push is best-effort — email above already went out */ }

    return Response.json({ ok: true });
  } catch (error) {
    return Response.json({ error: error?.status === 503 ? 'Verification service temporarily unavailable. Please try again.' : 'Something went wrong. Please try again.' }, { status: error?.status === 503 ? 503 : 500 });
  }
}