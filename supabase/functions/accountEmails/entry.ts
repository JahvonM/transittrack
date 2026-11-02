import { createClientFromRequest } from '../_shared/base44-compat.ts';
import { reserveAttempt } from '../_shared/atomicOps.ts';
import { newSignInEmail, passwordChangedEmail, sendAccountEmail } from '../_shared/accountEmails.ts';

// Emails the signed-in person asks for about their own account. The address
// always comes from the session, never from the request.
//
//   password_changed: a password reset with an email link happens on the
//   sign-in service, which the app can't see. The reset page notes the time on
//   that browser, and the next sign-in there asks for the confirmation email
//   (Admin → Notifications → Password changed). At most one an hour each.
//
//   signed_in: the app says which browser it is (a random id it keeps, and a
//   plain description such as "Safari on an iPhone"). The first time an
//   account is seen on a new phone or browser, it gets the New sign-in email.
//   Not for the account's first device (nor every account's first open after
//   this went live), not on its first day (setting up often means a browser
//   and then the Home Screen app), and not for the same kind of phone or
//   browser again (cleared browser data). At most three a day.
const DAY_MS = 86400_000;
const deviceText = (v: unknown) => String(v ?? '').replace(/[\u0000-\u001F\u007F<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60);
async function deviceHash(value: string) {
  const data = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(data), (x) => x.toString(16).padStart(2, '0')).join('');
}

export default async function (req: Request) {
  try {
    const base44 = createClientFromRequest(req);
    const session = await base44.auth.me().catch((error: any) => {
      if ([401, 403].includes(error?.status ?? error?.response?.status)) return null;
      throw error;
    });
    if (!session) return Response.json({ error: 'Sign in required' }, { status: 401 });
    const body = await req.json().catch(() => ({}));
    const now = Date.now();
    const db = base44.asServiceRole.entities;

    if (body?.action === 'password_changed') {
      const at = Date.parse(String(body.changed_at || ''));
      // Only a reset in the last day; anything else is ignored quietly.
      if (!Number.isFinite(at) || at > now + 60_000 || at < now - DAY_MS) return Response.json({ ok: true, sent: false });
      if (!(await reserveAttempt(base44, 'password-changed:' + session.id, 1, 3600_000))) return Response.json({ ok: true, sent: false });
      const user = (await db.User.get(session.id).catch(() => null)) || session;
      const result = await sendAccountEmail(base44, 'password_changed', user.email, passwordChangedEmail({ name: user.display_name || user.full_name, at, how: 'reset' }));
      return Response.json({ ok: true, sent: result.sent > 0 });
    }

    if (body?.action === 'signed_in') {
      const id = String(body.device_id || '');
      if (!/^[A-Za-z0-9-]{16,64}$/.test(id)) return Response.json({ error: 'Unknown device' }, { status: 400 });
      const label = deviceText(body.device) || 'a new phone or browser';
      const hash = await deviceHash(session.id + ':' + id);
      const rows = await db.SignInDevice.filter({ user_id: session.id }, '-last_seen_at', 200).catch(() => []);
      const at = new Date(now).toISOString();
      const known = rows.find((r: any) => r.device_hash === hash);
      if (known) {
        if (!(Date.parse(known.last_seen_at) > now - DAY_MS)) await db.SignInDevice.update(known.id, { last_seen_at: at });
        return Response.json({ ok: true, known: true });
      }
      await db.SignInDevice.create({ user_id: session.id, device_hash: hash, label, first_seen_at: at, last_seen_at: at });
      const user = (await db.User.get(session.id).catch(() => null)) || session;
      const firstSeen = Math.min(...rows.map((r: any) => Date.parse(r.first_seen_at)).filter(Number.isFinite), Date.parse(user.created_date) || now);
      const quiet = !rows.length || now - firstSeen < DAY_MS || rows.some((r: any) => r.label === label);
      if (quiet) return Response.json({ ok: true, known: false, alerted: false });
      if (!(await reserveAttempt(base44, 'new-sign-in:' + session.id, 3, DAY_MS))) return Response.json({ ok: true, known: false, alerted: false });
      const result = await sendAccountEmail(base44, 'new_sign_in', user.email, newSignInEmail({ name: user.display_name || user.full_name, device: label, at: now }));
      return Response.json({ ok: true, known: false, alerted: result.sent > 0 });
    }

    return Response.json({ error: 'Unknown action' }, { status: 400 });
  } catch {
    return Response.json({ error: 'Could not send the email' }, { status: 503 });
  }
}
