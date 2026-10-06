import { describe, it, expect, vi } from 'vitest';
import fs from 'node:fs';
import ts from 'typescript';
import { createHash, webcrypto } from 'node:crypto';
import { deviceRequest, saveDeviceToken, pairingProfile } from '../deviceAuth';
import { cleanTabletSession } from '../tabletSession';
const digest = value => createHash('sha256').update(value).digest('hex');
const token = 'a'.repeat(64);
const device = { id: 'test', paired: true, status: 'active', company_id: 'company', vehicle_id: 'bus', kiosk_type: 'driver', pairing_code: 'TESTCODE', created_date: '2026-10-02T00:00:00Z' };
const credential = { id: 'credential', device_id: device.id, token_hash: digest(token), company_id: device.company_id, vehicle_id: device.vehicle_id, kiosk_type: device.kiosk_type, pairing_code_hash: digest(device.pairing_code), expires_at: '2099-01-01T00:00:00Z' };
function load(name, client) {
 const source = fs.readFileSync(new URL(`../../../base44/functions/${name}/entry.ts`, import.meta.url), 'utf8').replace(/^import .*;\s*$/gm, '') + '\nexport { authenticatedTablet };';
 const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
 const exports = {};
 new Function('exports', 'createClientFromRequest', 'crypto', js)(exports, () => client, webcrypto);
 return exports;
}
function client(rows = [credential]) { return { asServiceRole: { entities: { DeviceCredential: { filter: async () => rows } } } }; }
describe('device credential authentication', () => {
 for (const name of ['driverSession', 'kioskHeartbeat', 'kioskCheckIn']) {
  it(`${name} enforces token, expiry and assignment for enrolled tablets`, async () => {
   const auth = load(name).authenticatedTablet;
   expect(await auth(client(), device, token)).toBe(true);
   for (const invalid of [undefined, '', 'b'.repeat(64), token.toUpperCase()]) expect(await auth(client(), device, invalid)).toBe(false);
   for (const change of [{ expires_at: '2000-01-01' }, { company_id: 'other' }, { vehicle_id: 'other' }, { kiosk_type: 'other' }, { pairing_code_hash: digest('changed') }]) expect(await auth(client([{ ...credential, ...change }]), device, token)).toBe(false);
   expect(await auth(client(), { ...device, status: 'revoked' }, token)).toBe(false);
   expect(await auth(client(), { ...device, paired: false }, token)).toBe(false);
  });
  it(`${name} permits only older unenrolled development devices without a token`, async () => {
   const auth = load(name).authenticatedTablet;
   expect(await auth(client([]), device)).toBe(true);
   expect(await auth(client([]), { ...device, created_date: '2099-01-01' })).toBe(false);
   expect(await auth(client([]), { ...device, created_date: undefined })).toBe(false);
   expect(await auth(client(), device)).toBe(false);
  });
 }
 it('pairs with a random token, stores its hash, and rejects sequential reuse', async () => {
  const row = { ...device, paired: false, pairing_code: 'TESTCODE2345', pairing_expires_at: new Date(Date.now()+60000).toISOString() };
  let saved;
  const sdk = { asServiceRole: { entities: {
   KioskDevice: { filter: async () => [row], update: async (_, data) => Object.assign(row, data) },
   DeviceCredential: { filter: async () => [], create: async data => { saved = data; } },
   Vehicle: { get: async () => ({}) }, Company: { get: async () => ({}) },
  } } };
  const pair = load('pairKioskDevice', sdk).default;
  const request = () => new Request('https://test.local', { method: 'POST', body: JSON.stringify({ pairing_code: 'TESTCODE2345', expected_type: 'driver' }) });
  const response = await pair(request());
  expect(response.status).toBe(200);
  const result = await response.json();
  expect(result.device_token).toMatch(/^[a-f0-9]{64}$/);
  expect(saved.token_hash).toBe(digest(result.device_token));
  expect(JSON.stringify(saved)).not.toContain(result.device_token);
  expect((await pair(request())).status).toBe(409);
 });
 it('keeps the current token out of profiles, cached sessions and queued overrides', () => {
  const storage = new Map();
  vi.stubGlobal('localStorage', { setItem: (k,v) => storage.set(k,v), getItem: k => storage.get(k) });
  try {
   saveDeviceToken('test', token);
   expect(deviceRequest('test', { action: 'heartbeat', device_id: 'other', device_token: 'old' })).toEqual({ action: 'heartbeat', device_id: 'test', device_token: token });
   expect(pairingProfile({ device_id: 'test', device_token: token })).toEqual({ device_id: 'test' });
   expect(cleanTabletSession({ nested: { device_token: token, token_hash: 'hash', name: 'Bus' } })).toEqual({ nested: { name: 'Bus' } });
  } finally { vi.unstubAllGlobals(); }
 });
 it('restricts credential records to admins', () => {
  const schema = JSON.parse(fs.readFileSync(new URL('../../../base44/entities/DeviceCredential.jsonc', import.meta.url), 'utf8'));
  for (const operation of ['read', 'create', 'update', 'delete']) expect(schema.rls[operation]).toEqual({ user_condition: { role: 'admin' } });
 });
});
