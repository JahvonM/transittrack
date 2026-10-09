import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';
import { emailWithPolicy } from '../../shared/notificationPolicy.ts';

const HOUR_MS = 60 * 60 * 1000;
// This endpoint is callable without a login, so cap what it can do per hour
// no matter how many distinct messages arrive.
const MAX_EMAILS_PER_HOUR = 5;
const MAX_RECORDS_PER_HOUR = 200;
const clip = (v, n) => (typeof v === 'string' ? v.slice(0, n) : '');
// This endpoint is anonymous, so everything it echoes into an alert email is
// untrusted text: strip control characters and angle brackets, and present the
// error as an indented, clearly-labelled quote so it can't impersonate the
// alert or smuggle in extra fields/links of its own.
const sanitize = (v, n) => clip(v, n).replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/[<>]/g, '').trim();
const quote = (v, n) => clip(v, n).split(/\r?\n/).map((line) => `    | ${sanitize(line, n)}`).join('\n');

// Records a crash reported by the app (signed-in users, kiosks and driver
// tablets alike, so it can't rely on the caller's own permissions) and emails
// admins the first time a given error message shows up in an hour, so a bad
// deploy produces one alert rather than one per user.
export default async function (req) {
  try {
    const body = await req.json().catch(() => ({}));
    const message = clip(body.message, 500);
    if (!message) return Response.json({ error: 'message required' }, { status: 400 });

    const base44 = createClientFromRequest(req);
    let user = null;
    try { user = await base44.auth.me(); } catch { /* kiosk / signed out */ }

    const db = base44.asServiceRole.entities;
    const since = new Date(Date.now() - HOUR_MS).toISOString();
    const latest = await db.ClientError.list('-created_date', MAX_RECORDS_PER_HOUR);
    if (latest.length >= MAX_RECORDS_PER_HOUR && latest[latest.length - 1].created_date >= since) {
      return Response.json({ ok: true, throttled: true });
    }
    const emailedThisHour = latest.filter((r) => r.emailed && r.created_date >= since).length;
    const recent = await db.ClientError.filter({ message }, '-created_date', 1);
    const alreadyAlerted = (recent.length > 0 && recent[0].created_date >= since) || emailedThisHour >= MAX_EMAILS_PER_HOUR;

    const record = await db.ClientError.create({
      message,
      stack: clip(body.stack, 4000),
      url: clip(body.url, 300),
      user_agent: clip(body.user_agent, 300),
      source: clip(body.source, 20),
      device_id: clip(body.device_id, 40),
      user_email: user?.email || '',
      user_role: user?.role || '',
      emailed: !alreadyAlerted,
    });

    if (!alreadyAlerted) {
      const admins = (await base44.asServiceRole.entities.User.list()).filter((u) => u.role === 'admin' && u.email);
      const subjectLine = sanitize(message, 80) || 'unknown error';
      const text = `A screen in TransitTrack just crashed.\n\nReported error (untrusted, quoted verbatim):\n${quote(message, 500)}\n\nPage: ${sanitize(record.url, 300) || 'unknown'}\nUser: ${record.user_email || 'not signed in'}${record.user_role ? ` (${record.user_role})` : ''}\nDevice: ${sanitize(record.user_agent, 300) || 'unknown'}\n\nThe user saw a "Something went wrong" screen with a reload button. Repeats of this same error in the next hour won't send another email. Full details are in Admin → Data manager → ClientError.\n\n— TransitTrack`;
      const subject = `TransitTrack crash alert: ${subjectLine}`;
      await emailWithPolicy(base44, 'crash_alert', admins,
        (a) => base44.asServiceRole.integrations.Core.SendEmail({ to: a.email, subject, body: text }), { title: subject });
    }

    return Response.json({ ok: true });
  } catch (error) {
    return Response.json({ error: 'Something went wrong. Please try again.' }, { status: 500 });
  }
}