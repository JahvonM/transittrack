import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';

export default async function(req) {
  try {
    const body = await req.json();
    const { pairing_code } = body;

    if (!pairing_code || typeof pairing_code !== 'string' || pairing_code.trim().length < 4) {
      return Response.json({ error: 'A valid pairing code is required' }, { status: 400 });
    }

    const base44 = createClientFromRequest(req);

    // Kiosk tablets are unauthenticated — look up via service role.
    // The pairing code itself is the credential.
    const devices = await base44.asServiceRole.entities.KioskDevice.filter({
      pairing_code: pairing_code.trim().toUpperCase(),
      status: 'active'
    });

    if (devices.length === 0) {
      return Response.json({ error: 'Invalid or expired pairing code' }, { status: 404 });
    }

    const device = devices[0];

    // Block re-pairing an already-paired device with the same old code (the
    // one-time-use guarantee). This used to be enforced by blanking
    // pairing_code on success, but that also erased the admin's ability to
    // copy that device's URL again later, forcing a disruptive "Regenerate"
    // (which unpairs the tablet) just to retrieve the link. Checking the
    // `paired` flag gives the same one-time-use guarantee without losing the
    // stored code.
    if (device.paired) {
      return Response.json({ error: 'This code has already been used to pair a tablet. Ask an admin to generate a new one.' }, { status: 409 });
    }

    // Mark as paired, stamp last_seen
    await base44.asServiceRole.entities.KioskDevice.update(device.id, {
      paired: true,
      last_seen: new Date().toISOString()
    });

    let driver_name = '';
    if (device.vehicle_id) {
      try {
        const vehicle = await base44.asServiceRole.entities.Vehicle.get(device.vehicle_id);
        driver_name = vehicle?.driver_name || '';
      } catch { /* vehicle may not be set yet */ }
    }

    let company_logo_url = '';
    if (device.company_id) {
      try {
        const company = await base44.asServiceRole.entities.Company.get(device.company_id);
        company_logo_url = company?.logo_url || '';
      } catch { /* company may have been removed */ }
    }

    return Response.json({
      device_id: device.id,
      label: device.label,
      company_id: device.company_id,
      company_name: device.company_name,
      company_logo_url,
      vehicle_id: device.vehicle_id,
      vehicle_name: device.vehicle_name,
      kiosk_type: device.kiosk_type,
      driver_name
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}