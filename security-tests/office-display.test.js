// Office displays (base44/functions/officeDisplay): who can manage them, what
// a display credential can and cannot do, what a screen is sent, pairing, and
// the camera safeguards. Simulated server tests; no real screens or tablets.
import {describe, it, expect, beforeEach, afterEach, vi} from 'vitest';
import {load, request, digest} from './helpers.js';

const NOW = Date.parse('2026-11-01T16:00:00.000Z'); // 12:00 in Grenada
const at = (ms) => new Date(NOW + ms).toISOString();
const MIN = 60_000;
const SECRETS = {
  TT_DURABLE_WRITES_ENABLED: 'true', TT_ATOMIC_STORE_URL: 'https://example.supabase.co',
  TT_ATOMIC_SERVICE_ROLE_KEY: 'sb_secret_synthetic-test-key-never-real',
  TT_SUPPORT_ENABLED: 'true', TT_SUPPORT_TRANSPORT: 'webrtc', TT_SUPPORT_STUN_URL: 'stun:stun.example.test:3478',
};
const OFFER = ['v=0', 'm=video 9 UDP/TLS/RTP/SAVPF 96', 'a=sendonly', 'a=fingerprint:sha-256 ' + Array(32).fill('AB').join(':'), 'a=mid:0'].join('\r\n');
const ANSWER = OFFER.replace('a=sendonly', 'a=recvonly');

function matches(row, query) {
  return Object.entries(query).every(([key, value]) => {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      return Object.entries(value).every(([op, x]) => {
        const v = row[key];
        if (op === '$in') return x.includes(v);
        if (op === '$ne') return v !== x;
        if (op === '$gte') return v != null && String(v) >= String(x);
        if (op === '$lt') return v != null && String(v) < String(x);
        throw new Error('Unsupported operator in test: ' + op);
      });
    }
    return row[key] === value;
  });
}

