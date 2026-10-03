import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import ts from 'typescript';
import { cleanTabletSession } from '../tabletSession';

function handler(name, client) {
  const source = fs.readFileSync(new URL(`../../../base44/functions/${name}/entry.ts`, import.meta.url), 'utf8').replace(/^import .*;\s*$/gm, '');
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const exports = {};
  new Function('exports', 'createClientFromRequest', 'secrets', js)(exports, () => client, {});
  return exports.default;
}
const vehicle = { id: 'bus-a', company_id: 'company-a', name: 'Bus A', capacity: 25, route_id: 'route-a', driver_pin: '1234', entry_code: 'secret', new_secret: 'secret' };
const device = { id: 'tablet', status: 'active', paired: true, kiosk_type: 'bus_boarding', company_id: 'company-a', vehicle_id: 'bus-a' };
function client(overrides = {}) {
  const entities = new Proxy({}, { get: (_, name) => ({
    get: async () => name === 'KioskDevice' ? { ...device, ...overrides.device } : name === 'Vehicle' ? { ...vehicle, ...overrides.vehicle } : name === 'Route' ? { id: 'route-a', company_id: 'company-a', stops: [{ name: 'Stop', lat: 1, lng: 2, secret: 'secret' }], access_code: 'secret' } : { boss_phone: '555', access_code: 'secret' },
    update: async () => ({}),
    list: async () => [],
    filter: async () => name === 'StaffCheckIn' ? [{ id: 'boarding', company_id: 'company-a', vehicle_id: 'bus-a', staff_name: 'Rider', card_tag: 'secret', status: 'boarded', created_date: new Date().toISOString() }] : [],
  }) });
  return { asServiceRole: { entities }, auth: { me: async () => null } };
}
async function call(name, body, overrides) {
  return handler(name, client(overrides))(new Request('https://test.local', { method: 'POST', body: JSON.stringify({ device_id: 'tablet', ...body }) }));
}

describe('tablet backend response security', () => {
  it('sends scoped kiosk display context without entity secrets', async () => {
    const response = await call('kioskHeartbeat', {});
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.context.vehicle.name).toBe('Bus A');
    expect(data.context.occupancy).toBe(1);
    expect(data.context.route.stops[0]).toEqual({ name: 'Stop', lat: 1, lng: 2 });
    expect(JSON.stringify(data)).not.toContain('secret');
  });
  it('rejects an inactive kiosk', async () => {
    expect((await call('kioskHeartbeat', {}, { device: { status: 'inactive' } })).status).toBe(404);
  });
  it('rejects a kiosk assigned to another company vehicle', async () => {
    expect((await call('kioskHeartbeat', {}, { vehicle: { company_id: 'company-b' } })).status).toBe(403);
  });
  it('removes vehicle PINs and card UIDs from driver heartbeat', async () => {
    const data = await (await call('driverSession', { action: 'heartbeat' }, { device: { kiosk_type: 'driver' } })).json();
    expect(data.vehicle.name).toBe('Bus A');
    expect(data.has_driver_pin).toBe(true);
    expect(data.emergency_contacts.boss_phone).toBe('555');
    expect(data.occupancy).toBe(1);
    expect(JSON.stringify(data)).not.toContain('secret');
    expect(JSON.stringify(data)).not.toContain('1234');
    expect(data.check_ins[0].card_tag).toBeUndefined();
  });
  it('rejects a driver heartbeat for a mismatched company', async () => {
    expect((await call('driverSession', { action: 'heartbeat' }, { device: { kiosk_type: 'driver' }, vehicle: { company_id: 'company-b' } })).status).toBe(403);
  });
  it('verifies PIN on the backend without returning it', async () => {
    const response = await call('driverSession', { action: 'verify_pin', pin: '1234' }, { device: { kiosk_type: 'driver' } });
    expect(await response.json()).toEqual({ ok: true });
    expect((await call('driverSession', { action: 'verify_pin', pin: '0000' }, { device: { kiosk_type: 'driver' } })).status).toBe(403);
  });
  it('rejects PIN verification from an unpaired driver', async () => {
    expect((await call('driverSession', { action: 'verify_pin', pin: '1234' }, { device: { kiosk_type: 'driver', paired: false } })).status).toBe(401);
  });
  it('scrubs credentials from legacy caches at every nesting level', () => {
    const clean = cleanTabletSession({ driver_pin: '1234', vehicle, staff: [{ name: 'Rider', nfc_card_tag: 'secret', access_code: 'secret' }], check_ins: [{ card_tag: 'secret', status: 'boarded' }], has_driver_pin: true });
    expect(clean.driver_pin).toBeUndefined();
    expect(clean.vehicle.driver_pin).toBeUndefined();
    expect(clean.vehicle.entry_code).toBeUndefined();
    expect(clean.staff).toEqual([{ name: 'Rider' }]);
    expect(clean.check_ins).toEqual([{ status: 'boarded' }]);
    expect(clean.has_driver_pin).toBe(true);
  });
});
