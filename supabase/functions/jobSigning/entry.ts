import { forwardToSupabase } from '../_shared/forwardToSupabase.ts';
import { createClientFromRequest } from '../_shared/base44-compat.ts';
import { guestTrip, signJob } from '../_shared/jobSignature.ts';

// The signing tablet: a guest-facing tablet on a bus, used only to sign for a
// job at pickup and at drop-off. It is a paired tablet (no login), accepted
// only with its own current device token, and it can do nothing else: no
// passenger lists, no boarding, no driver tools.

async function digestHex(value) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(bytes), (b) => b.toString(16).padStart(2, '0')).join('');
}
function sameHex(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
// Signing tablets came after device tokens, so only a current token counts
// (there is no older, tokenless way in).
async function signingTablet(base44, deviceId, token) {
  if (!deviceId || typeof deviceId !== 'string' || typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token)) return null;
  const device = await base44.asServiceRole.entities.KioskDevice.get(deviceId).catch((e) => {
    if ([400, 404].includes(e?.status ?? e?.response?.status)) return null;
    throw e;
  });
  if (!device || device.kiosk_type !== 'job_signing' || !device.paired || device.status !== 'active' || !device.vehicle_id) return null;
  const [credential] = await base44.asServiceRole.entities.DeviceCredential.filter({ device_id: device.id }, '-issued_at', 1);
  if (!credential || !(Date.parse(credential.expires_at) > Date.now())) return null;
  if (credential.company_id !== device.company_id || credential.vehicle_id !== (device.vehicle_id || '') || credential.kiosk_type !== device.kiosk_type) return null;
  if (!sameHex(credential.pairing_code_hash, await digestHex(device.pairing_code || ''))) return null;
  return sameHex(credential.token_hash, await digestHex(token)) ? device : null;
}

export default async function(req) {
  // After the switch, calls from the installed tablet app go on to Supabase.
  const forwarded = await forwardToSupabase(req, 'jobSigning');
  if (forwarded) return forwarded;
  try {
    const body = await req.json().catch(() => ({}));
    const base44 = createClientFromRequest(req);
    const device = await signingTablet(base44, body.device_id, body.device_token);
    if (!device) return Response.json({ error: 'Invalid or unpaired signing tablet', code: 'DEVICE_ACCESS_REQUIRED' }, { status: 401 });
    const companyId = device.company_id, vehicleId = device.vehicle_id;

    // Saved while offline: only for the tablet and bus it was saved on.
    if (body.queue_replay && (body.expected_device_id !== device.id || body.expected_company_id !== companyId || body.expected_vehicle_id !== vehicleId))
      return Response.json({ error: 'Saved work belongs to a different tablet assignment' }, { status: 409 });

    switch (body.action) {
      case 'state': {
        // Only jobs under way, as guests may see them: the screen asks for a
        // signature when a job has started (pickup) or arrived (drop-off).
        // Later groups' names and flights never reach this tablet.
        const rows = await base44.asServiceRole.entities.Trip.filter({ vehicle_id: vehicleId, status: { $in: ['on_the_way', 'arrived'] } }, 'scheduled_time', 20);
        return Response.json({
          bus: { id: vehicleId, name: device.vehicle_name || '' }, company_name: device.company_name || '',
          jobs: rows.filter((t) => t.company_id === companyId).map(guestTrip),
        });
      }
      case 'sign':
        return signJob(base44, body, companyId, vehicleId, guestTrip);
      default:
        return Response.json({ error: 'Unknown action' }, { status: 400 });
    }
  } catch (error) {
    const status = Number(error?.status ?? error?.response?.status) || 500;
    if (status === 429) return Response.json({ error: 'Server is busy. Please try again shortly.' }, { status: 429 });
    return Response.json({ error: status < 500 && error?.message ? error.message : 'Signing request failed' }, { status: status >= 400 && status <= 599 ? status : 500 });
  }
}