function client() {
  const tables = {
    User: [
      {id: 'admin-1', role: 'admin', email: 'boss@test.invalid', full_name: 'Boss'},
      {id: 'admin-2', role: 'admin', email: 'second@test.invalid', full_name: 'Second'},
      {id: 'staff-1', role: 'staff', email: 'staff@test.invalid', full_name: 'Staff'},
    ],
    Company: [
      {id: 'a', name: 'A Co', access_code: 'JOIN12345678', logo_url: 'https://cdn.test/a.png', boss_phone: '+14735550000'},
      {id: 'b', name: 'B Co', access_code: 'JOIN87654321'},
    ],
    Vehicle: [
      {id: 'bus-a', company_id: 'a', name: 'Bus A', driver_pin: '1234', entry_code: '9999', driver_name: 'Dana Driver', driver_email: 'dana@test.invalid',
        current_lat: 12.05, current_lng: -61.75, last_location_update: at(-30_000), tracking_active: true, status: 'on_trip', in_service: true, trail: [[1, 2]], vin: 'VIN123'},
      {id: 'bus-a2', company_id: 'a', name: 'Bus A2', in_service: false, status: 'offline'},
      {id: 'bus-b', company_id: 'b', name: 'Bus B', driver_name: 'Other Driver', current_lat: 12.1, current_lng: -61.7},
    ],
    KioskDevice: [
      {id: 'cam-a', company_id: 'a', vehicle_id: 'bus-a', kiosk_type: 'driver', status: 'active', paired: true, label: 'Driver tablet', pairing_code: 'SECRETPAIR1',
        last_seen: at(-MIN), helper_health: {support_available: true, support_transport: 'webrtc', battery: 80, charging: false, wifi_ssid: 'Office'}},
      {id: 'cam-a2', company_id: 'a', vehicle_id: 'bus-a2', kiosk_type: 'driver', status: 'active', paired: true, label: 'Driver tablet 2',
        helper_health: {support_available: true, support_transport: 'webrtc'}},
      {id: 'board-a', company_id: 'a', vehicle_id: 'bus-a', kiosk_type: 'bus_boarding', status: 'active', paired: true, helper_health: {support_available: true, support_transport: 'webrtc'}},
      {id: 'cam-b', company_id: 'b', vehicle_id: 'bus-b', kiosk_type: 'driver', status: 'active', paired: true, helper_health: {support_available: true, support_transport: 'webrtc'}},
    ],
    StaffCheckIn: [
      {id: 'c1', company_id: 'a', vehicle_id: 'bus-a', staff_name: 'Pat Passenger', card_tag: 'CARD-1', person_key: 'pk-1', staff_picture_url: 'https://x/p.jpg', status: 'boarded', boarded_at: at(-10 * MIN), created_date: at(-10 * MIN)},
      {id: 'c2', company_id: 'b', vehicle_id: 'bus-b', staff_name: 'Other Rider', person_key: 'pk-2', status: 'boarded', boarded_at: at(-5 * MIN), created_date: at(-5 * MIN)},
    ],
    DriverShift: [{id: 's1', company_id: 'a', vehicle_id: 'bus-a', driver_name: 'Dana Driver', driver_email: 'dana@test.invalid', started_at: at(-60 * MIN)}],
    Trip: [
      {id: 't1', company_id: 'a', vehicle_id: 'bus-a', vehicle_name: 'Bus A', job_type: 'airport_pickup', status: 'scheduled', scheduled_time: at(-20 * MIN),
        passenger_name: 'Guest Name', passenger_phone: '+1473555', pickup_name: 'Airport', pickup_address: '1 Home Road', dropoff_name: 'Hotel',
        dropoff_address: '2 Beach Road', client_name: 'Hotel Client', notes: 'gate code 4321', price: 50, pickup_signature_url: 'https://x/sig.png', driver_email: 'dana@test.invalid'},
      {id: 't2', company_id: 'a', vehicle_id: 'bus-a', job_type: 'transfer', status: 'scheduled', scheduled_time: at(90 * MIN), pickup_name: 'Hotel', dropoff_name: 'Town'},
      {id: 't3', company_id: 'b', vehicle_id: 'bus-b', job_type: 'transfer', status: 'on_the_way', scheduled_time: at(-5 * MIN), passenger_name: 'B Guest'},
    ],
    RideException: [{id: 'e1', company_id: 'a', vehicle_id: 'bus-a', kind: 'no_show', person_name: 'Pat Passenger', person_ref: 'email:pat@test.invalid', note: 'called twice', at: at(-15 * MIN)}],
    Fault: [
      {id: 'f1', company_id: 'a', vehicle_id: 'bus-a', title: 'Brake light', description: 'Driver said...', severity: 'high', status: 'open', reported_by: 'dana@test.invalid', photo_url: 'https://x/f.jpg'},
      {id: 'f2', company_id: 'b', vehicle_id: 'bus-b', title: 'B fault', severity: 'low', status: 'open'},
    ],
    MaintenanceSchedule: [{id: 'm1', company_id: 'a', vehicle_id: 'bus-a2', service_type: 'Oil change', status: 'overdue', assigned_mechanic_name: 'Mo'}],
    Inspection: [{id: 'i1', company_id: 'a', vehicle_id: 'bus-a', status: 'failed', date: at(-24 * 60 * MIN), driver_email: 'dana@test.invalid'}],
    AuditLog: [], TabletSupportSession: [], OfficeDisplay: [], OfficeDisplayPairing: [],
  };
  let sequence = 0;
  const entities = new Proxy({}, {get: (_, name) => ({
    filter: async (query = {}, sort, limit = 1000) => {
      let rows = (tables[name] || []).filter((r) => matches(r, query));
      if (sort) { const desc = sort.startsWith('-'), field = sort.replace(/^-/, ''); rows = [...rows].sort((a, b) => String(a[field] ?? '').localeCompare(String(b[field] ?? '')) * (desc ? -1 : 1)); }
      return structuredClone(rows.slice(0, limit));
    },
    list: async (sort, limit = 1000) => structuredClone((tables[name] || []).slice(0, limit)),
    get: async (id) => { const row = (tables[name] || []).find((r) => r.id === id); if (!row) throw Object.assign(new Error('missing'), {status: 404}); return structuredClone(row); },
    create: async (data) => { const row = {id: name + '-' + (++sequence), created_date: new Date().toISOString(), ...structuredClone(data)}; (tables[name] ||= []).push(row); return structuredClone(row); },
    update: async (id, data) => { const row = (tables[name] || []).find((r) => r.id === id); if (!row) throw new Error('missing'); Object.assign(row, structuredClone(data), {updated_date: new Date().toISOString()}); return structuredClone(row); },
    delete: async (id) => { tables[name] = (tables[name] || []).filter((r) => r.id !== id); },
  })});
  const c = {tables, as: 'admin-1', testSecrets: {...SECRETS}};
  c.auth = {me: async () => (c.as ? structuredClone(tables.User.find((u) => u.id === c.as)) : null)};
  c.asServiceRole = {entities};
  return c;
}

