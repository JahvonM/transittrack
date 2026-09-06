import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const to = String(body?.to_email || '').trim();
    const staffName = String(body?.staff_name || '');
    const vehicleName = String(body?.vehicle_name || '');
    const driverName = String(body?.driver_name || '');
    const companyName = String(body?.company_name || '');

    if (!to) return Response.json({ error: 'Missing recipient' }, { status: 400 });

    const subject = `Your bus is approaching — ${vehicleName}`;
    const message =
      `Hello ${staffName || 'there'},\n\n` +
      `${vehicleName}${driverName ? ` (driver ${driverName})` : ''} is near your pickup location` +
      `${companyName ? ` for ${companyName}` : ''} and will arrive shortly. Please get ready to board.\n\n` +
      `— TransitTrack`;

    await base44.asServiceRole.integrations.Core.SendEmail({
      to,
      subject,
      body: message,
    });

    return Response.json({ ok: true });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}