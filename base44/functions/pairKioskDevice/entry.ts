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

    // Mark as paired, consume the code (one-time use), stamp last_seen
    await base44.asServiceRole.entities.KioskDevice.update(device.id, {
      paired: true,
      pairing_code: '',
      last_seen: new Date().toISOString()
    });

    let driver_name = '';
    if (device.vehicle_id) {
      try {
        const vehicle = await base44.asServiceRole.entities.Vehicle.get(device.vehicle_id);
        driver_name = vehicle?.driver_name || '';
      } catch { /* vehicle may not be set yet */ }
    }

    return Response.json({
      device_id: device.id,
      label: device.label,
      company_id: device.company_id,
      company_name: device.company_name,
      vehicle_id: device.vehicle_id,
      vehicle_name: device.vehicle_name,
      kiosk_type: device.kiosk_type,
      driver_name
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}