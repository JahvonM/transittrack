import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';

// The app support WhatsApp number and the business details shown on the
// Terms page and the website (contact email, phone, address and the
// free-cancellation rule): one settings record for the whole app.
// "get" is open to everyone (passengers, drivers' tablets, admins, website
// visitors) because all of it is meant to be public; "set" and
// "set_business" are admins only.
const DIGITS = /^\d{7,15}$/;
const EMAIL = /^[^\s@<>"']{1,64}@[^\s@<>"']{1,190}\.[a-z]{2,24}$/i;
const PHONE = /^\+?[\d\s().-]{6,24}$/;
const clean = (v: unknown) => (typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim() : '');

// The business details as stored, or as shown when something odd is stored.
export function businessDetails(row: any) {
  const hours = Number(row?.cancel_free_hours);
  return {
    contact_email: EMAIL.test(clean(row?.contact_email)) ? clean(row.contact_email) : '',
    contact_phone: PHONE.test(clean(row?.contact_phone)) ? clean(row.contact_phone) : '',
    business_address: clean(row?.business_address).slice(0, 200),
    cancel_free_hours: row?.cancel_free_hours !== null && row?.cancel_free_hours !== undefined && row?.cancel_free_hours !== '' && Number.isInteger(hours) && hours >= 0 && hours <= 168 ? hours : null,
    cancel_late_charge: clean(row?.cancel_late_charge).slice(0, 120),
  };
}

// What an admin typed, checked. Throws a message they can act on.
export function readBusiness(body: any) {
  const contact_email = clean(body?.contact_email).toLowerCase();
  if (contact_email && !EMAIL.test(contact_email)) throw new Error('Check the email address');
  const contact_phone = clean(body?.contact_phone);
  if (contact_phone && !PHONE.test(contact_phone)) throw new Error('Check the phone number: digits, spaces and + only');
  const business_address = clean(body?.business_address);
  if (business_address.length > 200) throw new Error('The address is too long');
  const raw = body?.cancel_free_hours;
  let cancel_free_hours: number | null = null;
  if (raw !== null && raw !== undefined && raw !== '') {
    const n = Number(raw);
    if (!Number.isInteger(n) || n < 0 || n > 168) throw new Error('Free cancellation: give a whole number of hours from 0 to 168');
    cancel_free_hours = n;
  }
  const cancel_late_charge = clean(body?.cancel_late_charge);
  if (cancel_late_charge.length > 120) throw new Error('The late-cancellation charge is too long');
  if (cancel_late_charge && cancel_free_hours === null) throw new Error('Add the number of hours before pickup that cancelling stays free');
  return { contact_email, contact_phone, business_address, cancel_free_hours, cancel_late_charge };
}

export default async function(req) {
  try {
    const body = await req.json().catch(() => ({}));
    const base44 = createClientFromRequest(req);
    const db = base44.asServiceRole.entities.AppSupportSetting;
    const row = (await db.list('-updated_date', 1))[0] || null;

    if (body.action === 'set' || body.action === 'set_business') {
      const user = await base44.auth.me().catch(() => null);
      if (!user || user.role !== 'admin') return Response.json({ error: 'Admins only' }, { status: 403 });
    }

    if (body.action === 'set') {
      const number = String(body.whatsapp_number ?? '').replace(/[\s()+-]/g, '');
      if (number && !DIGITS.test(number)) return Response.json({ error: 'Enter the number with its country code, digits only, e.g. 14735551234' }, { status: 400 });
      if (row) await db.update(row.id, { whatsapp_number: number });
      else await db.create({ whatsapp_number: number });
      return Response.json({ ok: true, whatsapp_number: number });
    }

    if (body.action === 'set_business') {
      let details;
      try { details = readBusiness(body); }
      catch (e) { return Response.json({ error: (e as Error).message }, { status: 400 }); }
      if (row) await db.update(row.id, details);
      else await db.create(details);
      return Response.json({ ok: true, business: businessDetails(details) });
    }

    const number = row?.whatsapp_number && DIGITS.test(row.whatsapp_number) ? row.whatsapp_number : '';
    return Response.json({ whatsapp_number: number, business: businessDetails(row) });
  } catch {
    return Response.json({ error: 'Could not load the support details' }, { status: 500 });
  }
}
