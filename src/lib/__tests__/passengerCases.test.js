import { afterAll, describe, it, expect, vi } from 'vitest';
import { load, mock, request } from '../../../security-tests/helpers.js';
import { caseStatusText, newReference, readCaseRequest } from '../../../base44/shared/passengerCases.ts';

// Passenger requests and support cases (passengerCases): a passenger sees and
// answers only their own; the server adds their bus; only admins run the inbox.

// The server links a request to today's ride (Grenada day), so start the
// clock at midday: a tap 20 minutes ago is then always today, whenever the
// tests run (it failed just after midnight). The clock still moves forward.
vi.useFakeTimers({ toFake: ['Date'], shouldAdvanceTime: true });
vi.setSystemTime(new Date('2026-11-02T16:00:00Z'));
afterAll(() => vi.useRealTimers());

const TODAY = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Grenada' });
function setup(role = 'staff') {
  const sdk = mock(role);
  // An approved passenger of company A who rides Bus A (directory card by email).
  sdk.tables.CompanyMembership[0] = { id: 'm', user_id: 'caller', company_id: 'a', scope: 'passenger', active: true, vehicle_id: 'bus-a' };
  sdk.tables.User.push({ id: 'other', role: 'staff', email: 'other@test.invalid', full_name: 'Other Rider' }, { id: 'boss', role: 'admin', email: 'boss@test.invalid', full_name: 'Office' });
  sdk.tables.Vehicle[0].trip_direction = 'to_home';
  sdk.tables.PassengerCase = [];
  sdk.tables.LostItemReport = [];
  sdk.tables.GroupMessage = [];
  sdk.tables.AuditLog = [];
  sdk.tables.StaffCheckIn = [{ id: 't1', company_id: 'a', vehicle_id: 'bus-a', card_tag: 'CARD', status: 'boarded', boarded_at: new Date(Date.now() - 20 * 60_000).toISOString() }];
  const handler = load('passengerCases', sdk).default;
  const send = async (body) => { const r = await handler(request(body)); return { status: r.status, body: await r.json() }; };
  const as = (id) => { sdk.tables.User.unshift(sdk.tables.User.splice(sdk.tables.User.findIndex((u) => u.id === id), 1)[0]); };
  return { sdk, send, as };
}

describe('request rules', () => {
  it('checks each kind of request', () => {
    expect(readCaseRequest({ kind: 'time_change', requested_date: TODAY, requested_time: '07:15' }, TODAY).data).toMatchObject({ requested_time: '07:15' });
    expect(readCaseRequest({ kind: 'time_change', requested_date: '2020-01-01', requested_time: '07:15' }, TODAY).error).toMatch(/today or later/);
    expect(readCaseRequest({ kind: 'pickup_change', requested_date: TODAY, requested_pickup: '' }, TODAY).error).toMatch(/where/);
    expect(readCaseRequest({ kind: 'missed_pickup', details: '' }, TODAY).error).toMatch(/what happened/);
    expect(readCaseRequest({ kind: 'feedback', rating: 9 }, TODAY).error).toMatch(/1 to 5/);
    expect(readCaseRequest({ kind: 'refund' }, TODAY).error).toBeTruthy();
  });
  it('references are short and avoid look-alike characters', () => {
    const ref = newReference((n) => new Uint8Array(n).map((_, i) => i * 37));
    expect(ref).toMatch(/^TT-[2-9A-HJKMNP-Z]{6}$/);
  });
  it('says the status in plain words', () => {
    expect(caseStatusText('time_change', 'rejected')).toBe('Not possible');
    expect(caseStatusText('feedback', 'requested')).toBe('Received');
  });
});

