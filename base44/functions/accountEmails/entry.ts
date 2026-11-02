import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';
import { reserveAttempt } from '../../shared/atomicOps.ts';
import { passwordChangedEmail, sendAccountEmail } from '../../shared/accountEmails.ts';

// Emails the signed-in person asks for about their own account. The address
// always comes from the session, never from the request.
//
//   password_changed: a password reset with an email link happens on the
//   sign-in service, which the app can't see. The reset page notes the time on
//   that browser, and the next sign-in there asks for the confirmation email
//   (Admin → Notifications → Password changed). At most one an hour each.
export default async function (req: Request) {
  try {
    const base44 = createClientFromRequest(req);
    const session = await base44.auth.me().catch((error: any) => {
      if ([401, 403].includes(error?.status ?? error?.response?.status)) return null;
      throw error;
    });
    if (!session) return Response.json({ error: 'Sign in required' }, { status: 401 });
    const body = await req.json().catch(() => ({}));
    if (body?.action !== 'password_changed') return Response.json({ error: 'Unknown action' }, { status: 400 });
    const now = Date.now();
    const at = Date.parse(String(body.changed_at || ''));
    // Only a reset in the last day; anything else is ignored quietly.
    if (!Number.isFinite(at) || at > now + 60_000 || at < now - 86400_000) return Response.json({ ok: true, sent: false });
    if (!(await reserveAttempt(base44, 'password-changed:' + session.id, 1, 3600_000))) return Response.json({ ok: true, sent: false });
    const user = (await base44.asServiceRole.entities.User.get(session.id).catch(() => null)) || session;
    const result = await sendAccountEmail(base44, 'password_changed', user.email, passwordChangedEmail({ name: user.display_name || user.full_name, at, how: 'reset' }));
    return Response.json({ ok: true, sent: result.sent > 0 });
  } catch {
    return Response.json({ error: 'Could not send the email' }, { status: 503 });
  }
}
