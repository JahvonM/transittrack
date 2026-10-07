import { describe, it, expect, vi, afterEach } from 'vitest';
import { load, mock, request, digest } from '../../../security-tests/helpers.js';
import { httpStatus, sessionRejected, companyGrantRejected } from '@/lib/requestError';
import { installMemoryStorage } from './memoryStorage';
import { webcrypto } from 'node:crypto';
vi.mock('@/api/base44Client', () => ({ base44: { functions: { invoke: vi.fn() } } }));
import { rememberPin, checkPinOffline, forgetPin } from '@/lib/offlinePin';
afterEach(() => vi.unstubAllGlobals());
const failure = status => Object.assign(new Error('Temporarily unavailable'), { status });
const call = (name, sdk, body) => load(name, sdk).default(request(body));

describe('transient failures do not become sign-outs', () => {
  for (const name of ['entityAccess', 'companyAccess']) {
    for (const status of [429, 500, 503]) it(`${name} preserves an auth service failure ${status}`, async () => {
      const sdk = mock(); sdk.auth.me = async () => { throw failure(status); };
      const res = await call(name, sdk, { entity: 'User', operation: 'get', id: 'me', action: 'context', grant: 'a'.repeat(64) });
      expect(res.status).toBe(status);
      expect(sdk.writes).toEqual([]);
    });
  }
  for (const name of ['entityAccess', 'companyAccess']) it(`${name} still refuses a genuinely ended session`, async () => {
    const sdk = mock(); sdk.auth.me = async () => { throw failure(401); };
    expect((await call(name, sdk, { entity: 'User', operation: 'get', id: 'me', action: 'context', grant: 'a'.repeat(64) })).status).toBe(401);
  });
  for (const status of [429, 500, 503]) it(`tablet lookup failure ${status} is not invalid pairing`, async () => {
    const sdk = mock(); const db = sdk.asServiceRole.entities;
    sdk.asServiceRole.entities = new Proxy(db, { get: (target, name) => name === 'KioskDevice' ? { ...target[name], get: async () => { throw failure(status); } } : target[name] });
    expect((await call('driverSession', sdk, { action: 'verify_pin', device_id: 'tablet', pin: '1234' })).status).toBe(status);
  });
  it('uses the SDK and legacy error formats without treating a permission denial as an expired login', () => {
    expect(httpStatus({ originalError: { response: { status: 429 } } })).toBe(429);
    expect(sessionRejected({ status: 401 })).toBe(true);
    expect(sessionRejected({ response: { status: 401 } })).toBe(true);
    expect(sessionRejected({ status: 403, data: { error: 'Forbidden' } })).toBe(false);
    expect(sessionRejected({ status: 403, data: { extra_data: { reason: 'auth_required' } } })).toBe(true);
    expect(companyGrantRejected({ status: 401, data: { error: 'Sign in to continue' } })).toBe(false);
    expect(companyGrantRejected({ status: 401, data: { code: 'COMPANY_ACCESS_REQUIRED' } })).toBe(true);
    expect(companyGrantRejected({ status: 429 })).toBe(false);
  });
});

describe('request-local loading improvements preserve access checks', () => {
  it('looks up a shared parent bus once for a whole page of messages', async () => {
    const sdk = mock('passenger');
    sdk.tables.GroupMessage = Array.from({ length: 40 }, (_, i) => ({ id: 'm' + i, company_id: 'a', vehicle_id: 'bus-a', channel: 'staff', text: 'Message' }));
    const res = await call('entityAccess', sdk, { entity: 'GroupMessage', operation: 'list' });
    expect((await res.json()).result).toHaveLength(40);
    expect(sdk.reads.filter(r => r.name === 'Vehicle' && r.method === 'get')).toHaveLength(1);
  });
  it('validates one company code for all passengers on a tablet heartbeat', async () => {
    const sdk = mock(); sdk.tables.KioskDevice[0].kiosk_type = 'driver';
    sdk.tables.CompanyMembership = Array.from({ length: 30 }, (_, i) => ({ id: 'm' + i, user_id: 'u' + i, company_id: 'a', scope: 'passenger', active: true, code_hash: digest('JOIN12345678') }));
    const rows = await load('driverSession', sdk, ['approvedPassengerMemberships']).approvedPassengerMemberships(sdk, 'a');
    expect(rows).toHaveLength(30);
    expect(sdk.reads.filter(r => r.name === 'Company' && r.method === 'get')).toHaveLength(1);
  });
});

describe('verified PIN persistence', () => {
  it('finishes durable hashed storage and survives later wrong entries', async () => {
    installMemoryStorage(); vi.stubGlobal('crypto', webcrypto);
    expect(await rememberPin('tablet', '1234')).toBe(true);
    const saved = localStorage.getItem('tt_driver_pin_check_tablet');
    expect(JSON.parse(saved).hash).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.parse(saved)).not.toHaveProperty('pin');
    expect(await checkPinOffline('tablet', '0000')).toBe(false);
    expect(localStorage.getItem('tt_driver_pin_check_tablet')).toBe(saved);
    expect(await checkPinOffline('tablet', '1234')).toBe(true);
    expect(await checkPinOffline('other-tablet', '1234')).toBe(false);
    forgetPin('tablet');
    expect(await checkPinOffline('tablet', '1234')).toBe(false);
  });
  it('reports blocked tablet storage instead of claiming a successful save', async () => {
    installMemoryStorage(); vi.stubGlobal('crypto', webcrypto);
    localStorage.setItem = () => { throw new Error('storage blocked'); };
    expect(await rememberPin('tablet', '1234')).toBe(false);
  });
  it('tolerates corrupt cryptographic storage without crashing the login screen', async () => {
    installMemoryStorage(); vi.stubGlobal('crypto', webcrypto);
    localStorage.setItem('tt_driver_pin_check_tablet', JSON.stringify({ salt: 'bad salt', hash: 'corrupt' }));
    expect(await checkPinOffline('tablet', '1234')).toBe(false);
  });
});