describe('a passenger', () => {
  it('sends a request; the server adds their bus, direction and boarding, and emails the office', async () => {
    const f = setup();
    const res = await f.send({ action: 'create', kind: 'time_change', requested_date: TODAY, requested_time: '06:45', details: 'Early shift', vehicle_id: 'bus-b' });
    expect(res.status).toBe(200);
    expect(res.body.case).toMatchObject({ status: 'requested', vehicle_name: 'Bus A', requested_time: '06:45' });
    expect(res.body.case.reference).toMatch(/^TT-/);
    expect(res.body.case).not.toHaveProperty('user_email');
    const row = f.sdk.tables.PassengerCase[0];
    expect(row).toMatchObject({ user_id: 'caller', company_id: 'a', vehicle_id: 'bus-a', leg: 'to_home', trip_date: TODAY });
    expect(row.ride_boarded_at).toBeTruthy();
    expect(f.sdk.emails.map((e) => e.to)).toContain('boss@test.invalid');
  });
  it('a missed pickup also reaches the bus chat with its reference', async () => {
    const f = setup();
    const res = await f.send({ action: 'create', kind: 'missed_pickup', details: 'The bus passed before I got there' });
    expect(f.sdk.tables.GroupMessage[0]).toMatchObject({ vehicle_id: 'bus-a', channel: 'staff' });
    expect(f.sdk.tables.GroupMessage[0].text).toContain(res.body.case.reference);
  });
  it('sees only their own requests, plus their lost item reports', async () => {
    const f = setup();
    await f.send({ action: 'create', kind: 'other', details: 'Mine' });
    f.sdk.tables.PassengerCase.push({ id: 'theirs', reference: 'TT-XXXXXX', user_id: 'other', company_id: 'a', kind: 'other', status: 'requested', details: 'Not yours' });
    f.sdk.tables.LostItemReport.push({ id: 'lost1', reporter_id: 'caller', company_id: 'a', description: 'Blue umbrella', status: 'found' });
    const list = (await f.send({ action: 'mine' })).body.cases;
    expect(list.map((c) => c.details).sort()).toEqual(['Blue umbrella', 'Mine']);
    expect(list.find((c) => c.kind === 'lost_item')).toMatchObject({ status: 'pending', source: 'lost_item' });
  });
  it('cannot read, answer or withdraw someone else\'s request', async () => {
    const f = setup();
    f.sdk.tables.PassengerCase.push({ id: 'theirs', reference: 'TT-XXXXXX', user_id: 'other', company_id: 'a', kind: 'other', status: 'requested' });
    for (const action of ['reply', 'withdraw', 'seen']) expect((await f.send({ action, id: 'theirs', text: 'hi' })).status).toBe(404);
    expect(f.sdk.tables.PassengerCase[0].replies).toBeUndefined();
  });
  it('can withdraw an open request, but not reopen a finished one', async () => {
    const f = setup();
    const { case: c } = (await f.send({ action: 'create', kind: 'cancel_ride', requested_date: TODAY })).body;
    expect((await f.send({ action: 'withdraw', id: c.id })).body.case.status).toBe('closed');
    expect((await f.send({ action: 'reply', id: c.id, text: 'Actually…' })).status).toBe(409);
  });
  it('cannot use the office inbox', async () => {
    const f = setup();
    expect((await f.send({ action: 'list' })).status).toBe(403);
    expect((await f.send({ action: 'set_status', id: 'x', status: 'confirmed' })).status).toBe(403);
  });
  it('drivers and company managers are not passengers here', async () => {
    for (const role of ['driver', 'company', 'mechanic']) {
      const f = setup(role);
      expect((await f.send({ action: 'create', kind: 'other', details: 'Hello there' })).status).toBe(403);
    }
  });
});

describe('the office', () => {
  it('lists open requests, replies, and confirms or turns down a change with a note', async () => {
    const f = setup();
    const { case: c } = (await f.send({ action: 'create', kind: 'time_change', requested_date: TODAY, requested_time: '06:45' })).body;
    f.as('boss');
    expect((await f.send({ action: 'list' })).body.cases.map((x) => x.id)).toEqual([c.id]);
    await f.send({ action: 'reply', id: c.id, text: 'Checking with your driver' });
    expect(f.sdk.tables.PassengerCase[0]).toMatchObject({ status: 'pending', passenger_unread: true });
    expect((await f.send({ action: 'set_status', id: c.id, status: 'resolved' })).status).toBe(400);
    const done = await f.send({ action: 'set_status', id: c.id, status: 'confirmed', note: 'Your driver will come at 6:45' });
    expect(done.body.case).toMatchObject({ status: 'confirmed', closed_by: 'Office' });
    expect(f.sdk.tables.AuditLog.at(-1)).toMatchObject({ entity: 'PassengerCase', record_id: c.id });
    expect((await f.send({ action: 'list' })).body.cases).toEqual([]);
    f.as('caller');
    const mine = (await f.send({ action: 'mine' })).body.cases[0];
    expect(mine).toMatchObject({ status: 'confirmed', unread: true });
    expect(mine.replies.map((r) => r.name)).toEqual(['McSween Transport', 'McSween Transport']);
  });
});
