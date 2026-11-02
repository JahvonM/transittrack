import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { secrets } from 'base44:runtime';
import { reserveAttempt } from '../../shared/atomicOps.ts';
import { emailWithPolicy, pushWithPolicy } from '../../shared/notificationPolicy.ts';
import { caseUpdateEmail, sendAccountEmail } from '../../shared/accountEmails.ts';
import { sendPushToTokens } from '../../shared/fcm.ts';
import { CASE_KIND_TEXT, caseStatusText, isChange, isOpen, newReference, officeStatuses, readCaseRequest, readReply } from '../../shared/passengerCases.ts';

import { patternText } from '../../shared/ridePattern.ts';
// Passenger requests and support cases (My rides → Change a ride, More →
// Help). A passenger sees and answers only their own; admins see all of them
// in Admin → Passenger support. The server adds the bus and trip context, so
// a passenger can't attach someone else's.
//
// Passenger: mine · create · reply · withdraw · seen
// Admin:     list · reply · set_status

const APP = 'https://app.mcsweenstransport.com';
const TZ = 'America/Grenada';
const today = (at = Date.now()) => new Date(at).toLocaleDateString('en-CA', { timeZone: TZ });
const json = (body: unknown, status = 200, headers: Record<string, string> = {}) => Response.json(body, { status, headers });

async function approvedCompany(db, user) {
  const rows = await db.CompanyMembership.filter({ user_id: user.id, active: true, scope: 'passenger' }, '-updated_date', 100);
  const ids = new Set();
  for (const row of rows) {
    if (!row.code_hash && !row.expires_at) { ids.add(row.company_id); continue; }
    if (!row.code_hash) continue;
    const company = await db.Company.get(row.company_id).catch(() => null);
    if (!company) continue;
    const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(company.access_code || ''));
    const hash = Array.from(new Uint8Array(bytes), (b) => b.toString(16).padStart(2, '0')).join('');
    if (hash === row.code_hash) ids.add(row.company_id);
  }
  return ids.size === 1 ? [...ids][0] : null;
}

// What the passenger sees of their own case.
const forPassenger = (c) => ({
  id: c.id, reference: c.reference, kind: c.kind, status: c.status, details: c.details || '',
  vehicle_name: c.vehicle_name || '', trip_date: c.trip_date || '', requested_date: c.requested_date || '',
  requested_time: c.requested_time || '', requested_pickup: c.requested_pickup || '', rating: c.rating ?? null,
  days: Array.isArray(c.days) ? c.days : [], direction: c.direction || '', until_date: c.until_date || '',
  replies: (c.replies || []).map((r) => ({ from: r.from, name: r.from === 'office' ? 'McSween Transport' : 'You', text: r.text, at: r.at })),
  unread: !!c.passenger_unread, created_date: c.created_date, updated_date: c.updated_date, source: 'case',
});
// A lost item reported from the Help sheet, shown in the same list (read-only).
const LOST_STATUS = { open: 'requested', found: 'pending', returned: 'resolved', closed: 'closed' };
const lostForPassenger = (r) => ({
  id: 'lost:' + r.id, reference: 'LI-' + String(r.id).slice(-6).toUpperCase(), kind: 'lost_item', status: LOST_STATUS[r.status] || 'requested',
  details: r.description || '', vehicle_name: r.vehicle_name || '', replies: [], unread: false,
  created_date: r.created_date, updated_date: r.updated_date, source: 'lost_item',
});

// The passenger's bus, direction and last boarding today: added by the
// server from their own records only.
async function tripContext(db, user, companyId) {
  const contacts = (await db.Contact.filter({ company_id: companyId, email: user.email }, '-updated_date', 20).catch(() => []))
    .filter((c) => c.company_id === companyId && String(c.email || '').toLowerCase() === String(user.email || '').toLowerCase());
  const memberships = await db.CompanyMembership.filter({ user_id: user.id, company_id: companyId, active: true, scope: 'passenger' }, '-updated_date', 20).catch(() => []);
  const vehicleId = contacts.find((c) => c.vehicle_id)?.vehicle_id || memberships.find((m) => m.vehicle_id)?.vehicle_id || '';
  const vehicle = vehicleId ? await db.Vehicle.get(vehicleId).catch(() => null) : null;
  const bus = vehicle && vehicle.company_id === companyId ? vehicle : null;
  const tags = [...new Set([user.id, ...contacts.flatMap((c) => [c.id, c.nfc_card_tag])].filter(Boolean))];
  const day = today();
  const taps = tags.length ? await db.StaffCheckIn.filter({ company_id: companyId, card_tag: { $in: tags } }, '-boarded_at', 10).catch(() => []) : [];
  const boarded = taps.find((t) => t.company_id === companyId && tags.includes(t.card_tag) && t.status === 'boarded' && today(Date.parse(t.boarded_at || t.created_date)) === day);
  return {
    vehicle_id: bus?.id || '', vehicle_name: bus?.name || '', trip_date: day,
    leg: bus?.trip_direction === 'to_home' ? 'to_home' : bus ? 'to_work' : undefined,
    ride_boarded_at: boarded ? (boarded.boarded_at || boarded.created_date) : undefined,
    pickup_name: user.pickup_name || '', bus,
  };
}

