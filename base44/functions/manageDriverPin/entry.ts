import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';

async function pinHash(pin, salt) {
 let bytes;
 try {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(pin), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: new TextEncoder().encode(salt), iterations: 600000, hash: 'SHA-256' }, key, 256);
  bytes = new Uint8Array(bits);
 } catch {
  // Some hosted WebCrypto runtimes reject PBKDF2 even when local Deno works.
  // The compatibility path uses the identical salt, work factor and output.
  const { pbkdf2 } = await import('node:crypto');
  bytes = await new Promise((resolve, reject) => {
   pbkdf2(pin, salt, 600000, 32, 'sha256', (error, result) => error ? reject(error) : resolve(result));
  });
 }
 return Array.from(bytes, b => b.toString(16).padStart(2,'0')).join('');
}
async function setProtectedPin(base44, vehicle, pin, mark = () => {}) {
 mark("PIN_HASH");
 const salt = Array.from(crypto.getRandomValues(new Uint8Array(16)), b => b.toString(16).padStart(2,'0')).join('');
 const data = { vehicle_id: vehicle.id, company_id: vehicle.company_id, salt, pin_hash: pin ? await pinHash(pin, salt) : '', enabled: !!pin };
 mark("PIN_STORE_READ");
 const rows = await base44.asServiceRole.entities.DriverPinCredential.filter({ vehicle_id: vehicle.id }, '-updated_date', 1);
 mark("PIN_STORE_WRITE");
 if (rows[0]) await base44.asServiceRole.entities.DriverPinCredential.update(rows[0].id, data);
 else await base44.asServiceRole.entities.DriverPinCredential.create(data);
 mark("PIN_LEGACY_CLEAR");
 await base44.asServiceRole.entities.Vehicle.update(vehicle.id, { driver_pin: '' });
}
async function verifyProtectedPin(base44, vehicle, pin) {
 if (typeof pin !== 'string' || !/^\d{4}$/.test(pin)) return false;
 const rows = await base44.asServiceRole.entities.DriverPinCredential.filter({ vehicle_id: vehicle.id }, '-updated_date', 1);
 const row = rows[0];
 if (row) return row.enabled === true && row.company_id === vehicle.company_id && (await pinHash(pin, row.salt)) === row.pin_hash;
 // Development migration only: successful verification moves the old PIN to a protected hash.
 if (pin !== vehicle.driver_pin) return false;
 await setProtectedPin(base44, vehicle, pin);
 return true;
}

export default async function(req) {
 let stage = "PIN_REQUEST";
 try {
  const base44 = createClientFromRequest(req);
  const user = await base44.auth.me().catch(() => null);
  if (!user || user.role !== 'admin') return Response.json({ error: 'Admins only' }, { status: 403 });
  const body = await req.json();
  if (typeof body.pin !== 'string' || (body.pin !== '' && !/^\d{4}$/.test(body.pin))) return Response.json({ error: 'PIN must contain four digits' }, { status: 400 });
  if (typeof body.vehicle_id !== "string" || !body.vehicle_id) return Response.json({ error: "Choose an assigned bus first", code: "PIN_BUS_REQUIRED" }, { status: 400 });
  stage = "PIN_VEHICLE_READ";
  const vehicle = await base44.asServiceRole.entities.Vehicle.get(body.vehicle_id);
  if (!vehicle?.company_id) return Response.json({ error: 'Vehicle not found' }, { status: 404 });
  await setProtectedPin(base44, vehicle, body.pin, next => { stage = next; });
  return Response.json({ ok: true });
 } catch {
  // Log only the operation reference: never log the request, PIN, salt or hash.
  console.error("manageDriverPin failed", { code: stage });
  return Response.json({ error: 'Could not save PIN. Reference: ' + stage + '. Please retry or contact support.', code: stage }, { status: 500 });
 }
}