import { withLock } from './atomicOps.ts';

// The bus PIN that unlocks the driver tablet also opens the boarding tablet's
// Internet settings (hold its top bar, then the PIN). It is checked against the
// same protected credential, and wrong tries count against the same limit per
// bus (5 per 15 minutes), so guessing on either tablet adds up.

async function busPinDigest(pin: string, salt: string): Promise<string> {
  let bytes: Uint8Array;
  try {
    const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(pin), 'PBKDF2', false, ['deriveBits']);
    const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: new TextEncoder().encode(salt), iterations: 600000, hash: 'SHA-256' }, key, 256);
    bytes = new Uint8Array(bits);
  } catch {
    // Some hosted WebCrypto runtimes reject PBKDF2: same salt, work factor and output in plain JavaScript.
    const { pbkdf2Async } = await import('npm:@noble/hashes@1.8.0/pbkdf2');
    const { sha256 } = await import('npm:@noble/hashes@1.8.0/sha256');
    bytes = await pbkdf2Async(sha256, new TextEncoder().encode(pin), new TextEncoder().encode(salt), { c: 600000, dkLen: 32 });
  }
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

// 'ok', 'wrong' or 'locked'.
export function checkBusPin(base44, vehicle, pin): Promise<'ok' | 'wrong' | 'locked'> {
  return withLock('driver-pin:' + vehicle.id, async () => {
    const db = base44.asServiceRole.entities;
    const scope = 'driver-pin:' + vehicle.id;
    const recent = await db.VerificationAttempt.filter({ scope }, '-created_date', 5);
    if (recent.filter((r) => Date.parse(r.attempted_at) > Date.now() - 15 * 60_000).length >= 5) return 'locked';
    let ok = false;
    if (typeof pin === 'string' && /^\d{4}$/.test(pin)) {
      const row = (await db.DriverPinCredential.filter({ vehicle_id: vehicle.id }, '-updated_date', 1))[0];
      if (row) ok = row.enabled === true && row.company_id === vehicle.company_id && (await busPinDigest(pin, row.salt)) === row.pin_hash;
      else ok = typeof vehicle.driver_pin === 'string' && vehicle.driver_pin !== '' && pin === vehicle.driver_pin;
    }
    if (!ok) await db.VerificationAttempt.create({ scope, attempted_at: new Date().toISOString() });
    return ok ? 'ok' : 'wrong';
  });
}
