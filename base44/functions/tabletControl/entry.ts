import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';
import { CONTROL_TTL, controlId, currentControl, newControl, strictControlDevice, controlCompletion } from '../../shared/tabletControl.ts';
const reply = (body, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
export default async function(req) {
  try {
    if (req.method !== 'POST') return reply({ error: 'POST required' }, 405);
    const input = await req.json().catch(() => null);
    if (!input || typeof input !== 'object' || Array.isArray(input)) return reply({ error: 'Invalid request' }, 400);
    const base44 = createClientFromRequest(req), db = base44.asServiceRole.entities;
    const deviceId = input.device_id;
    if (typeof deviceId !== 'string' || !/^[A-Za-z0-9_-]{6,64}$/.test(deviceId)) return reply({ error: 'Choose a tablet' }, 400);
    // Check administrator identity before looking up a tablet on admin routes.
    let admin = null;
    if (input.operation === 'request') {
      admin = await base44.auth.me().catch(() => null);
      if (admin?.role !== 'admin') return reply({ error: 'Admins only' }, 403);
    } else if (!['claim', 'result'].includes(input.operation)) return reply({ error: 'Unknown operation' }, 400);
    const device = await db.KioskDevice.get(deviceId).catch(() => null);
    if (!device) return reply({ error: 'Tablet unavailable' }, 404);
    const now = Date.now();
    if (admin) {
      if (device.status !== 'active' || device.paired !== true) return reply({ error: 'Pair this tablet first' }, 409);
      const prior = device.control_command;
      if (currentControl(device, now) && device.control_status?.state === 'waiting') return reply({ error: 'A tablet command is already waiting. Wait for completion or expiry.' }, 409);
      if (input.action !== 'release' && prior && now - Date.parse(prior.requested_at) < CONTROL_TTL) return reply({ error: 'Wait two minutes between tablet commands.' }, 429);
      const credential = (await db.DeviceCredential.filter({ device_id: device.id }, '-issued_at', 1))[0];
      if (!credential || !(Date.parse(credential.expires_at) > now)) return reply({ error: 'Secure tablet pairing is required for managed controls.' }, 409);
      let built; try { built = newControl(device, input.action, admin.id, now); }
      catch { return reply({ error: 'Choose a supported tablet action' }, 400); }
      await db.KioskDevice.update(device.id, { control_command: built.command, control_status: built.status });
      // No credentials or arbitrary remote code in audit records.
      await db.AuditLog.create({ actor_email: admin.email || '', actor_role: 'admin', action: 'update',
        entity: 'KioskDevice', record_id: device.id, page: '/admin/kiosks',
        summary: 'Requested tablet control: ' + built.command.action }).catch(() => {});
      return reply({ ok: true, status: built.status });
    }
    if (!(await strictControlDevice(db, device, input.device_token, now))) return reply({ error: 'Device authentication required' }, 401);
    if (!controlId(input.command_id) || device.control_command?.id !== input.command_id) return reply({ error: 'Command unavailable' }, 409);
    const command = device.control_command;
    if (input.operation === 'result') {
      // A receipt may arrive after restart, but cannot resurrect execution.
      if (now - Date.parse(command.requested_at) > 24 * 3600_000 || Date.parse(command.requested_at) > now + 5000) return reply({ error: 'Receipt expired' }, 410);
      const status = controlCompletion(command, input.code, now);
      if (!status) return reply({ error: 'Invalid receipt' }, 400);
      if (device.control_status?.state === 'cancelled') return reply({ error: 'Request cancelled' }, 409);
      // Once completion is recorded, lost-response retries cannot rewrite it.
      if (device.control_status?.state === 'waiting') await db.KioskDevice.update(device.id, { control_status: status });
      return reply({ ok: true });
    }
    const active = currentControl(device, now);
    if (!active || device.control_status?.state !== 'waiting') return reply({ error: 'Command expired or completed' }, 410);
    const requester = await db.User.get(active.requested_by).catch(() => null);
    if (requester?.role !== 'admin') return reply({ error: 'Administrator access changed' }, 403);
    const proof = (blocked = false) => {
      const ttl = Date.parse(active.expires_at) - Date.now();
      if (ttl <= 0) return reply({ error: 'Command expired' }, 410);
      return reply({ id: active.id, action: active.action, ttl_ms: ttl,
        ...(blocked ? { blocked_code: 'TABLET_BUSY' } : {}),
        ...(active.action === 'lock_test' ? { lease_ms: Date.parse(active.lock_until) - Date.now() } : {}) });
    };
    if (active.action === 'reboot') {
      // Server corroborates the local idle/queue gate, including boarding tablets.
      if (!device.vehicle_id) return proof(true);
      const vehicle = await db.Vehicle.get(device.vehicle_id).catch(() => null);
      if (!vehicle || vehicle.company_id !== device.company_id || vehicle.tracking_active !== false ||
        typeof vehicle.speed !== 'number' || !Number.isFinite(vehicle.speed) || vehicle.speed < 0 || vehicle.speed >= 0.5) return proof(true);
      let exhausted = false;
      for (let page = 0; page < 10; page++) {
        const shifts = await db.DriverShift.filter({ vehicle_id: device.vehicle_id, company_id: device.company_id }, '-started_at', 100, page * 100);
        if (shifts.some(row => !row.ended_at)) return proof(true);
        if (shifts.length < 100) { exhausted = true; break; }
      }
      if (!exhausted) return proof(true);
    }
    // Native validates TLS, endpoint, command ID, duration and action itself.
    return proof();
  } catch { return reply({ error: 'Tablet control unavailable. Try again later.' }, 500); }
}
