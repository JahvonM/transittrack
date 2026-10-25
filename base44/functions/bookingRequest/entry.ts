import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';
import { forwardToSupabase } from '../../shared/forwardToSupabase.ts';
import { reserveAttempt } from '../../shared/atomicOps.ts';
import { emailWithPolicy } from '../../shared/notificationPolicy.ts';
import { issueVisitorLink, sha256Hex } from '../../shared/visitorLinks.ts';

// Rides asked for on the public website (mcsweenstransport.com/book), and
// dispatch's answers to them. Nothing is booked until dispatch confirms:
// a request waits in Admin → Jobs → Requests, dispatch makes the job (time,
// bus, price), and the customer is emailed, with their tracking link once the
// job has a bus.
//
//   { action: 'request', ...form }               anyone; checked and rate-limited -> { ok }
//   { action: 'confirm', request_id, trip_id }   admins: customer emailed
//   { action: 'decline', request_id, reason }    admins: customer emailed
//   { action: 'spam', request_id }               admins: closed, nobody emailed
//   { action: 'send_tracking', trip_id }         admins: a fresh tracking link emailed

export const SERVICES: Record<string, string> = {
  airport_pickup: 'Airport pickup',
  airport_dropoff: 'Airport drop-off',
  hotel_tour: 'Island tour',
  transfer: 'Transfer',
  staff_run: 'Staff transport',
};
const AIRPORT = new Set(['airport_pickup', 'airport_dropoff']);
const EMAIL = /^[^\s@<>"']{1,64}@[^\s@<>"']{1,190}\.[a-z]{2,24}$/i;
const PHONE = /^\+?[\d\s().-]{6,24}$/;
const FLIGHT = /^[A-Z0-9][A-Z0-9 -]{1,11}$/i;
const ID = /^[A-Za-z0-9_-]{1,64}$/;
const APP = 'https://app.mcsweenstransport.com';
const ZONE = 'America/Grenada';

const json = (data: unknown, status = 200) => Response.json(data, { status, headers: { 'Cache-Control': 'no-store' } });
const fail = (status: number, error: string) => { throw Object.assign(new Error(error), { status }); };
const clean = (v: unknown) => (typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim() : '');
function field(body: any, key: string, label: string, min: number, max: number) {
  const value = clean(body?.[key]);
  if (value.length < min) fail(400, min > 1 ? `Please fill in ${label}.` : `Please add ${label}.`);
  if (value.length > max) fail(400, `${label[0].toUpperCase()}${label.slice(1)} is too long.`);
  return value;
}
function count(value: unknown, label: string, min: number, max: number, fallback: number) {
  if (value === undefined || value === null || value === '') return fallback;
  const n = Number(value);
  if (!Number.isInteger(n) || n < min || n > max) fail(400, `Please give a number of ${label} from ${min} to ${max}.`);
  return n;
}

// The form, checked. Throws a 400 with a message the customer can act on.
export function readRequest(body: any, now = Date.now()) {
  const service = String(body?.service || '');
  if (!Object.hasOwn(SERVICES, service)) fail(400, 'Please choose the kind of ride.');
  const at = Date.parse(String(body?.requested_time || ''));
  if (!Number.isFinite(at)) fail(400, 'Please choose the date and time.');
  if (at < now + 60 * 60_000) fail(400, 'Please choose a time at least an hour from now. For a ride sooner than that, message us on WhatsApp.');
  if (at > now + 366 * 86400_000) fail(400, 'Please choose a date within the next year.');
  const notes = clean(body?.notes);
  if (notes.length > 1000) fail(400, 'Your note is too long.');
  const email = clean(body?.email).toLowerCase();
  if (!EMAIL.test(email) || email.length > 254) fail(400, 'Please check your email address.');
  const phone = clean(body?.phone);
  if (!PHONE.test(phone)) fail(400, 'Please check your phone number.');
  const flight = clean(body?.flight_number).toUpperCase();
  if (flight && (!AIRPORT.has(service) || !FLIGHT.test(flight))) fail(400, 'Please check the flight number.');
  return {
    service,
    requested_time: new Date(at).toISOString(),
    pickup: field(body, 'pickup', 'where to pick you up', 2, 160),
    dropoff: field(body, 'dropoff', 'where you are going', 2, 160),
    guests: count(body?.guests, 'passengers', 1, 60, 1),
    luggage: count(body?.luggage, 'bags', 0, 100, 0),
    flight_number: flight,
    name: field(body, 'name', 'your name', 2, 80),
    phone,
    email,
    notes,
  };
}

const esc = (v: unknown) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
export function grenadaTime(iso: string) {
  const t = Date.parse(iso || '');
  if (!Number.isFinite(t)) return '';
  return new Date(t).toLocaleString('en-GB', { timeZone: ZONE, weekday: 'long', day: 'numeric', month: 'long', hour: 'numeric', minute: '2-digit', hour12: true });
}
// A plain, readable email: a heading, a few lines, a table of details, and
// at most one button.
export function emailHtml({ heading, lines = [], rows = [], button = null }: { heading: string; lines?: string[]; rows?: [string, string][]; button?: { label: string; url: string } | null }) {
  const table = rows.filter(([, v]) => v).map(([k, v]) => `<tr><td style="padding:6px 16px 6px 0;color:#5b6b70;vertical-align:top;white-space:nowrap">${esc(k)}</td><td style="padding:6px 0;color:#12262c">${esc(v)}</td></tr>`).join('');
  return `<!doctype html><html><body style="margin:0;background:#eef4f3;font-family:Helvetica,Arial,sans-serif">
<div style="max-width:560px;margin:0 auto;padding:28px 20px">
<p style="margin:0 0 18px;font-weight:700;font-size:18px;color:#0e4a5a">McSween Transport</p>
<div style="background:#ffffff;border-radius:14px;padding:26px 24px">
<h1 style="margin:0 0 12px;font-size:22px;line-height:1.3;color:#12262c">${esc(heading)}</h1>
${lines.map((l) => `<p style="margin:0 0 12px;font-size:15px;line-height:1.55;color:#12262c">${esc(l)}</p>`).join('')}
${table ? `<table style="border-collapse:collapse;font-size:15px;margin:8px 0 4px">${table}</table>` : ''}
${button ? `<p style="margin:22px 0 4px"><a href="${esc(button.url)}" style="display:inline-block;background:#c8322b;color:#ffffff;text-decoration:none;font-weight:700;padding:12px 20px;border-radius:10px">${esc(button.label)}</a></p>` : ''}
</div>
<p style="margin:16px 4px 0;font-size:12px;color:#5b6b70">McSween's Transport and Reside Co., Grenada. You're getting this because a ride was requested with this email address on mcsweenstransport.com.</p>
</div></body></html>`;
}
const detailRows = (r: any): [string, string][] => [
  ['Ride', SERVICES[r.service] || 'Ride'],
  ['When', grenadaTime(r.requested_time)],
  ['Pickup', r.pickup],
  ['Drop-off', r.dropoff],
  ['Passengers', r.guests ? String(r.guests) : ''],
  ['Bags', r.luggage ? String(r.luggage) : ''],
  ['Flight', r.flight_number || ''],
];

// To the customer. Logged like every other email (Admin → Notifications);
// these replies can't be switched off. Throws when it couldn't be sent.
async function send(base44: any, to: string, subject: string, body: string) {
  const result = await emailWithPolicy(base44, 'booking_reply', [{ email: to }],
    () => base44.asServiceRole.integrations.Core.SendEmail({ to, subject, body, from_name: 'McSween Transport' }), { title: subject });
  if (!result?.sent) throw new Error('The email could not be sent');
}
function clientAddress(req: Request) {
  const forwarded = req.headers.get('x-forwarded-for') || '';
  return (req.headers.get('cf-connecting-ip') || forwarded.split(',')[0] || 'unknown').trim().slice(0, 64);
}
async function admin(base44: any) {
  const user = await base44.auth.me().catch(() => null);
  if (user?.role !== 'admin') fail(user ? 403 : 401, user ? 'Administrators only' : 'Please sign in');
  return user;
}
async function openRequest(db: any, id: unknown) {
  if (typeof id !== 'string' || !ID.test(id)) fail(400, 'Choose a request');
  const row = await db.BookingRequest.get(id).catch((e: any) => { if ((e?.status ?? e?.response?.status) === 404) return null; throw e; });
  if (!row) fail(404, 'That request was not found');
  return row;
}

export default async function (req: Request) {
  const forwarded = await forwardToSupabase(req, 'bookingRequest');
  if (forwarded) return forwarded;
  try {
    const body = await req.json().catch(() => ({}));
    const base44 = createClientFromRequest(req), db = base44.asServiceRole.entities;
    const action = body?.action;

    if (action === 'request') {
      // Bots: a hidden field people never see, and a form sent faster than a
      // person could fill it in. They get a normal answer and nothing is kept.
      if (clean(body.website) || Number(body.form_ms) < 3000) return json({ ok: true });
      const data = readRequest(body);
      const ip = await sha256Hex('booking-ip:' + clientAddress(req));
      if (!(await reserveAttempt(base44, 'booking-ip:' + ip, 5, 3600_000))
        || !(await reserveAttempt(base44, 'booking-email:' + data.email, 3, 3600_000))
        || !(await reserveAttempt(base44, 'booking-all', 60, 3600_000))) {
        return json({ error: 'Too many requests from here. Please try again later, or message us on WhatsApp.' }, 429);
      }
      const row = await db.BookingRequest.create({ ...data, status: 'new' });
      const service = SERVICES[data.service];
      try {
        await send(base44, data.email, 'We have your ride request', emailHtml({
          heading: `Thanks, ${data.name.split(' ')[0]}. We have your request.`,
          lines: ['We will email you to confirm the time and the price. Nothing is booked until then.', 'If anything changes, reply on WhatsApp or send a new request.'],
          rows: detailRows(data),
        }));
      } catch (e) { console.error('[booking] customer email failed', (e as Error)?.message); }
      try {
        const admins = await db.User.filter({ role: 'admin' }, '-created_date', 200);
        const subject = `New ride request: ${service}, ${grenadaTime(data.requested_time)}`;
        const html = emailHtml({
          heading: `${data.name} asked for a ride`,
          lines: ['Open Jobs → Requests to make the job, or to decline it.'],
          rows: [...detailRows(data), ['Phone', data.phone], ['Email', data.email], ['Note', data.notes]],
          button: { label: 'Open requests', url: `${APP}/admin/trips` },
        });
        await emailWithPolicy(base44, 'booking_request', admins,
          (a: any) => base44.asServiceRole.integrations.Core.SendEmail({ to: a.email, subject, body: html, from_name: 'McSween Transport' }), { title: subject });
      } catch (e) { console.error('[booking] admin email failed', (e as Error)?.message); }
      return json({ ok: true, id: row.id });
    }

    if (action === 'confirm') {
      const user = await admin(base44);
      const row = await openRequest(db, body.request_id);
      if (row.status !== 'new') fail(409, 'This request was already answered');
      if (typeof body.trip_id !== 'string' || !ID.test(body.trip_id)) fail(400, 'Make the job first');
      const trip = await db.Trip.get(body.trip_id).catch(() => null);
      if (!trip || trip.status === 'cancelled') fail(404, 'That job was not found');
      const link = await issueVisitorLink(db, trip);
      const now = new Date().toISOString();
      await db.BookingRequest.update(row.id, { status: 'confirmed', trip_id: trip.id, handled_by: user.email, handled_at: now, ...(link ? { tracking_sent_at: now } : {}) });
      const price = Number.isFinite(Number(trip.price)) && trip.price !== null && trip.price !== '' ? `${Number(trip.price).toFixed(2)} ${trip.currency || 'XCD'}` : '';
      let emailed = true;
      try {
        await send(base44, row.email, 'Your ride is confirmed', emailHtml({
          heading: 'Your ride is confirmed',
          lines: [link ? 'You can follow your bus on the way with the button below.' : 'We will email your tracking link once your bus is assigned.'],
          rows: [
            ['Ride', SERVICES[row.service] || 'Ride'],
            ['When', grenadaTime(trip.scheduled_time || row.requested_time)],
            ['Pickup', trip.pickup_name || row.pickup],
            ['Drop-off', trip.dropoff_name || row.dropoff],
            ['Bus', [trip.vehicle_name, trip.plate_number].filter(Boolean).join(', ')],
            ['Price', price],
          ],
          button: link ? { label: 'Track my ride', url: link.url } : null,
        }));
      } catch (e) { emailed = false; console.error('[booking] confirm email failed', (e as Error)?.message); }
      return json({ ok: true, emailed, tracking: !!link });
    }

    if (action === 'decline' || action === 'spam') {
      const user = await admin(base44);
      const row = await openRequest(db, body.request_id);
      if (row.status !== 'new') fail(409, 'This request was already answered');
      const reason = action === 'spam' ? 'spam' : clean(body.reason);
      if (reason.length > 300) fail(400, 'The reason is too long');
      await db.BookingRequest.update(row.id, { status: 'declined', decline_reason: reason, handled_by: user.email, handled_at: new Date().toISOString() });
      if (action === 'spam') return json({ ok: true, emailed: false });
      let emailed = true;
      try {
        await send(base44, row.email, 'About your ride request', emailHtml({
          heading: 'We can\'t take this ride',
          lines: [reason || 'We are not able to take this ride at that time.', 'You are welcome to send a new request for another time, or message us on WhatsApp.'],
          rows: detailRows(row),
        }));
      } catch (e) { emailed = false; console.error('[booking] decline email failed', (e as Error)?.message); }
      return json({ ok: true, emailed });
    }

    if (action === 'send_tracking') {
      const user = await admin(base44);
      if (typeof body.trip_id !== 'string' || !ID.test(body.trip_id)) fail(400, 'Choose a job');
      if (!(await reserveAttempt(base44, 'booking-tracking:' + user.id, 30, 60_000))) fail(429, 'Try again in a minute');
      const [row] = await db.BookingRequest.filter({ trip_id: body.trip_id }, '-created_date', 1);
      if (!row) fail(404, 'This job was not booked on the website');
      const trip = await db.Trip.get(body.trip_id).catch(() => null);
      const link = await issueVisitorLink(db, trip);
      if (!link) fail(409, 'Give the job a bus first');
      await send(base44, row.email, 'Track your ride', emailHtml({
        heading: 'Follow your bus',
        lines: ['Use the button below to see where your bus is on the way to you.'],
        rows: [['When', grenadaTime(trip.scheduled_time)], ['Pickup', trip.pickup_name], ['Bus', [trip.vehicle_name, trip.plate_number].filter(Boolean).join(', ')]],
        button: { label: 'Track my ride', url: link.url },
      }));
      await db.BookingRequest.update(row.id, { tracking_sent_at: new Date().toISOString() });
      return json({ ok: true, to: row.email });
    }

    return json({ error: 'Unknown action' }, 400);
  } catch (e: any) {
    const status = Number(e?.status ?? e?.response?.status);
    if (status >= 400 && status < 500) return json({ error: e.message || 'Request failed' }, status);
    console.error('[booking] failed', e?.message);
    return json({ error: 'Booking is temporarily unavailable. Please try again, or message us on WhatsApp.' }, 503);
  }
}
