import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';

const HOUR_MS = 60 * 60 * 1000;
const clip = (v, n) => (typeof v === 'string' ? v.slice(0, n) : '');

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
    const recent = await db.ClientError.filter({ message }, '-created_date', 1);
    const alreadyAlerted = recent.length > 0 && recent[0].created_date >= since;

    const record = await db.ClientError.create({
      message,
      stack: clip(body.stack, 4000),
      url: clip(body.url, 300),
      user_agent: clip(body.user_agent, 300),
      source: clip(body.source, 20),
      user_email: user?.email || '',
      user_role: user?.role || '',
      emailed: !alreadyAlerted,
    });

    if (!alreadyAlerted) {
      const admins = (await base44.asServiceRole.entities.User.list()).filter((u) => u.role === 'admin' && u.email);
      const text = `A screen in TransitTrack just crashed.\n\nError: ${message}\nPage: ${record.url || 'unknown'}\nUser: ${record.user_email || 'not signed in'}${record.user_role ? ` (${record.user_role})` : ''}\nDevice: ${record.user_agent || 'unknown'}\n\nThe user saw a "Something went wrong" screen with a reload button. Repeats of this same error in the next hour won't send another email. Full details are in Admin → Data manager → ClientError.\n\n— TransitTrack`;
      for (const a of admins) {
        try {
          await base44.asServiceRole.integrations.Core.SendEmail({ to: a.email, subject: `TransitTrack crash: ${message.slice(0, 80)}`, body: text });
        } catch { /* email is best-effort */ }
      }
    }

    return Response.json({ ok: true });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}
