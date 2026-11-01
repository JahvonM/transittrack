import { describe, it, expect } from 'vitest';
import { load, mock, request } from '../../../security-tests/helpers.js';
import { shareState, shareView } from '../../../base44/shared/journeyShare.ts';

// Journey sharing: a passenger's private link shows only their own ride,
// the bus only while they're on board, and ends when they get off.

const ago = (min) => new Date(Date.now() - min * 60_000).toISOString();

describe('what a shared journey shows', () => {
  it('waiting, on board, then ended, from the passenger\'s own taps', () => {
    const start = Date.now() - 30 * 60_000;
    expect(shareState([], start).state).toBe('waiting');
    expect(shareState([{ status: 'boarded', at: ago(10) }], start)).toMatchObject({ state: 'on_board' });
    expect(shareState([{ status: 'boarded', at: ago(20) }, { status: 'off_board', at: ago(2) }], start)).toMatchObject({ state: 'ended' });
    // A ride that ended before the link was made doesn't end the link.
    expect(shareState([{ status: 'boarded', at: ago(120) }, { status: 'off_board', at: ago(90) }], start).state).toBe('waiting');
  });
  it('shows the bus only while on board with a fresh position, and nothing else about the bus', () => {
    const bus = { name: 'Bus 12', plate_number: 'HA 1234', current_lat: 12.05, current_lng: -61.75, last_location_update: ago(0.5), capacity: 25, route_id: 'r', driver_name: 'Dana' };
    const riding = shareView({ state: { state: 'on_board', since: ago(10) }, person: { full_name: 'Jane Rider' }, vehicle: bus, direction: 'to_work', workplaceName: 'Main office' });
    expect(riding).toMatchObject({ state: 'on_board', first_name: 'Jane', vehicle_name: 'Bus 12', heading: 'Main office', location_status: 'live' });
    expect(riding.location).toMatchObject({ lat: 12.05, lng: -61.75 });
    expect(Object.keys(riding).sort()).toEqual(['ended_at', 'expires_at', 'first_name', 'heading', 'location', 'location_status', 'plate_number', 'since', 'state', 'vehicle_name']);
    expect(shareView({ state: { state: 'waiting' }, person: {}, vehicle: bus }).location).toBeNull();
    expect(shareView({ state: { state: 'on_board' }, person: {}, vehicle: { ...bus, last_location_update: ago(20) } }).location_status).toBe('stale');
    expect(shareView({ state: { state: 'on_board' }, person: {}, vehicle: bus, direction: 'to_home', workplaceName: 'Main office' }).heading).toBe('Home');
  });
});

function setup() {
  const sdk = mock('staff');
  sdk.tables.CompanyMembership[0] = { id: 'm', user_id: 'caller', company_id: 'a', scope: 'passenger', active: true, vehicle_id: 'bus-a' };
  sdk.tables.User[0].full_name = 'Jane Rider';
  Object.assign(sdk.tables, { VerificationGrant: [], StaffCheckIn: [], NfcCard: [{ id: 'c1', company_id: 'a', holder_source: 'contact', holder_id: 'rider', card_uid: 'CARD', is_active: true }], Workplace: [{ id: 'w', company_id: 'a', name: 'Main office' }] });
  Object.assign(sdk.tables.Vehicle[0], { plate_number: 'HA 1234', current_lat: 12.05, current_lng: -61.75, last_location_update: new Date().toISOString(), trip_direction: 'to_work' });
  const handler = load('journeyShare', sdk).default;
  const send = async (body) => { const r = await handler(request(body)); return { status: r.status, body: await r.json() }; };
  const tokenOf = (url) => new URLSearchParams(url.split('#')[1]).get('j');
  return { sdk, send, tokenOf };
}

describe('journey sharing link', () => {
  it('a passenger makes a link; it shows waiting, then the bus while they ride, then ends when they get off', async () => {
    const { sdk, send, tokenOf } = setup();
    const made = await send({ action: 'start' });
    expect(made.status).toBe(200);
    expect(made.body.url).toMatch(/\/share#j=[a-f0-9]{64}$/);
    const token = tokenOf(made.body.url);
    expect(JSON.stringify(sdk.tables.VerificationGrant)).not.toContain(token);
    expect((await send({ action: 'mine' })).body.active).toBe(true);

    // The link was made 10 minutes ago.
    sdk.tables.VerificationGrant[0].created_date = ago(10);
    const waiting = await send({ action: 'view', token });
    expect(waiting.body).toMatchObject({ state: 'waiting', first_name: 'Jane', vehicle_name: 'Bus A', heading: 'Main office', location: null });

    sdk.tables.StaffCheckIn.push({ id: 't1', company_id: 'a', vehicle_id: 'bus-a', card_tag: 'CARD', status: 'boarded', boarded_at: ago(5) });
    // Someone else on the same bus changes nothing for this link.
    sdk.tables.StaffCheckIn.push({ id: 't2', company_id: 'a', vehicle_id: 'bus-a', card_tag: 'OTHER', status: 'off_board', boarded_at: ago(2) });
    const riding = await send({ action: 'view', token });
    expect(riding.body).toMatchObject({ state: 'on_board', location_status: 'live' });
    expect(riding.body.location).toMatchObject({ lat: 12.05, lng: -61.75 });
    expect(JSON.stringify(riding.body)).not.toMatch(/CARD|OTHER|caller@|Caller@/);

    sdk.tables.StaffCheckIn.push({ id: 't3', company_id: 'a', vehicle_id: 'bus-a', card_tag: 'CARD', status: 'off_board', boarded_at: ago(1) });
    const ended = await send({ action: 'view', token });
    expect(ended.body).toMatchObject({ state: 'ended', location: null });
    expect(Date.parse(sdk.tables.VerificationGrant[0].expires_at)).toBeLessThanOrEqual(Date.now() + 15 * 60_000 + 1000);
  });

  it('the passenger can stop it, a new link ends the old one, and a change of bus ends it', async () => {
    const { sdk, send, tokenOf } = setup();
    const first = tokenOf((await send({ action: 'start' })).body.url);
    const second = tokenOf((await send({ action: 'start' })).body.url);
    expect((await send({ action: 'view', token: first })).status).toBe(404);
    expect((await send({ action: 'view', token: second })).status).toBe(200);
    // The passenger's bus comes from their passenger record (Contact).
    sdk.tables.Contact[0].vehicle_id = 'bus-c';
    expect((await send({ action: 'view', token: second })).status).toBe(404);
    sdk.tables.Contact[0].vehicle_id = 'bus-a';
    expect((await send({ action: 'view', token: second })).status).toBe(200);
    expect((await send({ action: 'stop' })).body).toEqual({ ok: true, active: false });
    expect((await send({ action: 'view', token: second })).status).toBe(404);
    expect((await send({ action: 'mine' })).body.active).toBe(false);
  });

  it('refuses bad links and people who aren\'t passengers', async () => {
    const { send } = setup();
    expect((await send({ action: 'view', token: 'x'.repeat(64) })).status).toBe(404);
    expect((await send({ action: 'view', token: 'a'.repeat(64) })).status).toBe(404);
    const driver = mock('driver');
    const r = await load('journeyShare', driver).default(request({ action: 'start' }));
    expect(r.status).toBe(403);
  });
});