let c, fn;
const call = async (body, as) => {
  if (as !== undefined) c.as = as;
  const r = await fn(request(body));
  return {status: r.status, body: await r.json()};
};
const settings = (extra = {}) => ({name: 'Office TV', kind: 'window', company_ids: ['a'], layout: 'fleet', ...extra});
async function addDisplay(extra) { return (await call({action: 'save', settings: settings(extra)}, 'admin-1')).body.display; }
async function openWindow(id) { return (await call({action: 'window_open', display_id: id}, 'admin-1')).body.display_token; }
const feed = (token) => call({action: 'feed', display_token: token}, null);
const row = (id) => c.tables.OfficeDisplay.find((d) => d.id === id);

beforeEach(() => {
  vi.useFakeTimers({toFake: ['Date']});
  vi.setSystemTime(NOW);
  c = client();
  fn = load('officeDisplay', c).default;
});
afterEach(() => vi.useRealTimers());

describe('managing office displays', () => {
  it('is for administrators only', async () => {
    for (const action of ['list', 'save', 'window_open', 'pair_approve', 'camera_start', 'revoke']) {
      expect((await call({action, settings: settings(), display_id: 'x'}, 'staff-1')).status).toBe(403);
      expect((await call({action, settings: settings(), display_id: 'x'}, null)).status).toBe(401);
    }
    expect(c.tables.OfficeDisplay).toHaveLength(0);
  });

  it('checks settings against real companies and their buses', async () => {
    expect((await call({action: 'save', settings: settings({company_ids: ['nope']})}, 'admin-1')).status).toBe(400);
    expect((await call({action: 'save', settings: settings({name: '  '})}, 'admin-1')).status).toBe(400);
    const d = await addDisplay({name: '<b>Office</b> TV', company_ids: ['a', 'ghost'], vehicle_ids: ['bus-a', 'bus-b'], layout: 'weird', text_size: 'huge', rotate: true, rotate_layouts: ['fleet', 'cameras']});
    expect(d.name).toBe('bOffice/b TV');
    expect(d.company_ids).toEqual(['a']);
    expect(d.vehicle_ids).toEqual(['bus-a']); // bus-b belongs to another company
    expect(d.layout).toBe('fleet');
    expect(d.text_size).toBe('large');
    // Cameras never rotate in; one layout left is no rotation.
    expect(d.rotate).toBe(false);
    expect(d.show_guest_names).toBe(false);
  });

  it('never shows a credential to the settings page', async () => {
    const d = await addDisplay();
    const token = await openWindow(d.id);
    expect(token).toMatch(/^[a-f0-9]{64}$/);
    expect(row(d.id).credential_hash).not.toBe(token);
    expect(JSON.stringify(c.tables)).not.toContain(token);
    const list = await call({action: 'list'}, 'admin-1');
    expect(JSON.stringify(list.body)).not.toMatch(/credential_hash|display_token/);
    expect(JSON.stringify(list.body)).not.toContain(row(d.id).credential_hash);
    expect(list.body.displays[0].connected).toBe(true);
  });
});

