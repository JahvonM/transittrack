import { describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import ts from 'typescript';
import { webcrypto } from 'node:crypto';

// The real driverAccounts handler with in-memory tables and a fake Supabase Auth.
const source = fs.readFileSync('base44/functions/driverAccounts/entry.ts', 'utf8').replace(/^import .*;\r?\n/gm, '');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const KEY = (u) => `driver.${u}@login.mcsweenstransport.com`;

function setup({ driver: driverFields = {}, actor: actorFields = {}, buses = [] } = {}) {
  const driver = { id: 'd1', full_name: 'Ann Driver', company_id: 'c1', phone_app_access: false, ...driverFields };
  const profiles = [{ id: 'p-new', auth_user_id: 'new-auth', role: 'user' }];
  if (driver.auth_user_id) profiles.push({ id: 'p1', auth_user_id: driver.auth_user_id, role: 'driver', company_id: driver.company_id });
  const vehicles = buses.map((b) => ({ ...b }));
  const actor = { id: 'admin-1', auth_user_id: 'admin-auth', role: 'admin', email: 'admin@example.test', ...actorFields };
  const db = {
    Driver: {
      get: vi.fn(async (id) => id === driver.id ? { ...driver } : null),
      filter: vi.fn(async (q) => (q.auth_user_id ? (driver.auth_user_id === q.auth_user_id ? [{ ...driver }] : []) : [])),
      update: vi.fn(async (id, changes) => { Object.assign(driver, changes); }),
    },
    User: {
      filter: vi.fn(async (q) => profiles.filter((p) => p.auth_user_id === q.auth_user_id).map((p) => ({ ...p }))),
      update: vi.fn(async (id, changes) => { Object.assign(profiles.find((p) => p.id === id), changes); }),
    },
    Vehicle: {
      filter: vi.fn(async (q) => vehicles.filter((v) => v.company_id === q.company_id).map((v) => ({ ...v }))),
      update: vi.fn(async (id, changes) => { Object.assign(vehicles.find((v) => v.id === id), changes); }),
    },
    AuditLog: { create: vi.fn(async () => ({})) },
  };
  const auth = [];
  const fetchMock = vi.fn(async (url, init) => {
    auth.push({ path: new URL(url).pathname + new URL(url).search, method: init.method });
    if (url.endsWith('/auth/v1/admin/users') && init.method === 'POST') return Response.json({ id: 'new-auth' });
    if (url.includes('grant_type=password')) return Response.json({ user: { id: actor.auth_user_id } });
    return Response.json({});
  });
  const exports = {};
  const handler = new Function('exports', 'createClientFromRequest', 'secrets', 'reserveAttempt', 'fetch', 'crypto', 'Response', 'AbortSignal', 'TextEncoder', compiled + '\nreturn exports.default;')(
    exports, () => ({ auth: { me: async () => actor }, asServiceRole: { entities: db } }),
    { get: (k) => k === 'SUPABASE_URL' ? 'https://unit-test.supabase.co' : k === 'SUPABASE_SERVICE_ROLE_KEY' ? 'mock-service-key' : undefined },
    async () => true, fetchMock, webcrypto, Response, AbortSignal, TextEncoder,
  );
  const call = (action, rest = {}) => handler(new Request('https://unit.test/driverAccounts', { method: 'POST', body: JSON.stringify({ action, driver_id: driver.id, ...rest }) }));
  return { call, driver, profiles, vehicles, auth };
}

describe('driver accounts keep buses, shifts and messages working', () => {
  it('points the driver\'s buses at their sign-in address when the account is created', async () => {
    const t = setup({ driver: { email: 'ann@example.test' }, buses: [
      { id: 'b1', company_id: 'c1', driver_id: 'd1', driver_email: null },
      { id: 'b2', company_id: 'c1', driver_email: 'ann@example.test' },
      { id: 'b3', company_id: 'c1', driver_id: 'd2', driver_email: 'other@example.test' },
    ] });
    const response = await t.call('provision', { username: 'ann_1' });
    expect(response.status).toBe(200);
    expect(t.vehicles.find((v) => v.id === 'b1')).toMatchObject({ driver_id: 'd1', driver_email: KEY('ann_1') });
    expect(t.vehicles.find((v) => v.id === 'b2')).toMatchObject({ driver_id: 'd1', driver_email: KEY('ann_1') });
    expect(t.vehicles.find((v) => v.id === 'b3')).toMatchObject({ driver_id: 'd2', driver_email: 'other@example.test' });
  });

  it('removing a phone account signs the driver out for good, frees the username and keeps the driver', async () => {
    const t = setup({ driver: { username: 'ann_1', auth_user_id: 'auth-ann', phone_app_access: true }, buses: [
      { id: 'b1', company_id: 'c1', driver_id: 'd1', driver_email: KEY('ann_1') },
    ] });
    const response = await t.call('unlink');
    expect(response.status).toBe(200);
    expect(t.auth).toContainEqual({ path: '/auth/v1/admin/users/auth-ann', method: 'DELETE' });
    expect(t.driver).toMatchObject({ id: 'd1', username: null, auth_user_id: null, phone_app_access: false });
    expect(t.profiles.find((p) => p.id === 'p1').disabled).toBe(true);
    // The bus stays with the driver record.
    expect(t.vehicles[0]).toMatchObject({ driver_id: 'd1', driver_email: null });
  });

  it('a driver moved to a new company gets their sign-in and buses back in line', async () => {
    const t = setup({ driver: { username: 'ann_1', auth_user_id: 'auth-ann', phone_app_access: true, company_id: 'c9' }, buses: [
      { id: 'b9', company_id: 'c9', driver_id: 'd1', driver_email: null },
    ] });
    t.profiles.find((p) => p.id === 'p1').role = 'staff';
    t.profiles.find((p) => p.id === 'p1').company_id = null;
    const response = await t.call('sync');
    expect(response.status).toBe(200);
    expect(t.profiles.find((p) => p.id === 'p1')).toMatchObject({ role: 'driver', company_id: 'c9', disabled: false });
    expect(t.vehicles[0].driver_email).toBe(KEY('ann_1'));
  });

  it('sync and reactivate wait until the driver has a company', async () => {
    const t = setup({ driver: { username: 'ann_1', auth_user_id: 'auth-ann', company_id: null } });
    expect((await t.call('sync')).status).toBe(400);
    expect((await t.call('reactivate')).status).toBe(400);
    expect(t.auth).toHaveLength(0);
  });

  it('only administrators can remove or sync phone accounts', async () => {
    const t = setup({ driver: { username: 'ann_1', auth_user_id: 'auth-ann' }, actor: { role: 'driver' } });
    expect((await t.call('unlink')).status).toBe(403);
    expect((await t.call('sync')).status).toBe(403);
    expect(t.driver.auth_user_id).toBe('auth-ann');
  });

  it('turns down passwords Supabase would refuse (over 72 bytes) with a clear message', async () => {
    const t = setup({ driver: { username: 'ann_1', auth_user_id: 'auth-ann', phone_app_access: true, must_change_password: true }, actor: { role: 'driver', auth_user_id: 'auth-ann' } });
    const response = await t.call('change_password', { current_password: 'TempPassword12', new_password: 'Aa1' + 'x'.repeat(70) });
    expect(response.status).toBe(400);
    expect((await response.json()).error).toMatch(/12 to 72 characters/);
    const ok = await t.call('change_password', { current_password: 'TempPassword12', new_password: 'Aa1' + 'x'.repeat(69) });
    expect(ok.status).toBe(200);
  });
});
