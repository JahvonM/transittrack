import { describe, it, expect } from 'vitest';
import { load, mock, request } from '../../../security-tests/helpers.js';

// Google and Apple sign-in leave a new account with the platform's default
// role "user". The passenger screen's company check refused that role with a
// sign-in answer, and the screen sent the person back to the login page,
// round and round.
const call = (sdk, body) => load('companyAccess', sdk).default(request(body));

describe('a brand-new account (platform role "user")', () => {
  it('becomes a passenger and is asked for a company code, not sent to sign in', async () => {
    const sdk = mock('user');
    sdk.tables.CompanyMembership = [];
    const res = await call(sdk, { action: 'context', restore: true });
    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({ code: 'COMPANY_ACCESS_REQUIRED' });
    expect(sdk.tables.User[0].role).toBe('staff');
  });

  it('can then join a company with its code', async () => {
    const sdk = mock('user');
    sdk.tables.CompanyMembership = [];
    const res = await call(sdk, { action: 'verify', code: 'JOIN12345678' });
    expect(res.status).toBe(200);
    expect(sdk.tables.User[0].role).toBe('staff');
    expect(sdk.tables.CompanyMembership.some((m) => m.company_id === 'a' && m.scope === 'passenger' && m.active)).toBe(true);
  });

  it('keeps a role an administrator set since the sign-in began', async () => {
    const sdk = mock('driver');
    sdk.auth.me = async () => ({ ...structuredClone(sdk.tables.User[0]), role: 'user' });
    const res = await call(sdk, { action: 'context' });
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ code: 'PASSENGER_ROLE_REQUIRED' });
    expect(sdk.tables.User[0].role).toBe('driver');
    expect(sdk.writes).toEqual([]);
  });

  it('answers other signed-in roles plainly instead of with a sign-in answer', async () => {
    for (const role of ['driver', 'mechanic']) {
      const sdk = mock(role);
      const res = await call(sdk, { action: 'context' });
      expect([role, res.status]).toEqual([role, 403]);
      expect(sdk.writes).toEqual([]);
    }
  });

  it('never promotes privileged or existing roles', async () => {
    for (const role of ['staff', 'admin', 'company']) {
      const sdk = mock(role);
      await call(sdk, { action: 'context' });
      expect(sdk.tables.User[0].role).toBe(role);
    }
  });
});
