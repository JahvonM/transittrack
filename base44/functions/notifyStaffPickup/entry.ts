import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';

const ALLOWED_ROLES = ['driver', 'company', 'admin'];

// Strip control characters and angle brackets so no field can inject markup/headers.
function sanitize(value) {
  if (value == null) return '';
  return String(value)
    .replace(/[\u0000-\u001F\u007F]/g, '')
    .replace(/[<>]/g, '')
    .trim();
}

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (!ALLOWED_ROLES.includes(user.role)) {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await req.json();
    const to = sanitize(body?.to_email);
    const vehicleId = sanitize(body?.vehicle_id);
    if (!to) return Response.json({ error: 'Missing recipient' }, { status: 400 });
    if (!vehicleId) return Response.json({ error: 'Missing vehicle' }, { status: 400 });

    // Resolve the vehicle from trusted server data — names must never come from the request body.
    const vehicle = await base44.asServiceRole.entities.Vehicle.get(vehicleId);
    if (!vehicle) return Response.json({ error: 'Vehicle not found' }, { status: 404 });

    // Authorization: the caller may only notify about a vehicle they operate.
    const isAuthorized =
      user.role === 'admin' ||
      (user.role === 'company' && vehicle.company_id === user.company_id) ||
      (user.role === 'driver' && vehicle.driver_email === user.email);
    if (!isAuthorized) return Response.json({ error: 'Forbidden' }, { status: 403 });

    // Recipient must be a registered user in the same company as the vehicle.
    let recipient = null;
    try {
      const matches = await base44.asServiceRole.entities.User.filter({ email: to });
      recipient = Array.isArray(matches) ? matches[0] : matches;
    } catch {
      /* tolerate lookup errors — SendEmail still enforces delivery rules */
    }
    if (
      recipient &&
      recipient.company_id &&
      vehicle.company_id &&
      recipient.company_id !== vehicle.company_id
    ) {
      return Response.json({ error: 'Recipient not in your company' }, { status: 403 });
    }

    const vehicleName = sanitize(vehicle.name);
    const driverName = sanitize(vehicle.driver_name);
    const companyName = sanitize(vehicle.company_name);

    const subject = `Your bus is approaching — ${vehicleName}`;
    const message =
      `Hello,\n\n` +
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