import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';

export default async function(req) {
  try {
    const body = await req.json();
    const { device_id } = body;

    if (!device_id || typeof device_id !== 'string') {
      return Response.json({ error: 'Device ID required' }, { status: 400 });
    }

    const base44 = createClientFromRequest(req);

    const device = await base44.asServiceRole.entities.KioskDevice.get(device_id);
    // `paired` must be checked here too, not just `status` — an admin
    // regenerating this device's pairing code (KioskTablets.jsx's
    // Regenerate/Reactivate actions) sets paired:false but leaves
    // status:'active'. Without this check the tablet keeps heartbeating
    // successfully and looking completely normal while every real action
    // (kioskCheckIn's resolveKioskDevice requires both) silently 401s.
    if (!device || device.status !== 'active' || !device.paired) {
      return Response.json({ error: 'Device not found, inactive, or unpaired' }, { status: 404 });
    }

    // Update last_seen — kiosk is unauthenticated, use service role
    await base44.asServiceRole.entities.KioskDevice.update(device_id, {
      last_seen: new Date().toISOString()
    });

    return Response.json({
      ok: true,
      device_id: device.id,
      label: device.label,
      company_id: device.company_id,
      company_name: device.company_name,
      vehicle_id: device.vehicle_id,
      vehicle_name: device.vehicle_name,
      kiosk_type: device.kiosk_type,
      paired: device.paired
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}