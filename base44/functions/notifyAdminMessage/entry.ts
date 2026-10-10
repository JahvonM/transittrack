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
import { passengerPushTokens } from '../../shared/chatPush.ts';
import { driverPhoneTokens } from '../../shared/driverPhone.ts';
import { pushWithPolicy } from '../../shared/notificationPolicy.ts';

// --- Firebase Cloud Messaging (push) helpers — duplicated per-function, see notifyStaffPickup/entry.ts ---
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

function sanitize(value) {
  if (value == null) return '';
  return String(value).replace(/[\u0000-\u001f\u007f]/g, '').replace(/[<>]/g, '').trim();
}

// Called right after a logged-in role (staff/company/admin/mechanic) creates
// its own GroupMessage record via the client SDK — unlike the driver side,
// which always goes through driverSession and can push-notify inline there.
// Each channel reaches a different audience beyond the always-included
// admin: 'company' also reaches that company's own manager, 'mechanic' also
// reaches the maintenance team.
// Stored token roles are registration metadata, never recipient authorization.
// Re-evaluate current users and approved manager memberships for every send.
async function recipientRows(db, name, query) {
  const rows = [];
  for (let skip = 0; skip < 10000; skip += 500) {
    const batch = await db[name].filter(query, '-created_date', 500, skip);
    rows.push(...batch);
    if (batch.length < 500) return rows;
  }
  throw new Error('Notification recipient set is too large');
}
async function pushTokensForChannel(base44, channel, companyId) {
  const db = base44.asServiceRole.entities;
  const roles = ['admin'];
  if (channel === 'company' && companyId) roles.push('company');
  if (channel === 'mechanic') roles.push('mechanic');
  const users = await recipientRows(db, 'User', { role: { $in: roles } });
  const tokens = new Set();
  for (const user of users) {
    if (!user.email) continue;
    if (user.role === 'company' && !(await approvedCompanies(base44, user, 'manager')).includes(companyId)) continue;
    for (const row of await recipientRows(db, 'PushToken', { email: user.email })) {
      if (typeof row.token === 'string' && row.token) tokens.add(row.token);
    }
  }
  return [...tokens];
}

function notificationFailure(status, message) {
  throw Object.assign(new Error(message), { status });
}
async function notificationRecord(db, name, id) {
  try { return await db[name].get(id); }
  catch (error) { if (error.status === 404 || error.response?.status === 404) return null; throw error; }
}
async function notificationForMessage(base44, user, body) {
  if (typeof body?.message_id !== 'string' || !body.message_id || body.message_id.length > 200) notificationFailure(400, 'Saved message ID required');
  const db = base44.asServiceRole.entities;
  const message = await notificationRecord(db, 'GroupMessage', body.message_id);
  if (!message) notificationFailure(404, 'Message not found');
  if (message.sender_id !== user.id) notificationFailure(403, 'Own messages only');
  const channel = message.channel || 'staff';
  if (!['staff', 'company', 'dispatch', 'mechanic'].includes(channel)) notificationFailure(403, 'Forbidden channel');
  const vehicle = await notificationRecord(db, 'Vehicle', message.vehicle_id);
  if (!vehicle || !vehicle.company_id || vehicle.company_id !== message.company_id) notificationFailure(403, 'Message assignment mismatch');
  if (user.role !== 'admin') {
    if (user.role === 'mechanic') {
      if (channel !== 'mechanic') notificationFailure(403, 'Forbidden channel');
    } else {
      const channels = user.role === 'company' ? ['company', 'staff', 'dispatch'] : ['staff'];
      if (!channels.includes(channel) || !(await approvedCompanies(base44, user)).includes(vehicle.company_id)) notificationFailure(403, 'Company or channel access denied');
    }
  }
  const text = sanitize(message.text).slice(0, 500);
  const pushBody = text || (message.message_type === 'image' ? '📷 Photo' : message.message_type === 'audio' ? '🎤 Voice note' : '');
  if (!pushBody) notificationFailure(400, 'Message has no text or media');
  return {
    channel, companyId: vehicle.company_id, vehicleId: message.vehicle_id,
    payload: {
      title: `${sanitize(vehicle.name).slice(0, 120) || 'Bus'} · ${sanitize(user.full_name || user.email).slice(0, 120) || 'Staff'}`,
      body: pushBody,
      data: { type: 'group_message', channel },
    },
  };
}
export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const session = await base44.auth.me().catch(() => null);
    if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    const user = await notificationRecord(base44.asServiceRole.entities, 'User', session.id);
    if (!user || user.id !== session.id) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    const notification = await notificationForMessage(base44, user, await req.json());
    const serviceAccountJson = secrets.get('FIREBASE_SERVICE_ACCOUNT');
    if (serviceAccountJson) {
      const myTokens = new Set((await recipientRows(base44.asServiceRole.entities, 'PushToken', { email: user.email })).map(row => row.token));
      // Staff posts go to the bus's own passengers as well as the admin team.
      const audience = await pushTokensForChannel(base44, notification.channel, notification.companyId);
      const passengers = notification.channel === 'staff'
        ? await passengerPushTokens(base44, notification.vehicleId, { excludeEmails: [user.email] })
        : [];
      // Passenger, dispatch and company messages also reach the bus's driver
      // on the driver phone app, when an administrator has switched it on.
      const driverPhones = ['staff', 'dispatch', 'company'].includes(notification.channel)
        ? await driverPhoneTokens(base44, await notificationRecord(base44.asServiceRole.entities, 'Vehicle', notification.vehicleId))
        : [];
      const tokens = [...new Set([...audience, ...passengers, ...driverPhones])].filter(token => !myTokens.has(token));
      if (tokens.length) await pushWithPolicy(base44, 'chat_message', tokens, notification.payload, (list) => sendPushToTokens(serviceAccountJson, list, notification.payload), { companyId: notification.companyId });
    }
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json({ error: error.status ? error.message : 'Notification failed' }, { status: error.status || 500 });
  }
}