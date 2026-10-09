import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import ts from 'typescript';
import { webcrypto } from 'node:crypto';
import { mock, request, digest, inlineShared } from '../../../security-tests/helpers.js';

const transpile = source => ts.transpileModule(inlineShared(source).replace(/^import .*;\s*$/gm, ''), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const sharedSource = fs.readFileSync(new URL('../../../base44/shared/boardingCredentials.ts', import.meta.url), 'utf8');
const shared = {};
new Function('exports', 'crypto', 'retry429', transpile(sharedSource))(shared, webcrypto, fn => fn());
const { personalBoardingCredential, savePersonalBoardingCode, boardingSecretHash, currentBoardingCode } = shared;

function matches(row, query) {
  return Object.entries(query).every(([key, value]) => {
    if (key === '$or') return value.some(q => matches(row, q));
    if (value && typeof value === 'object') return Object.entries(value).every(([op, v]) => {
      if (op === '$ne') return row[key] !== v;
      if (op === '$in') return v.includes(row[key]);
      if (op === '$gt') return row[key] > v;
      if (op === '$exists') return (row[key] !== undefined) === v;
      if (op === '$regex') return new RegExp(v, value.$options || '').test(row[key] || '');
      return op === '$options';
    });
    return row[key] === value;
  });
}
function fixture(role = 'staff') {
  const sdk = mock(role), original = sdk.asServiceRole.entities;
  sdk.asServiceRole.entities = new Proxy(original, { get: (target, name) => ({
    ...target[name],
    filter: async (query, options, ...rest) => typeof options === 'object'
      ? { items: structuredClone((sdk.tables[name] || []).filter(row => matches(row, query)).slice(0, options.limit || 50)), has_more: false }
      : target[name].filter(query, options, ...rest),
    count: async query => (sdk.tables[name] || []).filter(row => matches(row, query)).length,
    upsert: async (rows, { key }) => {
      const records = [];
      for (const data of rows) {
        const found = (sdk.tables[name] || []).find(row => key.every(k => row[k] === data[k]));
        records.push(found ? await target[name].update(found.id, data) : await target[name].create(data));
      }
      return { records };
    },
  }) });
  function load(name) {
    const source = fs.readFileSync(new URL(`../../../base44/functions/${name}/entry.ts`, import.meta.url), 'utf8');
    const exports = {};
    new Function('exports', 'createClientFromRequest', 'crypto', 'retry429', 'personalBoardingCredential', 'savePersonalBoardingCode', 'boardingSecretHash', 'currentBoardingCode', transpile(source))(exports, () => sdk, webcrypto, fn => fn(), personalBoardingCredential, savePersonalBoardingCode, boardingSecretHash, currentBoardingCode);
    return exports.default;
  }
  const passenger = load('generateOneTimeCode'), kiosk = load('kioskCheckIn');
  return { sdk, account: body => passenger(request(body)), tablet: body => kiosk(request({ device_id: 'tablet', ...body })) };
}
async function getPass(f) {
  const response = await f.account({ action: 'boarding_get' });
  expect(response.status).toBe(200);
  return response.json();
}
async function setCode(f, code) {
  return f.account({ action: 'boarding_set_code', code });
}

describe('permanent personal boarding QR and chosen code', () => {
  it('keeps one permanent QR across repeated account opens without exposing code hashes', async () => {
    const f = fixture(), first = await getPass(f), again = await getPass(f);
    expect(first.qr_token).toMatch(/^[a-f0-9]{64}$/);
    expect(again).toEqual(first);
    expect(first.permanent).toBe(true);
    expect(first.has_code).toBe(false);
    expect(first).not.toHaveProperty('expires_at');
    expect(first).not.toHaveProperty('token_hash');
    expect(f.sdk.tables.PassengerAccessCredential).toHaveLength(1);
  });
  it('accepts a chosen code repeatedly and stores only its hash', async () => {
    const f = fixture();
    expect((await setCode(f, '583920')).status).toBe(200);
    const credential = f.sdk.tables.PassengerAccessCredential[0];
    expect(credential.token_hash).toBe(digest('583920'));
    expect(JSON.stringify(credential)).not.toContain('583920');
    expect(f.sdk.tables.Contact[0].access_code).toBe('');
    for (let i = 0; i < 2; i++) expect((await f.tablet({ action: 'lookup_code', code: '583920' })).status).toBe(200);
  });
  it('uses the same QR for both boarding and exiting without consuming it', async () => {
    const f = fixture(), pass = await getPass(f);
    for (const [index, status] of ['boarded', 'off_board'].entries()) {
      const lookup = await f.tablet({ action: 'lookup_code', code: pass.qr_token });
      expect(lookup.status).toBe(200);
      const data = await lookup.json();
      expect(data.code_type).toBe('permanent_qr');
      const response = await f.tablet({ action: 'check_in', staff_id: data.staff.id, method: 'qr', status, verification_grant: data.verification_grant, client_request_id: 'qr-boarding-' + index, occurred_at: new Date().toISOString() });
      expect(response.status).toBe(200);
    }
    expect((await getPass(f)).qr_token).toBe(pass.qr_token);
    expect(f.sdk.tables.StaffCheckIn).toHaveLength(2);
  });
  it('resets a forgotten code without the old code, invalidates old grants and preserves the QR', async () => {
    const f = fixture();
    await setCode(f, '583920');
    const before = await getPass(f);
    const oldLookup = await f.tablet({ action: 'lookup_code', code: '583920' });
    const old = await oldLookup.json();
    expect((await setCode(f, '471638')).status).toBe(200);
    expect((await getPass(f)).qr_token).toBe(before.qr_token);
    expect((await f.tablet({ action: 'lookup_code', code: '583920' })).status).toBe(404);
    expect((await f.tablet({ action: 'lookup_code', code: '471638' })).status).toBe(200);
    expect((await f.tablet({ action: 'check_in', staff_id: old.staff.id, method: 'code', status: 'boarded', verification_grant: old.verification_grant })).status).toBe(403);
    expect((await f.tablet({ action: 'lookup_code', code: before.qr_token })).status).toBe(200);
  });
  it('rejects an already chosen code without replacing the passenger code', async () => {
    const f = fixture();
    await setCode(f, '583920');
    f.sdk.tables.PassengerAccessCredential.push({ id: 'other', company_id: 'a', user_id: 'someone-else', token_hash: digest('471638') });
    expect((await setCode(f, '471638')).status).toBe(409);
    expect(f.sdk.tables.PassengerAccessCredential[0].token_hash).toBe(digest('583920'));
  });
  it('refuses collisions with another passenger temporary code', async () => {
    const f = fixture();
    f.sdk.tables.PassengerOneTimeCredential = [{ company_id: 'a', token_hash: digest('583920'), expires_at: '2099-01-01T00:00:00Z' }];
    expect((await setCode(f, '583920')).status).toBe(409);
  });
  it.each([null, 'mechanic', 'driver'])('refuses self-service for %s', async role => {
    const f = fixture(role);
    expect((await setCode(f, '583920')).status).toBe(401);
    expect(f.sdk.writes).toHaveLength(0);
  });
  it('ignores caller-selected identities and companies', async () => {
    const f = fixture();
    const response = await f.account({ action: 'boarding_set_code', code: '583920', user_id: 'someone-else', company_id: 'b' });
    expect(response.status).toBe(200);
    expect(f.sdk.tables.PassengerAccessCredential[0]).toMatchObject({ user_id: 'caller', company_id: 'a' });
  });
  it('rejects the QR on the wrong assigned bus or after membership is revoked', async () => {
    const f = fixture(), pass = await getPass(f);
    f.sdk.tables.Contact[0].vehicle_id = 'bus-b';
    expect((await f.tablet({ action: 'lookup_code', code: pass.qr_token })).status).toBe(403);
    f.sdk.tables.Contact[0].vehicle_id = 'bus-a';
    f.sdk.tables.CompanyMembership[0].active = false;
    expect((await f.tablet({ action: 'lookup_code', code: pass.qr_token })).status).toBe(403);
    expect((await f.account({ action: 'boarding_get' })).status).toBe(403);
  });
  it.each(['1234', 'abcdef', '1234567', 123456])('rejects invalid code %s before creating credentials', async code => {
    const f = fixture();
    expect((await setCode(f, code)).status).toBe(400);
    expect(f.sdk.writes).toHaveLength(0);
  });
  it('never includes the permanent QR in the tablet offline directory', async () => {
    const f = fixture(), pass = await getPass(f);
    const response = await f.tablet({ action: 'offline_directory' });
    expect(response.status).toBe(200);
    expect(JSON.stringify(await response.json())).not.toContain(pass.qr_token);
  });
});