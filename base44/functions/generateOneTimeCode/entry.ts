import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';

const CODE_TTL_MS = 30 * 60 * 1000; // 30 minutes — long enough to walk to the bus, short enough to matter if lost

function randomDigits(len) {
  let out = '';
  for (let i = 0; i < len; i++) out += Math.floor(Math.random() * 10);
  return out;
}

// Staff self-service: "I forgot my badge" button in the staff app. Only
// works for logged-in Users (Contact-only staff have no app to call this
// from) — generates a short-lived code the bus boarding kiosk's keypad will
// accept once, in place of an NFC tap or the permanent access_code.
export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const code = randomDigits(6);
    const expiresAt = new Date(Date.now() + CODE_TTL_MS).toISOString();
    await base44.asServiceRole.entities.User.update(user.id, {
      one_time_code: code, one_time_code_expires_at: expiresAt,
    });

    return Response.json({ code, expires_at: expiresAt });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}