describe('a display credential', () => {
  it('reads only its feed, never administrator actions', async () => {
    const d = await addDisplay();
    const token = await openWindow(d.id);
    for (const action of ['list', 'save', 'delete', 'revoke', 'camera_start', 'window_open']) {
      const r = await call({action, display_token: token, display_id: d.id, settings: settings({company_ids: ['a', 'b']})}, null);
      expect(r.status).toBe(401);
    }
    expect(row(d.id).company_ids).toEqual(['a']);
    expect(c.tables.OfficeDisplay).toHaveLength(1);
  });

  it('is refused when unknown, closed, revoked, expired, or its administrator lost access', async () => {
    const bad = await feed('f'.repeat(64));
    expect(bad.status).toBe(401);
    expect(bad.body.code).toBe('access_ended');

    const d = await addDisplay();
    let token = await openWindow(d.id);
    expect((await feed(token)).status).toBe(200);
    await call({action: 'window_close', display_id: d.id}, 'admin-1');
    expect((await feed(token)).status).toBe(401);

    token = await openWindow(d.id);
    const older = token;
    token = await openWindow(d.id); // opening again replaces the old window's access
    expect((await feed(older)).status).toBe(401);
    expect((await feed(token)).status).toBe(200);

    await call({action: 'revoke', display_id: d.id}, 'admin-1');
    expect((await feed(token)).status).toBe(401);

    token = await openWindow(d.id);
    vi.setSystemTime(NOW + 2 * 60 * MIN + 1000);
    expect((await feed(token)).status).toBe(401);
    expect(row(d.id).credential_hash).toBeNull();

    vi.setSystemTime(NOW);
    token = await openWindow(d.id);
    c.tables.User.find((u) => u.id === 'admin-1').role = 'staff';
    const demoted = await feed(token);
    expect(demoted.status).toBe(401);
    expect(demoted.body.code).toBe('access_ended');
    expect(row(d.id).credential_hash).toBeNull();
  });

  it('is renewed only by the administrator who opened it, and closed on sign-out', async () => {
    const d = await addDisplay();
    const token = await openWindow(d.id);
    vi.setSystemTime(NOW + 100 * MIN);
    expect((await call({action: 'window_renew', display_id: d.id}, 'admin-2')).status).toBe(409);
    expect((await call({action: 'window_renew', display_id: d.id}, 'admin-1')).status).toBe(200);
    vi.setSystemTime(NOW + 130 * MIN);
    expect((await feed(token)).status).toBe(200);
    await call({action: 'window_close_all'}, 'admin-1');
    expect((await feed(token)).status).toBe(401);
  });
});

