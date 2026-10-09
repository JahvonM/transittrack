import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';
import { retry429 } from '../../shared/retry429.ts';
import { reserveAttempt } from '../../shared/atomicOps.ts';

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
// Attempt limiting moved to shared/atomicOps.ts: the count and the write must
// not interleave with a concurrent call, so they now run inside one lock.
async function issueGrant(base44, device, purpose, subject, ttlMs) {
 const secret = randomSecret();
 await retry429(async ()=>base44.asServiceRole.entities.VerificationGrant.create({
 token_hash: await hashSecret(secret), device_id: device.id, company_id: device.company_id,
 vehicle_id: device.vehicle_id, purpose, subject, expires_at: new Date(Date.now()+ttlMs).toISOString(),
 }));
 return secret;
}
async function validGrant(base44, device, token, purpose, subject) {
 if (typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token)) return false;
 const rows = await retry429(async ()=>base44.asServiceRole.entities.VerificationGrant.filter({ token_hash: await hashSecret(token) }, '-created_date', 1));
 const row = rows[0];
 return !!row && row.device_id === device.id && row.company_id === device.company_id && row.vehicle_id === device.vehicle_id && row.purpose === purpose && row.subject === subject && Date.parse(row.expires_at) > Date.now();
}


async function recordPassengerMembership(base44,user,company,codeHash) {
 if(!['staff','passenger'].includes(user.role)) return;
 const previous=await retry429(async ()=>base44.asServiceRole.entities.CompanyMembership.filter({user_id:user.id,scope:'passenger'},'-updated_date',100));
 const current=previous.find(row=>row.active && row.company_id===company.id && row.code_hash===codeHash);
 if(current) return;
 for(const row of previous) await retry429(async ()=>base44.asServiceRole.entities.CompanyMembership.update(row.id,{active:false}));
 await retry429(async ()=>base44.asServiceRole.entities.CompanyMembership.create({user_id:user.id,company_id:company.id,scope:'passenger',active:true,code_hash:codeHash}));
}

const displayCompany = company => Object.fromEntries(['id','name','phone','logo_url','service_types'].filter(k => company[k] !== undefined).map(k => [k,company[k]]));

// The company behind a saved pass — or null when the pass is unknown, belongs to
// a removed member, or was issued against a code the operator has since changed.
async function companyFromGrant(base44, user, grant) {
 const rows = await retry429(async ()=>base44.asServiceRole.entities.CompanyAccessGrant.filter({ user_id: user.id, token_hash: await hashSecret(grant) }, '-created_date', 1));
 const row = rows[0];
 if (!row) return null;
 const company = await retry429(async ()=>base44.asServiceRole.entities.Company.get(row.company_id)).catch(() => null);
 if (!company || row.code_hash !== await hashSecret(company.access_code || '')) return null;
 if(['staff','passenger'].includes(user.role)) {
  const memberships=await retry429(async ()=>base44.asServiceRole.entities.CompanyMembership.filter({user_id:user.id,company_id:company.id,scope:'passenger',active:true},'-updated_date',100));
  if(!memberships.some(m=>(!m.code_hash&&!m.expires_at)||m.code_hash===row.code_hash))return null;
 }
 return company;
}

// The company this account is still an approved member of, with a fresh pass so
// the device is back to normal. Staff were being asked for the company code
// again every time a device lost its saved pass (a new phone, a cleared or
// evicted browser) although their membership was still live. That membership was
// created by a code check, or by an admin, and stops counting the moment the
// operator's code changes — so this hands back nothing the code did not grant.
async function companyFromMembership(base44, user) {
 const rows = await retry429(async ()=>base44.asServiceRole.entities.CompanyMembership.filter({ user_id: user.id, scope: 'passenger', active: true }, '-updated_date', 100));
 for (const row of rows) {
  const company = await retry429(async ()=>base44.asServiceRole.entities.Company.get(row.company_id)).catch(() => null);
  if (!company) continue;
  const codeHash = await hashSecret(company.access_code || '');
  if (row.code_hash ? row.code_hash !== codeHash : !!row.expires_at) continue;
  const grant = randomSecret();
  await retry429(async ()=>base44.asServiceRole.entities.CompanyAccessGrant.create({ user_id: user.id, company_id: company.id, token_hash: await hashSecret(grant), code_hash: codeHash }));
  return { company, grant };
 }
 return null;
}
export default async function(req) {
 try {
  const base44 = createClientFromRequest(req);
  const user = await base44.auth.me().catch((e) => { const s = e?.status ?? e?.response?.status; if (s === 401 || s === 403) return null; throw e; }); // no session: signed out; an outage stays an error
  if (!user || !['staff','passenger','admin','company'].includes(user.role)) return Response.json({ error: 'Sign in to continue' }, { status: 401 });
  const body = await req.json();
  if (body.action === 'context') {
   const requested = typeof body.grant === 'string' && /^[a-f0-9]{64}$/.test(body.grant) ? body.grant : null;
   const fromGrant = requested ? await companyFromGrant(base44, user, requested) : null;
   if (fromGrant) return Response.json({ company: displayCompany(fromGrant) });
   // No usable pass on this device. A signed-in member keeps their company; the
   // app asks for this only when the person has not deliberately switched.
   if (body.restore === true && ['staff','passenger'].includes(user.role)) {
    const restored = await companyFromMembership(base44, user);
    if (restored) return Response.json({ company: displayCompany(restored.company), grant: restored.grant });
   }
   return Response.json({ error: 'Company code required', code: 'COMPANY_ACCESS_REQUIRED' }, { status: 401 });
  }
  if (!(await reserveAttempt(base44, 'company-code:' + user.id, 5, 15 * 60_000))) return Response.json({ error: 'Too many attempts. Try again in 15 minutes.' }, { status: 429 });
  const code = typeof body.code === 'string' ? body.code.trim().toUpperCase() : '';
  if (!/^[A-Z0-9]{12}$/.test(code)) return Response.json({ error: 'Invalid company code' }, { status: 403 });
  const rows = await retry429(async ()=>base44.asServiceRole.entities.Company.filter({ access_code: code }, '-created_date', 2));
  if (rows.length !== 1) return Response.json({ error: 'Invalid company code' }, { status: 403 });
  const company = rows[0];
  const grant = randomSecret();
  await retry429(async ()=>base44.asServiceRole.entities.CompanyAccessGrant.create({ user_id: user.id, company_id: company.id, token_hash: await hashSecret(grant), code_hash: await hashSecret(code) }));
  await recordPassengerMembership(base44,user,company,await hashSecret(code));
  // Verified passenger access never grants manager scope, ownership or a role.
  return Response.json({ company: displayCompany(company), grant });
 } catch (error) { return Response.json({ error: 'Could not verify company access' }, { status: error.status || 500 }); }
}