import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';
// Random device credentials are stored only as hashes in protected DeviceCredential.
// Existing development tablets remain legacy-compatible until explicitly re-paired.
const LEGACY_DEVICE_CUTOFF = Date.parse('2026-10-03T23:35:39Z');
async function deviceDigest(value) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(bytes), (b) => b.toString(16).padStart(2, '0')).join('');
}
function sameDigest(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
async function authenticatedTablet(base44, device, token) {
  if (!device || !device.paired || device.status !== 'active') return false;
  const credentials = await base44.asServiceRole.entities.DeviceCredential.filter({ device_id: device.id }, '-issued_at', 1);
  const credential = credentials[0];
  if (!credential) {
    // No upgrade based on possession of an ID. Only older records may use legacy auth.
    const created = Date.parse(device.created_date);
    return Number.isFinite(created) && created < LEGACY_DEVICE_CUTOFF;
  }
  if (typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token)) return false;
  if (!(Date.parse(credential.expires_at) > Date.now())) return false;
  if (credential.company_id !== device.company_id || credential.vehicle_id !== (device.vehicle_id || '') || credential.kiosk_type !== device.kiosk_type) return false;
  if (!sameDigest(credential.pairing_code_hash, await deviceDigest(device.pairing_code || ''))) return false;
  return sameDigest(credential.token_hash, await deviceDigest(token));
}


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

    if (body.expected_type === 'driver' && device.kiosk_type !== 'driver') return Response.json({ error: 'Not a driver tablet' }, { status: 400 });
    if (body.expected_type === 'kiosk' && device.kiosk_type === 'driver') return Response.json({ error: 'Not a kiosk tablet' }, { status: 400 });
    if (device.pairing_expires_at && !(Date.parse(device.pairing_expires_at) > Date.now())) return Response.json({ error: 'Pairing code expired' }, { status: 410 });
    if (!device.company_id) return Response.json({ error: 'Company assignment required' }, { status: 400 });
    const token = Array.from(crypto.getRandomValues(new Uint8Array(32)), (b) => b.toString(16).padStart(2, '0')).join('');
    const issued = new Date();
    const data = {
      device_id: device.id, token_hash: await deviceDigest(token),
      company_id: device.company_id, vehicle_id: device.vehicle_id || '', kiosk_type: device.kiosk_type,
      pairing_code_hash: await deviceDigest(device.pairing_code || ''),
      issued_at: issued.toISOString(), expires_at: new Date(issued.getTime() + 90 * 86400_000).toISOString(),
    };
    const existing = await base44.asServiceRole.entities.DeviceCredential.filter({ device_id: device.id }, '-issued_at', 1);
    if (existing.length) await base44.asServiceRole.entities.DeviceCredential.update(existing[0].id, data);
    else await base44.asServiceRole.entities.DeviceCredential.create(data);
    await base44.asServiceRole.entities.KioskDevice.update(device.id, { paired: true, last_seen: issued.toISOString() });

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
      device_token: token,
      token_expires_at: data.expires_at,
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