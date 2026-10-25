import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import ts from 'typescript';
import { webcrypto } from 'node:crypto';

// The real driverPhone handler, for a driver who signs in with a username and
// has no email: shifts they start on the phone are theirs to end, count in
// their hours, and can't be taken over by another driver.
const compile = (file) => ts.transpileModule(fs.readFileSync(file, 'utf8').replace(/^import [^;]*;\r?\n/gm, ''),
  { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const shared = {};
new Function('exports', compile('base44/shared/driverPhone.ts'))(shared);
const entry = compile('base44/functions/driverPhone/entry.ts');
const KEY = (u) => `driver.${u}@login.mcsweenstransport.com`;

function table(rows = []) {
  let next = rows.length + 1;
  const matches = (row, q) => Object.entries(q || {}).every(([k, v]) => row[k] === v);
  const t = {
    rows,
    filter: async (q) => rows.filter((r) => matches(r, q)).map((r) => ({ ...r })),
    get: async (id) => { const r = rows.find((x) => x.id === id); if (!r) throw Object.assign(new Error('nf'), { status: 404 }); return { ...r }; },
    create: async (data) => { const r = { id: 'row-' + next++, created_date: new Date().toISOString(), ...data }; rows.push(r); return { ...r }; },
    bulkCreate: async (list) => Promise.all(list.map((d) => t.create(d))),
    update: async (id, changes) => { const r = rows.find((x) => x.id === id); Object.assign(r, changes); return { ...r }; },
    delete: async (id) => { rows.splice(rows.findIndex((x) => x.id === id), 1); },
  };
  return t;
}
const sha = async (v) => Array.from(new Uint8Array(await webcrypto.subtle.digest('SHA-256', new TextEncoder().encode(v))), (b) => b.toString(16).padStart(2, '0')).join('');

async function world() {
  const drivers = [
    { id: 'd1', full_name: 'Ann Driver', company_id: 'c1', username: 'ann_1', auth_user_id: 'auth-ann', phone_app_access: true },
    { id: 'd2', full_name: 'Bob Driver', company_id: 'c1', username: 'bob_2', auth_user_id: 'auth-bob', phone_app_access: true },
  ];
  const db = {
    Driver: table(drivers),
    Vehicle: table([{ id: 'b1', name: 'Bus 1', company_id: 'c1', company_name: 'Co', driver_id: 'd1', driver_email: KEY('ann_1') }]),
    DriverShift: table(), PhoneUnlock: table(), VerificationAttempt: table(), StaffCheckIn: table(),
  };
  const unlock = async (code) => db.PhoneUnlock.create({ code_hash: await sha('phone-unlock:' + code), status: 'pending',
    expires_at: new Date(Date.now() + 120_000).toISOString(), company_id: 'c1', vehicle_id: 'b1', device_id: 'tablet-1' });
  const as = (driver) => {
    const user = { id: 'u-' + driver.id, email: KEY(driver.username), auth_user_id: driver.auth_user_id, role: 'driver' };
    const client = { auth: { me: async () => user }, asServiceRole: { entities: db, integrations: {} } };
    const handler = new Function('exports', 'createClientFromRequest', 'secrets', 'busRoadStops', 'driverKey', 'driverVehicles', 'normEmail',
      'sendPushToTokens', 'applyLocationUpdate', 'pushWithPolicy', 'passengerPushTokens', 'crypto', entry + '\nreturn exports.default;')(
      {}, () => client, { get: () => undefined }, async () => null, shared.driverKey, shared.driverVehicles, shared.normEmail,
      async () => {}, async () => ({}), async () => {}, async () => [], webcrypto);
    return async (action, body = {}) => {
      const response = await handler(new Request('https://unit.test/driverPhone', { method: 'POST', body: JSON.stringify({ action, ...body }) }));
      return { status: response.status, body: await response.json() };
    };
  };
  return { db, unlock, ann: as(drivers[0]), bob: as(drivers[1]) };
}

describe('username drivers on the phone app', () => {
  it('end the shift they started, and see it in their hours', async () => {
    const w = await world();
    await w.unlock('ABC234');
    const start = await w.ann('claim_bus', { code: 'ABC234' });
    expect(start.status).toBe(200);
    expect(start.body.shift.mine).toBe(true);
    expect(w.db.DriverShift.rows[0].driver_email).toBe(KEY('ann_1'));

    const end = await w.ann('end_shift', { vehicle_id: 'b1' });
    expect(end.status).toBe(200);
    expect(end.body.shift.ended_at).toBeTruthy();

    const hours = await w.ann('hours');
    expect(hours.body.shifts).toHaveLength(1);
    expect(hours.body.shifts[0].started_with).toBe('phone');
  });

  it('cannot take over a shift another driver has open on the bus', async () => {
    const w = await world();
    await w.unlock('ABC234');
    expect((await w.ann('claim_bus', { code: 'ABC234' })).status).toBe(200);
    // Dispatch moves the bus to Bob while Ann's shift is still open.
    await w.db.Vehicle.update('b1', { driver_id: 'd2', driver_email: KEY('bob_2') });
    await w.unlock('XYZ789');
    const bob = await w.bob('claim_bus', { code: 'XYZ789' });
    expect(bob.status).toBe(409);
    expect(bob.body.error).toMatch(/already has a shift open for Ann Driver/);
    expect(w.db.DriverShift.rows).toHaveLength(1);
  });
});
