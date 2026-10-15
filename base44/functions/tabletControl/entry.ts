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
    if (input.operation === 'request' || input.operation === 'cancel') {
      admin = await base44.auth.me().catch(() => null);
      if (admin?.role !== 'admin') return reply({ error: 'Admins only' }, 403);
    } else if (!['claim', 'result'].includes(input.operation)) return reply({ error: 'Unknown operation' }, 400);
    const device = await db.KioskDevice.get(deviceId).catch(() => null);
    if (!device) return reply({ error: 'Tablet unavailable' }, 404);
    const now = Date.now();
    if (admin) {
      if (device.status !== 'active' || device.paired !== true) return reply({ error: 'Pair this tablet first' }, 409);
      if (input.operation === 'cancel') {
        // Cancellation can stop waiting delivery; it cannot undo an action already claimed.
        if (!controlId(input.command_id) || device.control_command?.id !== input.command_id || device.control_status?.state !== 'waiting') return reply({ error: 'Request is no longer waiting' }, 409);
        const status = { ...device.control_status, state: 'cancelled', message: 'Waiting request cancelled.', completed_at: new Date(now).toISOString() };
        await db.KioskDevice.update(device.id, { control_command: null, control_status: status });
        return reply({ ok: true, status });
      }
      const prior = device.control_command;
      if (currentControl(device, now) && device.control_status?.state === 'waiting') return reply({ error: 'A tablet command is already waiting. Cancel it first.' }, 409);
      if (prior && now - Date.parse(prior.requested_at) < CONTROL_TTL) return reply({ error: 'Wait two minutes between tablet commands.' }, 429);
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
    // Native validates TLS, endpoint, command ID, duration and action itself.
    return reply({ id: active.id, action: active.action, ttl_ms: Date.parse(active.expires_at) - now,
      ...(active.action === 'lock_test' ? { lease_ms: Date.parse(active.lock_until) - now } : {}) });
  } catch { return reply({ error: 'Tablet control unavailable. Try again later.' }, 500); }
}
