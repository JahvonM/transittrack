import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';
import { secrets } from 'base44:runtime';
import { phoneTokensForDriver } from '../../shared/driverPhone.ts';
import { sendPushToTokens } from '../../shared/fcm.ts';

// Day-off and swap requests from the driver phone app: administrators (and a
// company's own approved manager, for that company only) see them and answer.
// The driver hears the answer on their phone.

function fail(status, message) { throw Object.assign(new Error(message), { status }); }
function sanitize(value) {
  if (value == null) return '';
  return String(value).replace(/[\u0000-\u0008\u000B-\u001F\u007F]/g, '').replace(/[<>]/g, '').trim();
}
async function digest(value) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(bytes), (b) => b.toString(16).padStart(2, '0')).join('');
}
async function liveMembership(base44, row) {
  if (!row.expires_at && !row.code_hash) return true;
  if (!row.code_hash || (row.scope !== 'passenger' && !(Date.parse(row.expires_at) > Date.now()))) return false;
  const company = await base44.asServiceRole.entities.Company.get(row.company_id).catch(() => null);
  return !!company && row.code_hash === await digest(company.access_code || '');
}
// Which companies this person may answer for; null means every company.
async function answerableCompanies(base44, user) {
  if (user.role === 'admin') return null;
  if (user.role !== 'company') fail(403, 'Administrators only');
  const rows = await base44.asServiceRole.entities.CompanyMembership.filter({ user_id: user.id, active: true }, '-updated_date', 100);
  const ids = [];
  for (const row of rows) if (row.scope === 'manager' && await liveMembership(base44, row)) ids.push(row.company_id);
  if (!ids.length) fail(403, 'Approved company membership required');
  return ids;
}
const summary = (r) => ({
  id: r.id, company_id: r.company_id, company_name: sanitize(r.company_name), driver_id: r.driver_id, driver_name: sanitize(r.driver_name),
  kind: r.kind, start_date: r.start_date, end_date: r.end_date || r.start_date, swap_with_name: sanitize(r.swap_with_name),
  note: sanitize(r.note), status: r.status || 'pending', decided_by_name: sanitize(r.decided_by_name), decided_at: r.decided_at || null,
  decision_note: sanitize(r.decision_note), created_date: r.created_date || null,
});

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const session = await base44.auth.me().catch(() => null);
    if (!session) return Response.json({ error: 'Sign in required' }, { status: 401 });
    // Current role from the stored record, not from the session token.
    const user = await base44.asServiceRole.entities.User.get(session.id).catch(() => null);
    if (!user) return Response.json({ error: 'Sign in required' }, { status: 401 });
    const companies = await answerableCompanies(base44, user);
    const db = base44.asServiceRole.entities;
    const body = await req.json().catch(() => ({}));
    const allowed = (r) => companies === null || companies.includes(r.company_id);

    if (body.action === 'list') {
      const rows = await db.DriverRequest.list('-created_date', 300);
      return Response.json({ requests: rows.filter(allowed).map(summary) });
    }

    if (body.action === 'decide') {
      const decision = body.decision === 'approved' ? 'approved' : body.decision === 'declined' ? 'declined' : '';
      if (!decision) fail(400, 'Approve or decline');
      const row = typeof body.request_id === 'string' ? await db.DriverRequest.get(body.request_id).catch(() => null) : null;
      if (!row || !allowed(row)) fail(404, 'Request not found');
      if (row.status !== 'pending') fail(409, row.status === 'cancelled' ? 'The driver cancelled this request' : 'This request was already answered');
      const note = sanitize(body.note).slice(0, 500);
      const updated = await db.DriverRequest.update(row.id, {
        status: decision, decided_by_name: sanitize(user.full_name || user.email), decided_at: new Date().toISOString(), decision_note: note,
      });
      try {
        const serviceAccountJson = secrets.get('FIREBASE_SERVICE_ACCOUNT');
        const driver = await db.Driver.get(row.driver_id).catch(() => null);
        if (serviceAccountJson && driver && driver.company_id === row.company_id) {
          const when = row.start_date === (row.end_date || row.start_date) ? row.start_date : `${row.start_date} to ${row.end_date}`;
          await sendPushToTokens(serviceAccountJson, await phoneTokensForDriver(base44, driver), {
            title: `${row.kind === 'swap' ? 'Swap' : 'Day off'} ${decision === 'approved' ? 'approved' : 'declined'}`,
            body: `${when}${note ? `: ${note.slice(0, 160)}` : ''}`,
            data: { type: 'driver_request', request_id: row.id, status: decision },
          }, '/driver-phone/me');
        }
      } catch { /* the answer is saved; the alert is best effort */ }
      return Response.json({ ok: true, request: summary({ ...row, ...updated }) });
    }

    return Response.json({ error: 'Unknown action' }, { status: 400 });
  } catch (error) {
    const status = error?.status && error.status >= 400 && error.status < 600 ? error.status : 500;
    return Response.json({ error: status === 500 ? 'Something went wrong. Try again.' : error.message }, { status });
  }
}
