import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';
import { newNetworkCommand } from '../../shared/tabletNetwork.ts';

// Admin → Kiosk tablets (admins only):
//   { device_id, action: 'scan' }                          boarding tablet: list nearby Wi-Fi
//   { device_id, action: 'join', ssid, password }          boarding tablet: switch Wi-Fi
//   { device_id, action: 'hotspot', always_on: boolean }   driver tablet: hotspot always on / normal
// The command waits on the tablet record until the tablet's next check-in
// collects it; the TransitTrack Helper app on the tablet (1.9+) carries it out
// and reports back in its health. See shared/tabletNetwork.ts.
async function audit(base44, user, device, summary) {
  try {
    await base44.asServiceRole.entities.AuditLog.create({
      actor_email: user.email || '', actor_name: user.full_name || user.email || '', actor_role: user.role || '',
      action: 'update', entity: 'KioskDevice', record_id: device.id, page: '/admin/kiosks', summary,
    });
  } catch { /* logging must never block the change */ }
}

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch(() => null);
    if (!user || user.role !== 'admin') return Response.json({ error: 'Admins only' }, { status: 403 });
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== 'object' || Array.isArray(body)) return Response.json({ error: 'Invalid request' }, { status: 400 });
    const deviceId = body.device_id;
    if (typeof deviceId !== 'string' || !/^[A-Za-z0-9_-]{6,64}$/.test(deviceId)) return Response.json({ error: 'Choose a tablet' }, { status: 400 });

    const db = base44.asServiceRole.entities;
    const device = await db.KioskDevice.get(deviceId).catch(() => null);
    if (!device) return Response.json({ error: 'Tablet not found' }, { status: 404 });
    if (device.status !== 'active' || device.paired !== true) {
      return Response.json({ error: "This tablet isn't paired. Pair it first, then try again." }, { status: 409 });
    }

    let built;
    try { built = newNetworkCommand(device, body); }
    catch (e) { return Response.json({ error: e instanceof Error ? e.message : 'Invalid request' }, { status: 400 }); }

    if (built.command.type === 'wifi_join') {
      // A Wi-Fi password is only handed to a tablet that proves its device key,
      // which tablets paired before secure pairing don't have.
      const credentials = await db.DeviceCredential.filter({ device_id: device.id }, '-issued_at', 1);
      if (!credentials.length) {
        return Response.json({ error: 'This tablet was paired before secure pairing. Re-pair it (Regenerate its code and pair again), then choose its Wi-Fi here.' }, { status: 409 });
      }
    }

    const status = { ...built.status, requested_by: user.email || '' };
    await db.KioskDevice.update(device.id, { network_command: built.command, network_status: status });
    const name = device.label || device.vehicle_name || 'tablet';
    await audit(base44, user, device,
      built.command.type === 'wifi_scan' ? `Asked ${name} to scan for Wi-Fi`
        : built.command.type === 'wifi_join' ? `Asked ${name} to join Wi-Fi "${built.command.ssid}"`
          : `Set ${name} hotspot to ${built.command.always_on ? 'always on' : 'normal (on while the bus runs)'}`);
    return Response.json({ ok: true, status });
  } catch {
    return Response.json({ error: 'Something went wrong. Please try again.' }, { status: 500 });
  }
}
