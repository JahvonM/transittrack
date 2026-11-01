import { describe, it, expect } from 'vitest';
import { load, mock, request } from '../../../security-tests/helpers.js';
import { cardStatus, canReactivate } from '../../../base44/shared/cardStatus.ts';

// Card states in the card office (nfcCards) and what the boarding tablet
// (kioskCheckIn) then does with the card.

function setup(role = 'admin') {
  const sdk = mock(role);
  sdk.tables.Contact[0].nfc_card_tag = 'AABBCCDD';
  sdk.tables.NfcCard = [{ id: 'c1', company_id: 'a', holder_source: 'contact', holder_id: 'rider', holder_name: 'Caller', card_uid: 'AABBCCDD', is_active: true, issue_date: '2026-10-01T00:00:00Z' }];
  sdk.tables.AuditLog = [];
  sdk.tables.StaffCheckIn = [];
  sdk.tables.DriverShift = [];
  const cards = load('nfcCards', sdk).default;
  const kiosk = load('kioskCheckIn', sdk).default;
  const call = (handler) => async (body) => { const r = await handler(request(body)); return { status: r.status, body: await r.json() }; };
  return { sdk, office: call(cards), tablet: (body) => call(kiosk)({ device_id: 'tablet', ...body }) };
}
const card = (f) => f.sdk.tables.NfcCard.find((c) => c.id === 'c1');
const lastAudit = (f) => f.sdk.tables.AuditLog.at(-1);

describe('older card records', () => {
  it('get a state from what they already have', () => {
    expect(cardStatus({ is_active: true })).toBe('active');
    expect(cardStatus({ is_active: false, revoke_reason: 'Replaced by a new card' })).toBe('replaced');
    expect(cardStatus({ is_active: false, revoke_reason: 'Revoked by admin' })).toBe('revoked');
    expect(cardStatus({ is_active: false })).toBe('revoked');
    // The tablets' switch wins if the two ever disagree.
    expect(cardStatus({ is_active: true, status: 'lost' })).toBe('active');
    expect(canReactivate({ is_active: false, status: 'lost' })).toBe(false);
  });
});

describe('suspending a card', () => {
  it('stops it on the tablet, is audited and asks the tablets to refresh', async () => {
    const f = setup();
    const before = f.sdk.tables.KioskDevice[0].directory_sent_at;
    const res = await f.office({ action: 'revoke', card_id: 'c1', status: 'suspended' });
    expect(res.status).toBe(200);
    expect(res.body.tablets_told).toBe(1);
    expect(card(f)).toMatchObject({ is_active: false, status: 'suspended', revoke_reason: 'Suspended' });
    expect(lastAudit(f)).toMatchObject({ action: 'card_suspended', record_id: 'c1' });
    expect(f.sdk.tables.KioskDevice[0].directory_sent_at).not.toBe(before);
    expect((await f.tablet({ action: 'lookup_tag', card_tag: 'AABBCCDD' })).status).not.toBe(200);
  });
  it('can be switched back on, and then works on the tablet again', async () => {
    const f = setup();
    await f.office({ action: 'revoke', card_id: 'c1', status: 'suspended' });
    const res = await f.office({ action: 'reactivate', card_id: 'c1' });
    expect(res.status).toBe(200);
    expect(card(f)).toMatchObject({ is_active: true, status: 'active', revoked_at: null });
    expect(f.sdk.tables.Contact[0].nfc_card_tag).toBe('AABBCCDD');
    expect(lastAudit(f)).toMatchObject({ action: 'card_reactivated' });
    const look = await f.tablet({ action: 'lookup_tag', card_tag: 'AABBCCDD' });
    expect(look.status).toBe(200);
    expect(look.body.staff.id).toBe('rider');
  });
  it('can later be marked lost, keeping the time it first stopped', async () => {
    const f = setup();
    await f.office({ action: 'revoke', card_id: 'c1', status: 'suspended' });
    const stoppedAt = card(f).revoked_at;
    expect((await f.office({ action: 'revoke', card_id: 'c1', status: 'lost' })).status).toBe(200);
    expect(card(f)).toMatchObject({ status: 'lost', revoked_at: stoppedAt });
    expect(lastAudit(f)).toMatchObject({ action: 'card_lost' });
  });
});

describe('cards that stay stopped', () => {
  it('a lost or revoked card cannot be switched back on', async () => {
    for (const status of ['lost', 'revoked']) {
      const f = setup();
      await f.office({ action: 'revoke', card_id: 'c1', status });
      const res = await f.office({ action: 'reactivate', card_id: 'c1' });
      expect(res.status).toBe(409);
      expect(res.body.error).toMatch(/Issue the card again/);
      expect(card(f).is_active).toBe(false);
    }
  });
  it('a suspended card is marked replaced when the person gets a new card', async () => {
    const f = setup();
    await f.office({ action: 'revoke', card_id: 'c1', status: 'suspended' });
    const issued = await f.office({ action: 'issue', person_key: 'contact:rider', uid: '11223344' });
    expect(issued.body.ok).toBe(true);
    expect(card(f).status).toBe('replaced');
    expect((await f.office({ action: 'reactivate', card_id: 'c1' })).status).toBe(409);
  });
  it('an active card replaced by a new one is marked replaced', async () => {
    const f = setup();
    await f.office({ action: 'issue', person_key: 'contact:rider', uid: '11223344' });
    expect(card(f)).toMatchObject({ is_active: false, status: 'replaced' });
    expect(f.sdk.tables.NfcCard.at(-1)).toMatchObject({ card_uid: '11223344', is_active: true, status: 'active' });
  });
});

describe('who can change a card', () => {
  it('refuses an unknown state', async () => {
    const f = setup();
    expect((await f.office({ action: 'revoke', card_id: 'c1', status: 'paused' })).status).toBe(400);
    expect(card(f).is_active).toBe(true);
  });
  it('a company manager cannot stop or restore another company\'s card', async () => {
    const f = setup('company');
    f.sdk.tables.CompanyMembership[0] = { id: 'm', user_id: 'caller', company_id: 'b', scope: 'manager', active: true };
    expect((await f.office({ action: 'revoke', card_id: 'c1', status: 'lost' })).status).toBe(404);
    expect((await f.office({ action: 'reactivate', card_id: 'c1' })).status).toBe(404);
    expect(card(f).is_active).toBe(true);
  });
  it('passengers and drivers cannot reach the card office', async () => {
    for (const role of ['staff', 'passenger', 'driver']) {
      const f = setup(role);
      expect((await f.office({ action: 'revoke', card_id: 'c1', status: 'lost' })).status).toBe(403);
    }
  });
});