describe('what a display is sent', () => {
  it('only its companies and buses, without credentials or personal details', async () => {
    const d = await addDisplay({layout: 'fleet', rotate: true, rotate_layouts: ['fleet', 'dispatch', 'maintenance']});
    const r = await feed(await openWindow(d.id));
    expect(r.status).toBe(200);
    const text = JSON.stringify(r.body);
    expect(r.body.vehicles.map((v) => v.id).sort()).toEqual(['bus-a', 'bus-a2']);
    for (const secret of ['1234', '9999', 'VIN123', 'SECRETPAIR1', 'JOIN12345678', '+14735550000', 'Office', 'dana@test.invalid',
      '+1473555', '1 Home Road', '2 Beach Road', 'gate code', 'sig.png', 'Guest Name', 'Pat Passenger', 'CARD-1', 'pk-1', 'p.jpg',
      'email:pat@test.invalid', 'called twice', 'Bus B', 'B Guest', 'B fault', 'Other Rider', 'Driver said', 'f.jpg', 'Mo"']) {
      expect(text, secret).not.toContain(secret);
    }
    expect(r.body.vehicles[0].driver_name).toBe('Dana Driver');
    expect(r.body.jobs.map((j) => j.id)).toEqual(['t1', 't2']);
    expect(r.body.jobs[0].client_name).toBe('Hotel Client');
    expect(r.body.jobs[0].guest_name).toBe('');
    expect(r.body.boardings).toHaveLength(1);
    expect(r.body.boardings[0].person).toMatch(/^[a-f0-9]{16}$/);
    expect(r.body.maintenance.faults.map((f) => f.id)).toEqual(['f1']);
    expect(r.body.maintenance.unavailable.map((v) => v.id)).toEqual(['bus-a2']);
    expect(r.body.companies).toEqual([{id: 'a', name: 'A Co', logo_url: 'https://cdn.test/a.png'}]);
  });

  it('states facts, not forecasts', async () => {
    const d = await addDisplay({layout: 'dispatch'});
    const r = await feed(await openWindow(d.id));
    const [late, later] = r.body.jobs;
    expect(late.past_time_not_started).toBe(true);
    expect(later.past_time_not_started).toBe(false);
    expect(JSON.stringify(r.body)).not.toMatch(/eta|delay_minutes|occupancy|predicted/i);
  });

  it('adds names only when an administrator turned them on', async () => {
    const d = await addDisplay({layout: 'dispatch', show_driver_names: false, show_client_names: false, show_guest_names: true});
    const r = await feed(await openWindow(d.id));
    const text = JSON.stringify(r.body);
    expect(text).not.toContain('Dana Driver');
    expect(text).not.toContain('Hotel Client');
    expect(r.body.jobs[0].guest_name).toBe('Guest Name');
    expect(r.body.exceptions[0].person).toBe('Pat Passenger');
    expect(text).not.toContain('+1473555');
  });

  it('limited to some buses, leaves the others out', async () => {
    const d = await addDisplay({vehicle_ids: ['bus-a2'], layout: 'maintenance'});
    const r = await feed(await openWindow(d.id));
    expect(r.body.vehicles.map((v) => v.id)).toEqual(['bus-a2']);
    expect(r.body.maintenance.faults).toEqual([]);
    expect(r.body.maintenance.due.map((m) => m.id)).toEqual(['m1']);
  });

  it('sends nothing to a blanked screen', async () => {
    const d = await addDisplay();
    const token = await openWindow(d.id);
    await call({action: 'blank', display_id: d.id, blanked: true}, 'admin-1');
    const r = await feed(token);
    expect(r.body.blanked).toBe(true);
    expect(r.body.vehicles).toBeUndefined();
    expect(JSON.stringify(r.body)).not.toContain('Bus A');
  });

  it('marks a part unavailable instead of failing the whole screen', async () => {
    const d = await addDisplay({layout: 'dispatch'});
    const token = await openWindow(d.id);
    const entities = c.asServiceRole.entities;
    c.asServiceRole = {entities: new Proxy({}, {get: (_, name) => name === 'Trip' ? {...entities.Trip, filter: async () => { throw new Error('down'); }} : entities[name]})};
    const r = await feed(token);
    expect(r.status).toBe(200);
    expect(r.body.unavailable).toContain('jobs');
    expect(r.body.jobs).toEqual([]);
  });
});

