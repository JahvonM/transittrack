import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { retry429 } from '../../shared/retry429.ts';

// Someone renaming themselves in My Account. Records across the app already
// carry a copy of their name (the passenger-directory entry, their boarding
// card, their chat messages, the driver records logged under their email), and
// those copies would keep showing the old name on other people's screens.
// This follows the change through them. It runs only for the signed-in person
// and only ever touches records that belong to them.
export default async function (req) {
 try {
  const base44 = createClientFromRequest(req);
  const user = await base44.auth.me();
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const name = String(user.display_name || user.full_name || '').trim();
  if (!name) return Response.json({ ok: true, name: '' });

  const db = base44.asServiceRole.entities;
  const jobs = [
   // Their boarding card, and the messages they posted in a bus or company chat.
   retry429(() => db.NfcCard.updateMany({ holder_source: 'user', holder_id: user.id }, { $set: { holder_name: name } })),
   retry429(() => db.GroupMessage.updateMany({ created_by_id: user.id }, { $set: { sender_name: name } })),
   retry429(() => db.LostItemReport.updateMany({ created_by_id: user.id }, { $set: { reporter_name: name } })),
  ];

  if (user.email) {
   // Their passenger-directory entry (the admin's passenger list), matched by email.
   jobs.push(retry429(() => db.Contact.updateMany({ email: { $in: [user.email, String(user.email).toLowerCase()] } }, { $set: { name } })));
   // Records logged against the driver's email.
   for (const entity of ['Inspection', 'Incident', 'DriverShift', 'DrivingEvent']) {
    jobs.push(retry429(() => db[entity].updateMany({ driver_email: user.email }, { $set: { driver_name: name } })));
   }
  }

  await Promise.allSettled(jobs);
  return Response.json({ ok: true, name });
 } catch (error) {
  // auth.me() throws when nobody is signed in: that's a 401, not a server error.
  const status = error?.status ?? error?.response?.status;
  if (status === 401 || status === 403) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  return Response.json({ error: error.message }, { status: 500 });
 }
}