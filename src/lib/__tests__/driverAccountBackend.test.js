import { describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import ts from 'typescript';
import { webcrypto } from 'node:crypto';

// Run the real Edge-function handler in isolation without connecting to a live Supabase project.
const source = fs.readFileSync('base44/functions/driverAccounts/entry.ts', 'utf8').replace(/^import .*;\r?\n/gm, '');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;

function fixture({ role = 'admin', authId = 'auth-admin', allowed = true } = {}) {
  const writes = [];
  const driver = { id: 'driver-1', full_name: 'Driver One', company_id: 'c1', phone_app_access: false };
  const person = { id: 'person-1', auth_user_id: 'new-auth', role: 'user', company_id: null };
  const actor = { id: 'admin-1', auth_user_id: authId, role, email: 'admin@example.com' };
  const db = {
    Driver: {
      get: vi.fn(async (id) => id === driver.id ? { ...driver } : null),
      filter: vi.fn(async (query) => query.auth_user_id ? [] : []),
      update: vi.fn(async (id, changes) => { writes.push({ table: 'driver', id, changes }); Object.assign(driver, changes); }),
    },
    User: {
      filter: vi.fn(async (query) => query.auth_user_id === person.auth_user_id ? [{ ...person }] : []),
      update: vi.fn(async (id, changes) => { writes.push({ table: 'user', id, changes }); Object.assign(person, changes); }),
    },
    AuditLog: { create: vi.fn(async () => ({})) },
  };
  const client = { auth: { me: vi.fn(async () => actor) }, asServiceRole: { entities: db } };
  const fetchMock = vi.fn(async (url, init) => {
    if (url.endsWith('/auth/v1/admin/users') && init.method === 'POST')
      return Response.json({ id: 'new-auth' });
    return Response.json({ ok: true });
  });
  const exports = {};
  const handler = new Function('exports', 'createClientFromRequest', 'secrets', 'reserveAttempt', 'fetch', 'crypto', 'Response', 'AbortSignal', compiled + '\nreturn exports.default;')(
    exports,
    () => client,
    { get: (key) => key === 'SUPABASE_URL' ? 'https://unit-test.supabase.co' : key === 'SUPABASE_SERVICE_ROLE_KEY' ? 'mock-service-key' : undefined },
    async () => allowed, fetchMock, webcrypto, Response, AbortSignal,
  );
  const request = (action, rest = {}) => handler(new Request('https://unit.test/driverAccounts', { method: 'POST', body: JSON.stringify({ action, driver_id: driver.id, ...rest }) }));
  return { handler, request, db, driver, actor, person, writes, fetchMock };
}

describe('driver-account authorization', () => {
  it('never permits non-admin account provisioning', async () => {
    const f = fixture({ role: 'driver' });
    const response = await f.request('provision', { username: 'firstdriver' });
    expect(response.status).toBe(403);
    expect(f.fetchMock).not.toHaveBeenCalled();
    expect(f.writes).toHaveLength(0);
  });
  it('fails closed when durable attempt limits cannot reserve a request', async () => {
    const f = fixture({ allowed: false });
    const response = await f.request('provision', { username: 'firstdriver' });
    expect(response.status).toBe(429);
    expect(f.fetchMock).not.toHaveBeenCalled();
  });
  it('provisions a linked account without storing its password in database rows', async () => {
    const f = fixture();
    const response = await f.request('provision', { username: 'Driver.0001' });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.username).toBe('driver.0001');
    expect(body.temporary_password.length).toBeGreaterThanOrEqual(12);
    expect(f.driver.auth_user_id).toBe('new-auth');
    expect(f.driver.must_change_password).toBe(true);
    expect(f.person.role).toBe('driver');
    expect(JSON.stringify(f.writes)).not.toContain(body.temporary_password);
  });
  it('rejects invalid usernames without creating an Auth user', async () => {
    const f = fixture();
    const response = await f.request('provision', { username: 'bad user' });
    expect(response.status).toBe(400);
    expect(f.fetchMock).not.toHaveBeenCalled();
  });
  it('does not allow a non-driver to pass status', async () => {
    const f = fixture({ role: 'driver' });
    const response = await f.request('status');
    expect(response.status).toBe(200);
    expect((await response.json()).is_driver).toBe(false);
  });
});