async function uniqueReference(db) {
  for (let i = 0; i < 8; i++) {
    const ref = newReference((n) => crypto.getRandomValues(new Uint8Array(n)));
    const taken = await db.PassengerCase.filter({ reference: ref }, '-created_date', 1).catch(() => []);
    if (!taken.length) return ref;
  }
  throw Object.assign(new Error('Could not make a reference number'), { status: 503 });
}

// The passenger hears about the office's answer on their phone (a short
// alert) and by email (the whole reply), each switchable on its own.
async function tellPassenger(base44, row, title, body, fullText = body) {
  try {
    const serviceAccountJson = secrets.get('FIREBASE_SERVICE_ACCOUNT');
    const tokens = serviceAccountJson && row.user_email
      ? [...new Set((await base44.asServiceRole.entities.PushToken.filter({ email: row.user_email }, '-created_date', 20).catch(() => [])).map((t) => t.token).filter(Boolean))]
      : [];
    if (tokens.length) {
      const payload = { title, body, data: { type: 'case_update', case_id: row.id } };
      await pushWithPolicy(base44, 'case_update', tokens, payload, (list) => sendPushToTokens(serviceAccountJson, list, payload, '/help'), { companyId: row.company_id });
    }
  } catch { /* a push is a courtesy; the app shows the reply */ }
  try {
    if (!row.user_email) return;
    const person = row.user_id ? await base44.asServiceRole.entities.User.get(row.user_id).catch(() => null) : null;
    await sendAccountEmail(base44, 'case_update_email', row.user_email, caseUpdateEmail({ name: person?.display_name || person?.full_name || '', title, text: fullText }), { companyId: row.company_id || '' });
  } catch { /* so is the email */ }
}

const appendReply = (row, from, name, text) => [...(row.replies || []), { from, name, text, at: new Date().toISOString() }].slice(-50);

