import { forwardToSupabase } from '../_shared/forwardToSupabase.ts';
import { acquireOperation, durableWritesEnabled, operationHash } from '../_shared/durableOperation.ts';
import { createClientFromRequest } from '../_shared/base44-compat.ts';
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
  if (!credential) return false;
  if (typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token)) return false;
  if (!(Date.parse(credential.expires_at) > Date.now())) return false;
  if (credential.company_id !== device.company_id || credential.vehicle_id !== (device.vehicle_id || '') || credential.kiosk_type !== device.kiosk_type) return false;
  if (!sameDigest(credential.pairing_code_hash, await deviceDigest(device.pairing_code || ''))) return false;
  return sameDigest(credential.token_hash, await deviceDigest(token));
}


export default async function(req) {
  // After the switch, calls from the installed tablet app go on to Supabase.
  const forwarded = await forwardToSupabase(req, 'pairKioskDevice');
  if (forwarded) return forwarded;
  try {
    const body = await req.json();
    const { pairing_code } = body;

    if (!pairing_code || typeof pairing_code !== 'string' || !/^[A-Z0-9]{12}$/.test(pairing_code.trim().toUpperCase())) {
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

    if(devices.length!==1)return Response.json({error:'Pairing code is ambiguous; request a new code'},{status:409});
    const device = devices[0];

    // Reject sequential reuse; the staged durable guard below handles concurrent use.
    if (device.paired) {
      return Response.json({ error: 'This code has already been used to pair a tablet. Ask an admin to generate a new one.' }, { status: 409 });
    }

    if (body.expected_type === 'driver' && device.kiosk_type !== 'driver') return Response.json({ error: 'Not a driver tablet' }, { status: 400 });
    if (body.expected_type === 'kiosk' && device.kiosk_type === 'driver') return Response.json({ error: 'Not a kiosk tablet' }, { status: 400 });
    // A bus tablet's code lasts 15 minutes; a driver's own phone's code 7 days
    // (the driver installs the app from the store first). A code set to last
    // longer than that was not made by Admin and is refused.
    const longestCode = device.personal === true ? 7 * 86400_000 : 15 * 60_000;
    if (!(Date.parse(device.pairing_expires_at) > Date.now()) || Date.parse(device.pairing_expires_at) > Date.now() + longestCode) return Response.json({ error: 'Pairing code expired' }, { status: 410 });
    if (!device.company_id) return Response.json({ error: 'Company assignment required' }, { status: 400 });
    if (durableWritesEnabled()) {
      const binding=JSON.stringify([device.id,device.company_id,device.vehicle_id||'',device.kiosk_type,device.pairing_expires_at]);
      const op=await acquireOperation(JSON.stringify(['pair',device.id,await deviceDigest(device.pairing_code)]),await operationHash(binding));
      if(op.state.state!=='acquired') return Response.json({error:'Pairing already claimed. If setup was interrupted, request a new code.'},{status:409});
      const fresh=await base44.asServiceRole.entities.KioskDevice.get(device.id);
      if(!fresh || fresh.paired || fresh.status!=='active' || fresh.pairing_code!==device.pairing_code ||
       JSON.stringify([fresh.id,fresh.company_id,fresh.vehicle_id||'',fresh.kiosk_type,fresh.pairing_expires_at])!==binding ||
       !(Date.parse(fresh.pairing_expires_at)>Date.now())) return Response.json({error:'Pairing changed. Request a new code.'},{status:409});
      // Permanently spent claim: raw device token is never cached for other callers.
    }
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

    // A driver's own phone carries its driver's name; a bus tablet the bus's.
    let driver_name = device.personal === true ? device.driver_name || '' : '';
    if (device.vehicle_id && !driver_name) {
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
      personal: device.personal === true,
      driver_name
    });
  } catch (error) {
    return Response.json({ error: 'Something went wrong. Please try again.' }, { status: error.status === 503 ? 503 : 500 });
  }
}