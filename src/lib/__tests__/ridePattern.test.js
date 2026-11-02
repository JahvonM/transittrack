import { describe, it, expect } from 'vitest';
import { load, mock, request } from '../../../security-tests/helpers.js';
import { patternSkips, patternText, readPattern, transitDay } from '../../../base44/shared/ridePattern.ts';

// Regular days off: a passenger asks, the office approves, and on those days
// they're left off the driver's lists like "Skip today".

const NOW = Date.parse('2026-11-06T12:00:00Z'); // Friday 6 Nov, 8:00 AM in Grenada
const TODAY = transitDay(Date.now()).day;

describe('regular days off: rules', () => {
  it('checks the request', () => {
    expect(readPattern({ days: [5, 5, 9], direction: 'to_home', requested_date: TODAY }, TODAY).pattern).toEqual({ days: [5], direction: 'to_home', from: TODAY, until: '' });
    expect(readPattern({ days: [], requested_date: TODAY }, TODAY).error).toMatch(/Choose the days/);
    expect(readPattern({ days: [0, 1, 2, 3, 4, 5, 6], requested_date: TODAY }, TODAY).error).toMatch(/at most six/);
    expect(readPattern({ days: [1], requested_date: '2020-01-01' }, TODAY).error).toMatch(/today or later/);
    expect(readPattern({ days: [1], requested_date: TODAY, until_date: '2020-01-01' }, TODAY).error).toMatch(/on or after/);
  });
  it('applies on its weekdays, between its dates, in its direction', () => {
    const fridays = { days: [5], direction: 'both', from: '2026-11-01', until: '' };
    expect(transitDay(NOW)).toEqual({ day: '2026-11-06', weekday: 5 });
    expect(patternSkips(fridays, NOW)).toBe(true);
    expect(patternSkips(fridays, NOW + 86_400_000)).toBe(false);
    expect(patternSkips({ ...fridays, from: '2026-11-07' }, NOW)).toBe(false);
    expect(patternSkips({ ...fridays, until: '2026-11-05' }, NOW)).toBe(false);
    expect(patternSkips({ ...fridays, direction: 'to_home' }, NOW, 'to_work')).toBe(false);
    expect(patternSkips({ ...fridays, direction: 'to_home' }, NOW, 'to_home')).toBe(true);
    expect(patternSkips(null, NOW)).toBe(false);
    expect(patternText({ days: [1, 5], direction: 'to_work', from: '2026-11-02' })).toBe('Not riding on Mondays and Fridays (to work only) from 2026-11-02');
  });
});

function setup() {
  const sdk = mock('staff');
  sdk.tables.CompanyMembership[0] = { id: 'm', user_id: 'caller', company_id: 'a', scope: 'passenger', active: true, vehicle_id: 'bus-a' };
  sdk.tables.User.push({ id: 'boss', role: 'admin', email: 'boss@test.invalid', full_name: 'Office' });
  Object.assign(sdk.tables, { PassengerCase: [], LostItemReport: [], GroupMessage: [], AuditLog: [], StaffCheckIn: [] });
  const handler = load('passengerCases', sdk).default;
  const send = async (body) => { const r = await handler(request(body)); return { status: r.status, body: await r.json() }; };
  const as = (id) => { sdk.tables.User.unshift(sdk.tables.User.splice(sdk.tables.User.findIndex((u) => u.id === id), 1)[0]); };
  return { sdk, send, as };
}
const caller = (sdk) => sdk.tables.User.find((u) => u.id === 'caller');

describe('regular days off: ask, approve, stop', () => {
  it('takes effect only when the office confirms, and the passenger can stop it', async () => {
    const { sdk, send, as } = setup();
    const asked = await send({ action: 'create', kind: 'regular_days', days: [5], direction: 'both', requested_date: TODAY });
    expect(asked.status).toBe(200);
    expect(asked.body.case).toMatchObject({ kind: 'regular_days', days: [5], direction: 'both', status: 'requested' });
    expect(caller(sdk).ride_pattern).toBeFalsy();
    // A passenger can't set it on their own account.
    expect((await send({ action: 'set_status', id: asked.body.case.id, status: 'confirmed' })).status).toBe(403);
    as('boss');
    expect((await send({ action: 'set_status', id: asked.body.case.id, status: 'confirmed', note: 'Fine from this week.' })).status).toBe(200);
    expect(caller(sdk).ride_pattern).toMatchObject({ days: [5], direction: 'both', from: TODAY, case_id: asked.body.case.id, approved_by: 'Office' });
    as('caller');
    expect((await send({ action: 'mine' })).body.pattern).toMatchObject({ days: [5] });
    const ended = await send({ action: 'end_pattern' });
    expect(ended.body).toEqual({ ok: true, pattern: null });
    expect(caller(sdk).ride_pattern).toBeNull();
    expect(sdk.tables.PassengerCase[0]).toMatchObject({ status: 'closed', office_unread: true });
    expect((await send({ action: 'end_pattern' })).status).toBe(409);
  });
  it('ends when the office closes the request it came from', async () => {
    const { sdk, send, as } = setup();
    const asked = await send({ action: 'create', kind: 'regular_days', days: [1, 3], direction: 'to_home', requested_date: TODAY });
    as('boss');
    await send({ action: 'set_status', id: asked.body.case.id, status: 'confirmed' });
    expect(caller(sdk).ride_pattern?.days).toEqual([1, 3]);
    await send({ action: 'set_status', id: asked.body.case.id, status: 'closed' });
    expect(caller(sdk).ride_pattern).toBeNull();
  });
  it('a turned-down request changes nothing', async () => {
    const { sdk, send, as } = setup();
    const asked = await send({ action: 'create', kind: 'regular_days', days: [2], requested_date: TODAY });
    as('boss');
    await send({ action: 'set_status', id: asked.body.case.id, status: 'rejected', note: 'We need you on Tuesdays.' });
    expect(caller(sdk).ride_pattern).toBeFalsy();
  });
});
