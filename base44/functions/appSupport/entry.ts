import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';

// The app support WhatsApp number, one setting for the whole app.
// "get" is open to everyone (passengers, drivers' tablets, admins) because the
// number is meant to be public; "set" is admins only.
const DIGITS = /^\d{7,15}$/;

export default async function(req) {
  try {
    const body = await req.json().catch(() => ({}));
    const base44 = createClientFromRequest(req);
    const db = base44.asServiceRole.entities.AppSupportSetting;
    const row = (await db.list('-updated_date', 1))[0] || null;

    if (body.action === 'set') {
      const user = await base44.auth.me().catch(() => null);
      if (!user || user.role !== 'admin') return Response.json({ error: 'Admins only' }, { status: 403 });
      const number = String(body.whatsapp_number ?? '').replace(/[\s()+-]/g, '');
      if (number && !DIGITS.test(number)) return Response.json({ error: 'Enter the number with its country code, digits only, e.g. 14735551234' }, { status: 400 });
      if (row) await db.update(row.id, { whatsapp_number: number });
      else await db.create({ whatsapp_number: number });
      return Response.json({ ok: true, whatsapp_number: number });
    }

    const number = row?.whatsapp_number && DIGITS.test(row.whatsapp_number) ? row.whatsapp_number : '';
    return Response.json({ whatsapp_number: number });
  } catch {
    return Response.json({ error: 'Could not load the support number' }, { status: 500 });
  }
}
