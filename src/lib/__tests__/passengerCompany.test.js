import { describe, it, expect } from 'vitest';
import { load, mock, request } from '../../../security-tests/helpers.js';
const call = async (sdk, body) => {
  const res = await load('nfcCards', sdk).default(request(body));
  return { status: res.status, body: await res.json() };
};
function fixture(role = 'admin') {
  const sdk = mock(role);
  sdk.tables.User.push({ id: 'rider-user', role: 'passenger', email: 'rider@test.invalid' });
  sdk.tables.Contact = [{ id: 'rider', type: 'staff', name: 'Rider', email: 'rider@test.invalid', company_id: 'a', vehicle_id: 'bus-a' }];
  sdk.tables.CompanyMembership.push({ id: 'rider-membership', user_id: 'rider-user', company_id: 'a', scope: 'passenger', active: true, vehicle_id: 'bus-a' });
  sdk.tables.NfcCard = [{ id: 'card', holder_source: 'contact', holder_id: 'rider', company_id: 'a', is_active: true }];
  sdk.tables.PassengerAccessCredential = [{ id: 'code', contact_id: 'rider', company_id: 'a' }];
  sdk.tables.VerificationGrant = [{ id: 'invite', purpose: 'signup_invite', subject: 'email:rider@test.invalid', company_id: 'a', expires_at: '2099-01-01T00:00:00Z' }];
  sdk.tables.SignupHelp = [];
  return sdk;
}
describe('passenger company changes', () => {
  it('assigns both account and contact, revoking previous bus access and credentials', async () => {
    const sdk = fixture();
    expect((await call(sdk, { action: 'set_company', person_key: 'contact:rider', company_id: 'b' })).status).toBe(200);
    expect(sdk.tables.Contact[0]).toMatchObject({ company_id: 'b', vehicle_id: '' });
    expect(sdk.tables.CompanyMembership.find(m => m.id === 'rider-membership').active).toBe(false);
    expect(sdk.tables.CompanyMembership).toContainEqual(expect.objectContaining({ user_id: 'rider-user', company_id: 'b', active: true }));
    expect(sdk.tables.NfcCard[0].is_active).toBe(false);
    expect(sdk.tables.PassengerAccessCredential).toHaveLength(0);
    expect(Date.parse(sdk.tables.VerificationGrant[0].expires_at)).toBeLessThanOrEqual(Date.now());
  });
  it('rejects company managers assigning companies and invalid targets without writes', async () => {
    const sdk = fixture('company');
    expect((await call(sdk, { action: 'set_company', person_key: 'contact:rider', company_id: 'b' })).status).toBe(403);
    expect(sdk.writes).toHaveLength(0);
    const admin = fixture();
    expect((await call(admin, { action: 'set_company', person_key: 'contact:rider', company_id: 'missing' })).status).toBe(404);
    expect(admin.writes).toHaveLength(0);
  });
  it('removes a mistaken signup entry but keeps the account and trip history', async () => {
    const sdk = fixture();
    sdk.tables.Trip = [{ id: 'history', passenger_name: 'Rider', company_id: 'a' }];
    expect((await call(sdk, { action: 'signup_remove', company_id: 'a', person_ref: 'email:rider@test.invalid' })).status).toBe(200);
    expect(sdk.tables.Contact).toHaveLength(0);
    expect(sdk.tables.User.find(u => u.id === 'rider-user')).toBeDefined();
    expect(sdk.tables.Trip).toHaveLength(1);
    expect(sdk.tables.CompanyMembership.find(m => m.id === 'rider-membership').active).toBe(false);
    expect(sdk.tables.NfcCard[0].is_active).toBe(false);
  });
  it('prevents a manager removing a passenger from another company', async () => {
    const sdk = fixture('company');
    expect((await call(sdk, { action: 'signup_remove', company_id: 'b', person_ref: 'email:rider@test.invalid' })).status).toBe(403);
    expect(sdk.writes).toHaveLength(0);
  });
});
