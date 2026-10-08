import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';
import { secrets } from 'base44:runtime';
import { sendPushToTokens } from '../../shared/fcm.ts';
import { NOTIFICATION_TYPES, NOTIFICATION_KEYS, pushWithPolicy, emailWithPolicy } from '../../shared/notificationPolicy.ts';

// Admin → Notifications: every email and phone alert the app sends, who is
// eligible for each, and the admin's choices (switch a kind off, or leave
// particular people out). Administrators only.

function fail(status, message) { throw Object.assign(new Error(message), { status }); }
function sanitize(value) {
  if (value == null) return '';
  return String(value).replace(/[\u0000-\u001F\u007F]/g, '').replace(/[<>]/g, '').trim();
}
const norm = (value) => String(value || '').trim().toLowerCase();
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
async function digest(value) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(bytes), (b) => b.toString(16).padStart(2, '0')).join('');
}

async function allRows(db, name, query = {}) {
  const rows = [];
  for (let skip = 0; skip < 20000; skip += 500) {
    const batch = await db[name].filter(query, 'created_date', 500, skip);
    rows.push(...batch);
    if (batch.length < 500) break;
  }
  return rows;
}

// Same membership test the senders use: an admin-approved row, or one made
// with the company's current join code.
async function liveMemberships(db, scope) {
  const rows = await allRows(db, 'CompanyMembership', { scope, active: true });
  const codeHash = new Map();
  const live = [];
  for (const row of rows) {
    if (!row.expires_at && !row.code_hash) { live.push(row); continue; }
    if (!row.code_hash || (scope !== 'passenger' && !(Date.parse(row.expires_at) > Date.now()))) continue;
    if (!codeHash.has(row.company_id)) {
      const company = await db.Company.get(row.company_id).catch(() => null);
      codeHash.set(row.company_id, company ? await digest(company.access_code || '') : null);
    }
    if (codeHash.get(row.company_id) === row.code_hash) live.push(row);
  }
  return live;
}

// Everyone who could get a notification, by audience, for the "Who gets it" lists.
async function people(db) {
  const [users, companies, managers, passengers, drivers] = await Promise.all([
    allRows(db, 'User'), allRows(db, 'Company'), liveMemberships(db, 'manager'), liveMemberships(db, 'passenger'),
    db.Driver.filter({ phone_app_access: true }, 'full_name', 2000),
  ]);
  const companyName = new Map(companies.map((c) => [c.id, sanitize(c.name)]));
  const person = (u, companyId) => ({
    email: norm(u.email), name: sanitize(u.display_name || u.full_name) || norm(u.email),
    company: companyId ? companyName.get(companyId) || '' : '',
  });
  const firstCompany = (rows) => new Map(rows.map((m) => [m.user_id, m.company_id]));
  const managerOf = firstCompany(managers), passengerOf = firstCompany(passengers);
  const withEmail = users.filter((u) => EMAIL.test(norm(u.email)));
  const byName = (a, b) => a.name.localeCompare(b.name);
  return {
    admin: withEmail.filter((u) => u.role === 'admin').map((u) => person(u)).sort(byName),
    company: withEmail.filter((u) => u.role === 'company' && managerOf.has(u.id)).map((u) => person(u, managerOf.get(u.id))).sort(byName),
    mechanic: withEmail.filter((u) => u.role === 'mechanic').map((u) => person(u)).sort(byName),
    passenger: withEmail.filter((u) => ['staff', 'passenger'].includes(u.role) && passengerOf.has(u.id)).map((u) => person(u, passengerOf.get(u.id))).sort(byName),
    driver: drivers.filter((d) => d.company_id && EMAIL.test(norm(d.email)))
      .map((d) => ({ email: norm(d.email), name: sanitize(d.full_name) || norm(d.email), company: companyName.get(d.company_id) || sanitize(d.company_name) }))
      .sort(byName),
  };
}