describe('pairing another screen', () => {
  const pair = () => call({action: 'pair_start'}, null);
  it('uses a short-lived single-use code an administrator approves', async () => {
    const d = await addDisplay({kind: 'paired', name: 'Lobby TV'});
    expect(d.kind).toBe('paired');
    const start = await pair();
    expect(start.body.code).toMatch(/^[A-HJ-NP-Z2-9]{6}$/);
    expect(JSON.stringify(c.tables.OfficeDisplayPairing)).not.toContain(start.body.code);
    expect(JSON.stringify(c.tables.OfficeDisplayPairing)).not.toContain(start.body.poll_secret);
    const poll = () => call({action: 'pair_poll', poll_secret: start.body.poll_secret}, null);
    expect((await poll()).body.status).toBe('waiting');

    expect((await call({action: 'pair_approve', display_id: d.id, code: 'ZZZZZZ'}, 'admin-1')).status).toBe(404);
    expect((await call({action: 'pair_approve', display_id: d.id, code: start.body.code}, 'staff-1')).status).toBe(403);
    const ok = await call({action: 'pair_approve', display_id: d.id, code: start.body.code.toLowerCase().split('').join(' ')}, 'admin-1');
    expect(ok.status).toBe(200);
    const got = await poll();
    expect(got.body.status).toBe('paired');
    expect(got.body.display_token).toMatch(/^[a-f0-9]{64}$/);
    expect((await feed(got.body.display_token)).status).toBe(200);
    // Single use: the code can't be approved again or collected twice.
    expect((await poll()).status).toBe(410);
    expect((await call({action: 'pair_approve', display_id: d.id, code: start.body.code}, 'admin-1')).status).toBe(404);
    // Revoked from Office displays: the screen loses access.
    await call({action: 'revoke', display_id: d.id}, 'admin-1');
    expect((await feed(got.body.display_token)).status).toBe(401);
  });

  it('refuses expired codes and a monitor-on-this-computer display', async () => {
    const w = await addDisplay();
    const p = await addDisplay({kind: 'paired'});
    const start = await pair();
    expect((await call({action: 'pair_approve', display_id: w.id, code: start.body.code}, 'admin-1')).status).toBe(409);
    vi.setSystemTime(NOW + 11 * MIN);
    expect((await call({action: 'pair_approve', display_id: p.id, code: start.body.code}, 'admin-1')).status).toBe(404);
    expect((await call({action: 'pair_poll', poll_secret: start.body.poll_secret}, null)).status).toBe(410);
    expect((await call({action: 'window_open', display_id: p.id}, 'admin-1')).status).toBe(409);
  });

  it('limits how many codes one network can ask for', async () => {
    for (let i = 0; i < 10; i++) expect((await pair()).status).toBe(200);
    expect((await pair()).status).toBe(429);
  });

  it('re-pairing replaces the old screen', async () => {
    const d = await addDisplay({kind: 'paired'});
    const tokens = [];
    for (let i = 0; i < 2; i++) {
      const s = await pair();
      await call({action: 'pair_approve', display_id: d.id, code: s.body.code}, 'admin-1');
      tokens.push((await call({action: 'pair_poll', poll_secret: s.body.poll_secret}, null)).body.display_token);
    }
    expect((await feed(tokens[0])).status).toBe(401);
    expect((await feed(tokens[1])).status).toBe(200);
  });
});

