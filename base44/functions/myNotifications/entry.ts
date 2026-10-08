import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';
import { NOTIFICATION_TYPES, notificationPolicy } from '../../shared/notificationPolicy.ts';

// A passenger's own notification choices (Account → Notifications). They can
// turn off the kinds that are about them; what they can't do is switch on
// something the administrator has switched off for them.

function fail(status, message) { throw Object.assign(new Error(message), { status }); }
const norm = (value) => String(value || '').trim().toLowerCase();
const PASSENGER_KINDS = NOTIFICATION_TYPES.filter((t) => t.selfService);
async function digest(value) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(bytes), (b) => b.toString(16).padStart(2, '0')).join('');
}
// The companies this passenger is an approved member of.
async function myCompanies(db, user) {
  const rows = await db.CompanyMembership.filter({ user_id: user.id, scope: 'passenger', active: true }, '-updated_date', 50);
  const ids = [];
  for (const row of rows) {
    if (!row.expires_at && !row.code_hash) { ids.push(row.company_id); continue; }
    if (!row.code_hash) continue;
    const company = await db.Company.get(row.company_id).catch(() => null);
    if (company && row.code_hash === await digest(company.access_code || '')) ids.push(row.company_id);
  }
  return ids;
}

async function choices(base44, user) {
  const db = base44.asServiceRole.entities;
  const optedOut = new Set(Array.isArray(user.notification_opt_out) ? user.notification_opt_out : []);
  const companies = await myCompanies(db, user);
  const email = norm(user.email);
  const out = [];
  for (const t of PASSENGER_KINDS) {
    const policy = await notificationPolicy(base44, t.key);
    const companyOff = companies.length > 0 && companies.every((id) => policy.blockedCompanies.has(id));
    out.push({
      key: t.key, channel: t.channel, label: t.passengerLabel || t.label, when: t.passengerWhen || t.when,
      on: !optedOut.has(t.key),
      // Switched off by the administrator for everyone, this person, or their company.
      available: policy.enabled && !policy.blocked.has(email) && !companyOff,
    });
  }
  return out;
}

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const session = await base44.auth.me().catch(() => null);
    if (!session) return Response.json({ error: 'Sign in required' }, { status: 401 });
    const user = await base44.asServiceRole.entities.User.get(session.id).catch(() => null);
    if (!user || !['staff', 'passenger'].includes(user.role)) return Response.json({ error: 'For passengers only' }, { status: 403 });
    const body = await req.json().catch(() => ({}));

    if (body.action === 'get') return Response.json({ choices: await choices(base44, user) });

    if (body.action === 'set') {
      if (!PASSENGER_KINDS.some((t) => t.key === body.key)) fail(400, 'Unknown notification');
      if (typeof body.on !== 'boolean') fail(400, 'Say whether it is on or off');
      const current = new Set((Array.isArray(user.notification_opt_out) ? user.notification_opt_out : []).filter((k) => typeof k === 'string'));
      if (body.on) current.delete(body.key); else current.add(body.key);
      const updated = await base44.asServiceRole.entities.User.update(user.id, { notification_opt_out: [...current] });
      return Response.json({ choices: await choices(base44, { ...user, ...updated, notification_opt_out: [...current] }) });
    }

    return Response.json({ error: 'Unknown action' }, { status: 400 });
  } catch (error) {
    const status = error?.status && error.status >= 400 && error.status < 600 ? error.status : 500;
    return Response.json({ error: status === 500 ? 'Something went wrong. Try again.' : error.message }, { status });
  }
}