const logRow = (r) => ({
  id: r.id, key: r.key, channel: r.channel, title: sanitize(r.title), status: r.status,
  recipients: (r.recipients || []).map(sanitize), recipient_count: r.recipient_count || 0,
  sent: r.sent || 0, failed: r.failed || 0, skipped: r.skipped || 0, error: sanitize(r.error),
  sent_at: r.sent_at || r.created_date || null,
});

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const session = await base44.auth.me().catch(() => null);
    if (!session) return Response.json({ error: 'Sign in required' }, { status: 401 });
    // Current role from the stored record, not from the session token.
    const user = await base44.asServiceRole.entities.User.get(session.id).catch(() => null);
    if (!user || user.role !== 'admin') return Response.json({ error: 'Administrators only' }, { status: 403 });
    const db = base44.asServiceRole.entities;
    const body = await req.json().catch(() => ({}));

    if (body.action === 'overview') {
      const [settingRows, everyone, recent] = await Promise.all([
        db.NotificationSetting.list('-updated_date', 200).catch(() => []),
        people(db),
        db.NotificationLog.list('-created_date', 150).catch(() => []),
      ]);
      const settings = {};
      for (const row of settingRows) {
        if (!NOTIFICATION_KEYS.has(row.key) || settings[row.key]) continue;
        settings[row.key] = { enabled: row.enabled !== false, blocked_emails: (row.blocked_emails || []).map(norm), updated_by: sanitize(row.updated_by), updated_date: row.updated_date || null };
      }
      return Response.json({ types: NOTIFICATION_TYPES, settings, people: everyone, recent: recent.map(logRow), me: norm(user.email) });
    }

    if (body.action === 'save') {
      const type = NOTIFICATION_TYPES.find((t) => t.key === body.key);
      if (!type) fail(400, 'Unknown notification');
      if (typeof body.enabled !== 'boolean') fail(400, 'Say whether it is on or off');
      if (!Array.isArray(body.blocked_emails) || body.blocked_emails.length > 5000) fail(400, 'Invalid list of people');
      const blocked = [...new Set(body.blocked_emails.map(norm))].filter((e) => EMAIL.test(e));
      if (type.locked && !body.enabled) fail(400, `${type.label} can't be switched off`);
      if (type.locked) {
        const everyone = await people(db);
        const reachable = new Set(type.audiences.flatMap((a) => everyone[a] || []).map((p) => p.email));
        if (reachable.size && ![...reachable].some((e) => !blocked.includes(e))) fail(400, `${type.label} must reach at least one person`);
      }
      const data = { key: type.key, enabled: body.enabled, blocked_emails: blocked, updated_by: sanitize(user.full_name || user.email) };
      const existing = (await db.NotificationSetting.filter({ key: type.key }, '-updated_date', 5))[0];
      const row = existing ? await db.NotificationSetting.update(existing.id, data) : await db.NotificationSetting.create(data);
      await db.AuditLog.create({
        actor_email: user.email || '', actor_name: user.full_name || user.email || '', actor_role: 'admin',
        action: 'update', entity: 'NotificationSetting', record_id: row?.id || existing?.id || '', page: '/admin/notifications',
        summary: `${type.label} (${type.channel === 'email' ? 'email' : 'phone alert'}): ${body.enabled ? 'on' : 'off'}${blocked.length ? `, ${blocked.length} ${blocked.length === 1 ? 'person' : 'people'} left out` : ''}`,
      }).catch(() => {});
      return Response.json({ ok: true, setting: { enabled: data.enabled, blocked_emails: blocked, updated_by: data.updated_by, updated_date: row?.updated_date || new Date().toISOString() } });
    }

    // A test to the admin's own inbox or phone, so they can see it arrives.
    if (body.action === 'test') {
      const title = 'TransitTrack test notification';
      if (body.channel === 'email') {
        const result = await emailWithPolicy(base44, 'test', [{ email: user.email }], (r) => base44.asServiceRole.integrations.Core.SendEmail({
          to: r.email, subject: title,
          body: `Hello,\n\nThis is a test from Admin → Notifications. Emails from TransitTrack are reaching this inbox.\n\n— TransitTrack`,
        }), { title });
        if (!result.sent) fail(502, 'The test email could not be sent');
        return Response.json({ ok: true, to: norm(user.email) });
      }
      if (body.channel === 'push') {
        const rows = await db.PushToken.filter({ email: user.email }, '-created_date', 50);
        const tokens = [...new Set(rows.map((r) => r.token).filter((t) => typeof t === 'string' && t))];
        if (!tokens.length) fail(409, 'This account has no phone or browser signed up for alerts. Turn on notifications in My profile first.');
        const payload = { title, body: 'Phone alerts from TransitTrack are reaching this device.', data: { type: 'test' } };
        const result = await pushWithPolicy(base44, 'test', tokens, payload, (list) => sendPushToTokens(secrets.get('FIREBASE_SERVICE_ACCOUNT'), list, payload, '/admin'));
        if (!result.sent) fail(502, 'The test alert could not be delivered');
        return Response.json({ ok: true, devices: result.sent });
      }
      fail(400, 'Choose email or phone');
    }

    if (body.action === 'recent') {
      const query = typeof body.key === 'string' && (NOTIFICATION_KEYS.has(body.key) || body.key === 'test') ? { key: body.key } : {};
      const rows = await db.NotificationLog.filter(query, '-created_date', 150);
      return Response.json({ recent: rows.map(logRow) });
    }

    return Response.json({ error: 'Unknown action' }, { status: 400 });
  } catch (error) {
    const status = error?.status && error.status >= 400 && error.status < 600 ? error.status : 500;
    return Response.json({ error: status === 500 ? 'Something went wrong. Try again.' : error.message }, { status });
  }
}
