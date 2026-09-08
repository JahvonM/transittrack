import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';

export default async function(req) {
  try {
    const body = await req.json();
    const { device_id } = body;

    if (!device_id || typeof device_id !== 'string') {
      return Response.json({ error: 'Device ID required' }, { status: 400 });
    }

    const base44 = createClientFromRequest(req);

    // Update last_seen — kiosk is unauthenticated, use service role
    await base44.asServiceRole.entities.KioskDevice.update(device_id, {
      last_seen: new Date().toISOString()
    });

    return Response.json({ ok: true });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}