import { it, expect } from 'vitest';
import { webcrypto } from 'node:crypto';
import { Buffer } from 'node:buffer';
import { load, mock, request } from '../../../security-tests/helpers.js';

// The bus PIN opens a boarding tablet's Internet settings (kioskCheckIn
// verify_settings_pin). Same credential and same wrong-try limit as the driver tablet.
const call = (sdk, body) => load('kioskCheckIn', sdk).default(request({ device_id: 'tablet', action: 'verify_settings_pin', ...body }));
const tries = (sdk) => (sdk.tables.VerificationAttempt || []).filter((a) => a.scope === 'driver-pin:bus-a').length;

async function protectedPin(pin, salt) {
  const key = await webcrypto.subtle.importKey('raw', new TextEncoder().encode(pin), 'PBKDF2', false, ['deriveBits']);
  const bits = await webcrypto.subtle.deriveBits({ name: 'PBKDF2', salt: new TextEncoder().encode(salt), iterations: 600000, hash: 'SHA-256' }, key, 256);
  return Buffer.from(bits).toString('hex');
}

it('opens with the protected bus PIN and counts a wrong one against the bus', async () => {
  const sdk = mock('admin');
  const salt = 'ab'.repeat(16);
  sdk.tables.DriverPinCredential = [{ id: 'cred', vehicle_id: 'bus-a', company_id: 'a', salt, pin_hash: await protectedPin('4321', salt), enabled: true }];
  const ok = await call(sdk, { pin: '4321' });
  expect(ok.status).toBe(200);
  expect(await ok.json()).toEqual({ ok: true });
  expect(tries(sdk)).toBe(0);
  // The old plain PIN no longer works once a protected one exists.
  expect((await call(sdk, { pin: '1234' })).status).toBe(403);
  expect(tries(sdk)).toBe(1);
}, 20000);

it('stops after five wrong tries in 15 minutes, even for the right PIN', async () => {
  const sdk = mock('admin');
  for (let i = 0; i < 5; i++) expect((await call(sdk, { pin: '0000' })).status).toBe(403);
  const locked = await call(sdk, { pin: '1234' });
  expect(locked.status).toBe(429);
  expect((await locked.json()).error).toMatch(/15 minutes/);
});

it('only answers a paired boarding tablet', async () => {
  const sdk = mock('admin');
  sdk.tables.KioskDevice[0].kiosk_type = 'driver';
  expect([400, 401, 403]).toContain((await call(sdk, { pin: '1234' })).status);
  const none = mock(null);
  const res = await load('kioskCheckIn', none).default(request({ action: 'verify_settings_pin', pin: '1234' }));
  expect(res.status).toBe(401);
  expect(tries(sdk) + tries(none)).toBe(0);
});
