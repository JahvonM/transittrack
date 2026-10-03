import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';

const CODE_TTL_MS = 30 * 60 * 1000; // 30 minutes — long enough to walk to the bus, short enough to matter if lost



// Staff self-service: "I forgot my badge" button in the staff app. Only
// works for logged-in Users (Contact-only staff have no app to call this
// from) — generates a short-lived code the bus boarding kiosk's keypad will
// accept once, in place of an NFC tap or the permanent access_code.
async function hashSecret(value) {
 const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
 return Array.from(new Uint8Array(bytes), b => b.toString(16).padStart(2,'0')).join('');
}
function randomSecret() { return Array.from(crypto.getRandomValues(new Uint8Array(32)), b => b.toString(16).padStart(2,'0')).join(''); }
function randomDigits(len) {
 let out = '';
 while (out.length < len) { const b = crypto.getRandomValues(new Uint8Array(1))[0]; if (b < 250) out += b % 10; }
 return out;
}
async function reserveAttempt(base44, key, limit, windowMs) {
 const rows = await base44.asServiceRole.entities.VerificationAttempt.filter({ scope: key }, '-created_date', limit);
 const recent = rows.filter(r => Date.parse(r.attempted_at) > Date.now() - windowMs);
 if (recent.length >= limit) return false;
 await base44.asServiceRole.entities.VerificationAttempt.create({ scope: key, attempted_at: new Date().toISOString() });
 return true;
}
async function issueGrant(base44, device, purpose, subject, ttlMs) {
 const secret = randomSecret();
 await base44.asServiceRole.entities.VerificationGrant.create({
 token_hash: await hashSecret(secret), device_id: device.id, company_id: device.company_id,
 vehicle_id: device.vehicle_id, purpose, subject, expires_at: new Date(Date.now()+ttlMs).toISOString(),
 });
 return secret;
}
async function validGrant(base44, device, token, purpose, subject) {
 if (typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token)) return false;
 const rows = await base44.asServiceRole.entities.VerificationGrant.filter({ token_hash: await hashSecret(token) }, '-created_date', 1);
 const row = rows[0];
 return !!row && row.device_id === device.id && row.company_id === device.company_id && row.vehicle_id === device.vehicle_id && row.purpose === purpose && row.subject === subject && Date.parse(row.expires_at) > Date.now();
}

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user || user.role !== 'staff' || !user.company_id) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    if (!(await reserveAttempt(base44, 'otp-issue:' + user.id, 3, 30 * 60_000))) return Response.json({ error: 'Too many code requests. Try again later.' }, { status: 429 });
    const previous = await base44.asServiceRole.entities.PassengerOneTimeCredential.filter({ user_id: user.id }, '-created_date', 100);
    for (const row of previous) if (!row.consumed_at) await base44.asServiceRole.entities.PassengerOneTimeCredential.update(row.id, { consumed_at: new Date().toISOString() });
    const code = randomDigits(6);
    const expiresAt = new Date(Date.now() + CODE_TTL_MS).toISOString();
    await base44.asServiceRole.entities.PassengerOneTimeCredential.create({ user_id: user.id, company_id: user.company_id, token_hash: await hashSecret(code), expires_at: expiresAt });

    return Response.json({ code, expires_at: expiresAt });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}