// Regular days off on the passenger's account: set when the office confirms
// the request, cleared when the office closes or turns down that request.
async function applyPattern(db, row, status, officeName) {
  const person = await db.User.get(row.user_id).catch(() => null);
  if (!person) return;
  if (status === 'confirmed') {
    await db.User.update(person.id, { ride_pattern: {
      days: row.days || [], direction: row.direction || 'both', from: row.requested_date || '', until: row.until_date || '',
      reference: row.reference, case_id: row.id, approved_at: new Date().toISOString(), approved_by: officeName,
    } });
  } else if (['closed', 'rejected'].includes(status) && person.ride_pattern?.case_id === row.id) {
    await db.User.update(person.id, { ride_pattern: null });
  }
}

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const session = await base44.auth.me().catch(() => null);
    if (!session) return json({ error: 'Sign in required' }, 401);
    const db = base44.asServiceRole.entities;
    const user = await db.User.get(session.id).catch(() => null);
    if (!user) return json({ error: 'Sign in required' }, 401);
    const body = await req.json().catch(() => ({}));
    const action = String(body.action || '');

    // --- the office ---
    if (['list', 'set_status'].includes(action) || (action === 'reply' && user.role === 'admin')) {
      if (user.role !== 'admin') return json({ error: 'Admins only' }, 403);
      if (action === 'list') {
        const rows = await db.PassengerCase.list('-created_date', 300);
        const open = body.show !== 'all';
        return json({ cases: rows.filter((c) => !open || isOpen(c.status)) });
      }
      const row = await db.PassengerCase.get(String(body.id || '')).catch(() => null);
      if (!row) return json({ error: 'Request not found' }, 404);
      const officeName = user.display_name || user.full_name || user.email;
      if (action === 'reply') {
        const text = readReply(body.text);
        if (!text) return json({ error: 'Write a reply first.' }, 400);
        const updated = await db.PassengerCase.update(row.id, {
          replies: appendReply(row, 'office', officeName, text), passenger_unread: true, office_unread: false,
          ...(row.status === 'requested' ? { status: 'pending' } : {}),
        });
        await tellPassenger(base44, row, `Reply about ${row.reference}`, text.slice(0, 140), text);
        return json({ ok: true, case: updated });
      }
      const status = String(body.status || '');
      if (!officeStatuses(row.kind).includes(status as any)) return json({ error: 'That status doesn’t fit this request.' }, 400);
      const note = readReply(body.note);
      const final = !isOpen(status);
      const updated = await db.PassengerCase.update(row.id, {
        status, passenger_unread: true, office_unread: false,
        ...(note ? { replies: appendReply(row, 'office', officeName, note) } : {}),
        ...(final ? { closed_at: new Date().toISOString(), closed_by: officeName } : { closed_at: null, closed_by: '' }),
      });
      await db.AuditLog.create({ actor_email: user.email || '', actor_name: officeName, actor_role: 'admin', action: 'update', entity: 'PassengerCase', record_id: row.id, page: '/admin/support', summary: `${row.reference} (${CASE_KIND_TEXT[row.kind] || row.kind}) set to ${status}` }).catch(() => {});
      // Regular days off take effect when the office confirms them, and end
      // if the office later closes or turns down that same request.
      if (row.kind === 'regular_days') await applyPattern(db, row, status, officeName);
      const said = `${CASE_KIND_TEXT[row.kind] || 'Your request'} is now: ${caseStatusText(row.kind, status).toLowerCase()}.`;
      await tellPassenger(base44, row, `${row.reference}: ${caseStatusText(row.kind, status)}`, note ? note.slice(0, 140) : said, note ? `${said} ${note}` : said);
      return json({ ok: true, case: updated });
    }

    // --- the passenger ---
    if (!['staff', 'passenger'].includes(user.role)) return json({ error: 'Passenger access required' }, 403);
    const companyId = await approvedCompany(db, user);
    if (!companyId) return json({ error: 'Verified company access required' }, 403);
    const mine = async (id) => {
      const row = await db.PassengerCase.get(String(id || '')).catch(() => null);
      return row && row.user_id === user.id && row.company_id === companyId ? row : null;
    };

    if (action === 'mine') {
      const rows = (await db.PassengerCase.filter({ user_id: user.id, company_id: companyId }, '-created_date', 50)).filter((c) => c.user_id === user.id && c.company_id === companyId);
      const lost = (await db.LostItemReport.filter({ reporter_id: user.id, company_id: companyId }, '-created_date', 20).catch(() => [])).filter((r) => r.reporter_id === user.id && r.company_id === companyId);
      const list = [...rows.map(forPassenger), ...lost.map(lostForPassenger)].sort((a, b) => String(b.created_date || '').localeCompare(String(a.created_date || '')));
      return json({ cases: list, pattern: user.ride_pattern?.days?.length ? user.ride_pattern : null });
    }

    if (action === 'create') {
      const read = readCaseRequest(body, today());
      if ('error' in read) return json({ error: read.error }, 400);
      if (!(await reserveAttempt(base44, 'passenger-case:' + user.id, 6, 3600_000))) return json({ error: 'You have sent several requests in the last hour. Please message your bus team instead.' }, 429, { 'Retry-After': '600' });
      const context = await tripContext(db, user, companyId);
      const { bus, ...where } = context;
      let tripRef = {};
      if (body.trip_id) {
        const trip = await db.Trip.get(String(body.trip_id)).catch(() => null);
        if (trip && trip.company_id === companyId && !trip.job_type) tripRef = { trip_id: trip.id };
      }
      const company = await db.Company.get(companyId).catch(() => null);
      const name = user.display_name || user.full_name || user.email;
      const row = await db.PassengerCase.create({
        reference: await uniqueReference(db), company_id: companyId, company_name: company?.name || '',
        user_id: user.id, user_name: name, user_email: user.email || '',
        status: 'requested', ...read.data, ...where, ...tripRef, replies: [], passenger_unread: false, office_unread: true,
      });
      // A missed pickup also goes to the bus chat, as before, so the driver sees it.
      if (row.kind === 'missed_pickup' && bus) {
        await db.GroupMessage.create({ company_id: companyId, vehicle_id: bus.id, vehicle_name: bus.name, channel: 'staff', sender_id: user.id, sender_email: user.email, sender_name: name, sender_role: user.role, text: `I missed my pickup (${row.reference}). Please contact me about this journey.` }).catch(() => {});
      }
      try {
        const admins = await db.User.filter({ role: 'admin' }, '-created_date', 200);
        const label = CASE_KIND_TEXT[row.kind] || 'Request';
        const subject = `${label} from ${name} (${row.reference})`;
        const rows = [['Reference', row.reference], ['Company', company?.name || ''], ['Bus', row.vehicle_name || 'None assigned'],
          ['For', row.kind === 'regular_days' ? patternText({ days: row.days, direction: row.direction, from: row.requested_date, until: row.until_date }) : [row.requested_date, row.requested_time].filter(Boolean).join(' ')], ['New pickup', row.requested_pickup || ''],
          ['Rating', row.rating ? `${row.rating} of 5` : ''], ['Details', row.details || '']].filter(([, v]) => v);
        const html = `<p><strong>${name}</strong> sent: ${label}.</p><table>${rows.map(([k, v]) => `<tr><td style="padding:4px 12px 4px 0;color:#555">${k}</td><td>${String(v).replace(/[<>&]/g, '')}</td></tr>`).join('')}</table><p><a href="${APP}/admin/support">Open Passenger support</a></p>`;
        await emailWithPolicy(base44, 'passenger_case', admins, (a) => base44.asServiceRole.integrations.Core.SendEmail({ to: a.email, subject, body: html, from_name: 'McSween Transport' }), { title: subject, companyId });
      } catch { /* the inbox still has it */ }
      return json({ ok: true, case: forPassenger(row) });
    }

    if (action === 'reply' || action === 'withdraw' || action === 'seen') {
      const row = await mine(body.id);
      if (!row) return json({ error: 'Request not found' }, 404);
      if (action === 'seen') { if (row.passenger_unread) await db.PassengerCase.update(row.id, { passenger_unread: false }); return json({ ok: true }); }
      if (!isOpen(row.status)) return json({ error: 'This request is finished. Start a new one if you still need help.' }, 409);
      if (action === 'withdraw') {
        const updated = await db.PassengerCase.update(row.id, { status: 'closed', closed_at: new Date().toISOString(), closed_by: 'Passenger', replies: appendReply(row, 'passenger', row.user_name || 'Passenger', 'I no longer need this.'), office_unread: true });
        return json({ ok: true, case: forPassenger(updated) });
      }
      const text = readReply(body.text);
      if (!text) return json({ error: 'Write a message first.' }, 400);
      if (!(await reserveAttempt(base44, 'passenger-case-reply:' + user.id, 20, 3600_000))) return json({ error: 'Please wait a little before sending more.' }, 429, { 'Retry-After': '300' });
      const updated = await db.PassengerCase.update(row.id, { replies: appendReply(row, 'passenger', row.user_name || 'Passenger', text), office_unread: true });
      return json({ ok: true, case: forPassenger(updated) });
    }

    // The passenger rides on their regular days off again, from now. The
    // office is told; nothing needs approving to add someone back.
    if (action === 'end_pattern') {
      const pattern = user.ride_pattern;
      if (!pattern?.days?.length) return json({ error: 'You have no regular days off.' }, 409);
      await db.User.update(user.id, { ride_pattern: null });
      const row = pattern.case_id ? await mine(pattern.case_id) : null;
      if (row) await db.PassengerCase.update(row.id, { status: 'closed', closed_at: new Date().toISOString(), closed_by: 'Passenger', office_unread: true, replies: appendReply(row, 'passenger', row.user_name || 'Passenger', `I’m riding on these days again from today (${today()}).`) });
      await db.AuditLog.create({ actor_email: user.email || '', actor_name: user.display_name || user.full_name || 'Passenger', actor_role: user.role, action: 'update', entity: 'User', record_id: user.id, page: '/rides', summary: `Ended regular days off (${pattern.reference || 'no reference'})` }).catch(() => {});
      return json({ ok: true, pattern: null });
    }

    return json({ error: 'Unknown action' }, 400);
  } catch (e) {
    const status = e?.status ?? e?.response?.status ?? 500;
    if (status === 429) return json({ error: 'Server is busy. Try again shortly.' }, 429, { 'Retry-After': '15' });
    return json({ error: status === 503 ? e.message : 'Could not load your requests. Try again.' }, status >= 400 && status < 600 ? status : 500);
  }
}