describe('cameras on a display', () => {
  async function cameraDisplay(extra) {
    const d = await addDisplay({layout: 'cameras', camera_device_ids: ['cam-a', 'board-a', 'cam-b'], ...extra});
    return {d, token: await openWindow(d.id)};
  }
  const sessions = () => c.tables.TabletSupportSession;

  it('starts only on an explicit administrator action, for chosen driver tablets in scope', async () => {
    const {d, token} = await cameraDisplay();
    expect(row(d.id).camera_device_ids).toEqual(['cam-a', 'board-a']); // cam-b is another company's
    expect(sessions()).toHaveLength(0);
    expect((await feed(token)).body.cameras).toEqual([]);
    const r = await call({action: 'camera_start', display_id: d.id}, 'admin-1');
    expect(r.status).toBe(200);
    expect(r.body.results.find((x) => x.device_id === 'board-a').ok).toBe(false);
    expect(sessions()).toHaveLength(1);
    const s = sessions()[0];
    expect(s).toMatchObject({device_id: 'cam-a', capability: 'camera_back', display_id: d.id, requested_by: 'admin-1', state: 'requested'});
    expect(Date.parse(s.expires_at) - NOW).toBe(10 * MIN);
    expect(c.tables.AuditLog.some((a) => /camera view requested/.test(a.summary))).toBe(true);
    // The display itself cannot start one.
    expect((await call({action: 'camera_start', display_token: token, display_id: d.id}, null)).status).toBe(401);
  });

  it('is watched only by its own display, once, and ends at ten minutes', async () => {
    const {d, token} = await cameraDisplay();
    const other = await cameraDisplay({name: 'Other'});
    await call({action: 'camera_start', display_id: d.id}, 'admin-1');
    const s = sessions()[0];
    expect((await call({action: 'camera_viewer', display_token: token, session_id: s.id}, null)).status).toBe(409); // tablet hasn't offered
    Object.assign(s, {offer_sdp: OFFER, state: 'connecting'});
    expect((await call({action: 'camera_viewer', display_token: other.token, session_id: s.id}, null)).status).toBe(410);
    const v = await call({action: 'camera_viewer', display_token: token, session_id: s.id}, null);
    expect(v.status).toBe(200);
    expect(v.body.sdp).toBe(OFFER);
    expect((await call({action: 'camera_answer', display_token: token, session_id: s.id, sdp: ANSWER}, null)).status).toBe(200);
    // A reload or reconnect never resumes it.
    expect((await call({action: 'camera_viewer', display_token: token, session_id: s.id}, null)).status).toBe(410);
    expect(s.state).toBe('ended');
    expect(s.offer_sdp).toBe('');
  });

  it('expires on the server even if the screen keeps asking', async () => {
    const {d, token} = await cameraDisplay();
    await call({action: 'camera_start', display_id: d.id}, 'admin-1');
    const s = sessions()[0];
    Object.assign(s, {offer_sdp: OFFER, state: 'connecting'});
    vi.setSystemTime(NOW + 10 * MIN + 1);
    const status = await call({action: 'camera_status', display_token: token}, null);
    expect(status.body.cameras[0].state).toBe('expired');
    expect((await call({action: 'camera_viewer', display_token: token, session_id: s.id}, null)).status).toBe(410);
    expect(s.state).toBe('expired');
  });

  it('stops when the screen is blanked, revoked, closed or its layout changes', async () => {
    for (const stop of [
      (d) => call({action: 'blank', display_id: d.id, blanked: true}, 'admin-1'),
      (d) => call({action: 'revoke', display_id: d.id}, 'admin-1'),
      (d) => call({action: 'window_close', display_id: d.id}, 'admin-1'),
      (d) => call({action: 'save', display_id: d.id, settings: settings({layout: 'fleet'})}, 'admin-1'),
      (d, token) => call({action: 'camera_end', display_token: token, reason: 'closed'}, null),
    ]) {
      const {d, token} = await cameraDisplay();
      await call({action: 'camera_start', display_id: d.id}, 'admin-1');
      const s = sessions().at(-1);
      expect(s.state).toBe('requested');
      await stop(d, token);
      expect(s.state).toBe('ended');
      expect(s.ended_at).toBeTruthy();
    }
  });

  it('ends when the tablet or the administrator who started it loses access', async () => {
    const {d, token} = await cameraDisplay();
    await call({action: 'camera_start', display_id: d.id}, 'admin-2');
    const s = sessions()[0];
    Object.assign(s, {offer_sdp: OFFER, state: 'connecting'});
    c.tables.User.find((u) => u.id === 'admin-2').role = 'staff';
    expect((await call({action: 'camera_viewer', display_token: token, session_id: s.id}, null)).status).toBe(410);
    expect(s.state).toBe('ended');
  });

  it('refuses a camera someone is already viewing', async () => {
    const {d} = await cameraDisplay();
    c.tables.TabletSupportSession.push({id: 'busy', device_id: 'cam-a', state: 'active', expires_at: at(5 * MIN)});
    c.tables.KioskDevice.find((k) => k.id === 'cam-a').support_request = {id: 'busy', expires_at: at(5 * MIN)};
    const r = await call({action: 'camera_start', display_id: d.id}, 'admin-1');
    expect(r.body.results.find((x) => x.device_id === 'cam-a')).toMatchObject({ok: false, error: 'Someone is already viewing this camera'});
  });
});

describe('request hygiene', () => {
  it('rejects unknown actions, bad JSON and oversized bodies', async () => {
    expect((await call({action: 'drop_tables'}, 'admin-1')).status).toBe(400);
    expect((await fn(new Request('https://isolated.test', {method: 'POST', body: '{'}))).status).toBe(400);
    expect((await fn(new Request('https://isolated.test', {method: 'POST', body: JSON.stringify({action: 'feed', pad: 'x'.repeat(90_000)})}))).status).toBe(413);
    expect((await fn(new Request('https://isolated.test', {method: 'GET'}))).status).toBe(405);
  });
  it('hashes stored secrets with sha-256', () => {
    expect(digest('x')).toHaveLength(64);
  });
});
