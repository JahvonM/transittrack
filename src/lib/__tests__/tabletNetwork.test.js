import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'node:fs';
import ts from 'typescript';
import { createHash } from 'node:crypto';
import { inlineShared } from '../../../security-tests/helpers.js';
import {
  newNetworkCommand, commandForTablet, checkInUpdates, networkCheckIn, cleanNetworkHealth,
  validSsid, validWifiPassword, COMMAND_TTL_MS,
} from '../../../base44/shared/tabletNetwork.ts';
import { handleNetworkCommand, networkAckPayload, networkCommandUrl, withoutNetworkCommand, resetNetworkState } from '../tabletNetwork';
import {
  helperAtLeast, commandProgress, latestJoin, scannedNetworks, wifiPasswordProblem, hotspotAlwaysOn, pendingCommand,
} from '../tabletNetworkAdmin';

const digest = (v) => createHash('sha256').update(v).digest('hex');
const TOKEN = 'a'.repeat(64);
const NOW = Date.parse('2026-10-10T12:00:00Z');
const boarding = { id: 'tablet', status: 'active', paired: true, kiosk_type: 'bus_boarding', company_id: 'company-a', vehicle_id: 'bus-a', pairing_code: 'PAIRCODE', label: 'Bus A boarding', created_date: '2026-10-08T00:00:00Z' };
const driver = { ...boarding, id: 'driver-tablet', kiosk_type: 'driver', label: 'Bus A driver' };
const credentialFor = (d) => ({ id: 'cred', device_id: d.id, token_hash: digest(TOKEN), company_id: d.company_id, vehicle_id: d.vehicle_id, kiosk_type: d.kiosk_type, pairing_code_hash: digest(d.pairing_code), expires_at: '2099-01-01T00:00:00Z' });
const joinCmd = (over = {}) => ({ id: 'cmd123456789', type: 'wifi_join', ssid: 'Depot WiFi', password: 'secret-pass-1', requested_at: new Date(NOW - 60000).toISOString(), ...over });

describe('network commands (server rules)', () => {
  it('builds commands only for the right kind of tablet, with valid names and passwords', () => {
    const scan = newNetworkCommand(boarding, { action: 'scan' }, new Date(NOW));
    expect(scan.command).toMatchObject({ type: 'wifi_scan' });
    expect(scan.command.id).toMatch(/^[a-f0-9]{24}$/);
    const join = newNetworkCommand(boarding, { action: 'join', ssid: 'Depot WiFi', password: 'secret-pass-1' }, new Date(NOW));
    expect(join.command).toMatchObject({ type: 'wifi_join', ssid: 'Depot WiFi', password: 'secret-pass-1' });
    expect(JSON.stringify(join.status)).not.toContain('secret-pass-1');
    expect(newNetworkCommand(boarding, { action: 'join', ssid: 'Cafe' }).command.password).toBe('');
    expect(newNetworkCommand(driver, { action: 'hotspot', always_on: true }).command).toMatchObject({ type: 'hotspot', always_on: true });
    for (const [device, input] of [
      [driver, { action: 'scan' }], [driver, { action: 'join', ssid: 'x', password: '12345678' }], [boarding, { action: 'hotspot', always_on: true }],
      [boarding, { action: 'join', ssid: '', password: '12345678' }], [boarding, { action: 'join', ssid: 'x'.repeat(33), password: '12345678' }],
      [boarding, { action: 'join', ssid: 'ok', password: 'short' }], [boarding, { action: 'join', ssid: 'ok', password: 'x'.repeat(64) }],
      [driver, { action: 'hotspot', always_on: 'yes' }], [boarding, { action: 'reboot' }],
    ]) expect(() => newNetworkCommand(device, input), JSON.stringify(input)).toThrow();
    expect(validSsid('bad\nname')).toBeNull();
    expect(validWifiPassword('naïve-pass-word')).toBeNull();
  });

  it('gives a Wi-Fi password only to a boarding tablet that proved its device key', () => {
    const d = { ...boarding, network_command: joinCmd() };
    expect(commandForTablet(d, true, NOW)).toEqual({ id: 'cmd123456789', type: 'wifi_join', ssid: 'Depot WiFi', password: 'secret-pass-1' });
    expect(commandForTablet(d, false, NOW)).toBeNull();
    expect(commandForTablet({ ...d, kiosk_type: 'driver' }, true, NOW)).toBeNull();
    expect(commandForTablet({ ...boarding, network_command: { id: 'cmd123456789', type: 'wifi_scan', requested_at: new Date(NOW).toISOString() } }, false, NOW)).toEqual({ id: 'cmd123456789', type: 'wifi_scan' });
    expect(commandForTablet({ ...driver, network_command: { id: 'cmd123456789', type: 'hotspot', always_on: true, requested_at: new Date(NOW).toISOString() } }, false, NOW)).toEqual({ id: 'cmd123456789', type: 'hotspot', always_on: true });
  });

  it('deletes the command once the tablet confirms it, or after 10 minutes', () => {
    const d = { ...boarding, network_command: joinCmd(), network_status: { id: 'cmd123456789', type: 'wifi_join', ssid: 'Depot WiFi', state: 'sent' } };
    expect(checkInUpdates(d, 'cmd123456789', NOW)).toMatchObject({ network_command: null, network_status: { state: 'delivered' } });
    expect(checkInUpdates(d, 'other-id-0000', NOW)).toEqual({});
    const old = { ...d, network_command: joinCmd({ requested_at: new Date(NOW - COMMAND_TTL_MS - 1000).toISOString() }) };
    expect(checkInUpdates(old, undefined, NOW)).toMatchObject({ network_command: null, network_status: { state: 'expired' } });
    expect(commandForTablet(old, true, NOW)).toBeNull();
    const first = networkCheckIn({ ...d, network_status: { ...d.network_status, state: 'waiting' } }, undefined, true, NOW);
    expect(first.command.password).toBe('secret-pass-1');
    expect(first.updates).toMatchObject({ network_status: { state: 'sent' } });
    const confirmed = networkCheckIn(d, 'cmd123456789', true, NOW);
    expect(confirmed.command).toBeNull();
    expect(confirmed.updates.network_command).toBeNull();
  });

  it('keeps only safe, length-limited Wi-Fi details from the helper report', () => {
    const out = cleanNetworkHealth({
      hotspot_always: true,
      wifi: {
        ssid: 'Depot<script>', bars: 9,
        networks: [{ ssid: 'A', bars: 3, lock: 'password' }, { ssid: '', bars: 2 }, { ssid: 'B', bars: -1, lock: 'weird' }, ...Array(40).fill({ ssid: 'C', bars: 1, lock: 'open' })],
        scanned_at: '2026-10-10T11:59:00Z',
        join: { id: 'cmd123456789', ssid: 'A', state: 'failed', message: 'x'.repeat(500), at: 'not a date' },
        password: 'should-not-pass',
      },
    });
    expect(out.hotspot_always).toBe(true);
    expect(out.wifi.ssid).toBe('Depotscript');
    expect(out.wifi.bars).toBe(4);
    expect(out.wifi.networks[0]).toEqual({ ssid: 'A', bars: 3, lock: 'password' });
    expect(out.wifi.networks[1]).toEqual({ ssid: 'B', bars: 0, lock: 'unsupported' });
    expect(out.wifi.networks.length).toBeLessThanOrEqual(25);
    expect(out.wifi.join.message.length).toBe(160);
    expect(out.wifi.join.at).toBeUndefined();
    expect(JSON.stringify(out)).not.toContain('should-not-pass');
  });
});

// The real backend functions, with shared code inlined and a fake database.
function handler(name, client) {
  const source = inlineShared(fs.readFileSync(new URL(`../../../base44/functions/${name}/entry.ts`, import.meta.url), 'utf8')).replace(/^import .*;\s*$/gm, '');
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const exports = {};
  new Function('exports', 'createClientFromRequest', 'secrets', js)(exports, () => client, {});
  return exports.default;
}
function fakeClient({ device, credentials = [], user = null }) {
  const writes = [];
  const entities = new Proxy({}, { get: (_, name) => ({
    get: async () => (name === 'KioskDevice' ? device : name === 'Vehicle' ? { id: 'bus-a', company_id: 'company-a', name: 'Bus A', capacity: 20 } : name === 'Company' ? { id: 'company-a', name: 'Company A' } : null),
    update: async (id, data) => { writes.push({ name, id, data }); return { id, ...data }; },
    create: async (data) => { writes.push({ name, create: true, data }); return { id: 'new', ...data }; },
    list: async () => [],
    filter: async () => (name === 'DeviceCredential' ? credentials : []),
  }) });
  return { client: { asServiceRole: { entities }, auth: { me: async () => user } }, writes };
}
const post = (body) => new Request('https://test.local', { method: 'POST', body: JSON.stringify(body) });

describe('network commands through the real backend functions', () => {
  it('kioskHeartbeat hands the password only to a key-verified tablet, then deletes it when confirmed', async () => {
    const device = { ...boarding, network_command: joinCmd({ requested_at: new Date().toISOString() }), network_status: { id: 'cmd123456789', type: 'wifi_join', state: 'waiting' } };
    // Older tablet without a device key: still checks in, but gets no password.
    let f = fakeClient({ device: { ...device, created_date: '2026-10-01T00:00:00Z' }, credentials: [] });
    let data = await (await handler('kioskHeartbeat', f.client)(post({ device_id: 'tablet' }))).json();
    expect(data.network_command).toBeNull();
    expect(JSON.stringify(data)).not.toContain('secret-pass-1');
    // Paired with a device key: gets it once.
    f = fakeClient({ device, credentials: [credentialFor(device)] });
    data = await (await handler('kioskHeartbeat', f.client)(post({ device_id: 'tablet', device_token: TOKEN }))).json();
    expect(data.network_command).toEqual({ id: 'cmd123456789', type: 'wifi_join', ssid: 'Depot WiFi', password: 'secret-pass-1' });
    expect(f.writes.find((w) => w.name === 'KioskDevice').data.network_status.state).toBe('sent');
    // The next check-in confirms; the command (and password) is deleted.
    f = fakeClient({ device, credentials: [credentialFor(device)] });
    data = await (await handler('kioskHeartbeat', f.client)(post({ device_id: 'tablet', device_token: TOKEN, network_ack: 'cmd123456789' }))).json();
    expect(data.network_command).toBeNull();
    const saved = f.writes.find((w) => w.name === 'KioskDevice').data;
    expect(saved.network_command).toBeNull();
    expect(saved.network_status.state).toBe('delivered');
  });

  it('driverSession hands over the hotspot switch and never Wi-Fi details', async () => {
    let f = fakeClient({ device: { ...driver, network_command: { id: 'cmd123456789', type: 'hotspot', always_on: true, requested_at: new Date().toISOString() } }, credentials: [credentialFor(driver)] });
    let data = await (await handler('driverSession', f.client)(post({ device_id: 'driver-tablet', device_token: TOKEN, action: 'heartbeat' }))).json();
    expect(data.network_command).toEqual({ id: 'cmd123456789', type: 'hotspot', always_on: true });
    f = fakeClient({ device: { ...driver, network_command: joinCmd({ requested_at: new Date().toISOString() }) }, credentials: [credentialFor(driver)] });
    data = await (await handler('driverSession', f.client)(post({ device_id: 'driver-tablet', device_token: TOKEN, action: 'heartbeat' }))).json();
    expect(data.network_command).toBeNull();
    expect(JSON.stringify(data)).not.toContain('secret-pass-1');
  });

  it('kioskNetwork is admin-only and checks the tablet before storing a command', async () => {
    const admin = { id: 'u1', role: 'admin', email: 'admin@test.invalid', full_name: 'Admin' };
    let f = fakeClient({ device: boarding, credentials: [credentialFor(boarding)], user: { ...admin, role: 'company' } });
    expect((await handler('kioskNetwork', f.client)(post({ device_id: 'tablet', action: 'scan' }))).status).toBe(403);
    f = fakeClient({ device: boarding, credentials: [], user: admin });
    const legacy = await handler('kioskNetwork', f.client)(post({ device_id: 'tablet', action: 'join', ssid: 'Depot WiFi', password: 'secret-pass-1' }));
    expect(legacy.status).toBe(409);
    expect(f.writes.some((w) => w.name === 'KioskDevice')).toBe(false);
    f = fakeClient({ device: boarding, credentials: [credentialFor(boarding)], user: admin });
    const ok = await handler('kioskNetwork', f.client)(post({ device_id: 'tablet', action: 'join', ssid: 'Depot WiFi', password: 'secret-pass-1' }));
    expect(ok.status).toBe(200);
    const body = await ok.json();
    expect(JSON.stringify(body)).not.toContain('secret-pass-1');
    const saved = f.writes.find((w) => w.name === 'KioskDevice').data;
    expect(saved.network_command).toMatchObject({ type: 'wifi_join', ssid: 'Depot WiFi', password: 'secret-pass-1' });
    expect(JSON.stringify(saved.network_status)).not.toContain('secret-pass-1');
    const audit = f.writes.find((w) => w.name === 'AuditLog');
    expect(audit.data.summary).toContain('Depot WiFi');
    expect(JSON.stringify(audit)).not.toContain('secret-pass-1');
    f = fakeClient({ device: driver, credentials: [], user: admin });
    expect((await handler('kioskNetwork', f.client)(post({ device_id: 'driver-tablet', action: 'scan' }))).status).toBe(400);
    expect((await handler('kioskNetwork', f.client)(post({ device_id: 'driver-tablet', action: 'hotspot', always_on: true }))).status).toBe(200);
  });

  it('entityAccess shows the command status but never the command (which can hold a password)', () => {
    const source = fs.readFileSync(new URL('../../../base44/functions/entityAccess/entry.ts', import.meta.url), 'utf8');
    expect(source).toContain("ENTITY_FIELDS.KioskDevice.push('network_status')");
    expect(source).not.toMatch(/network_command/);
  });
});

describe('tablet page: passing commands to the helper app', () => {
  beforeEach(() => resetNetworkState());
  const KEY = 'k'.repeat(32);

  it('builds helper addresses with the page key', () => {
    expect(networkCommandUrl({ id: 'cmd123456789', type: 'wifi_scan' }, KEY)).toBe(`http://127.0.0.1:8765/wifi/scan?id=cmd123456789&k=${KEY}`);
    const join = new URL(networkCommandUrl({ id: 'cmd123456789', type: 'wifi_join', ssid: 'Café & Co', password: 'p@ss word' }, KEY));
    expect(join.pathname).toBe('/wifi/join');
    expect(join.searchParams.get('ssid')).toBe('Café & Co');
    expect(join.searchParams.get('pass')).toBe('p@ss word');
    expect(networkCommandUrl({ id: 'cmd123456789', type: 'hotspot', always_on: false }, KEY)).toContain('/hotspot?id=cmd123456789&k=' + KEY + '&always=0');
    expect(networkCommandUrl({ id: 'cmd123456789', type: 'reboot' }, KEY)).toBeNull();
    expect(networkCommandUrl({ id: 'cmd123456789', type: 'wifi_scan' }, '')).toBeNull();
  });

  it('sends once, confirms on the next check-in, and stops confirming when the server is done', async () => {
    const calls = [];
    const fetchImpl = async (url) => { calls.push(url); return {}; };
    const cmd = { id: 'cmd123456789', type: 'hotspot', always_on: true };
    expect(networkAckPayload()).toEqual({});
    expect(await handleNetworkCommand(cmd, { fetchImpl, key: KEY })).toBe('sent');
    expect(networkAckPayload()).toEqual({ network_ack: 'cmd123456789' });
    expect(await handleNetworkCommand(cmd, { fetchImpl, key: KEY })).toBe('already');
    expect(calls).toHaveLength(1);
    expect(await handleNetworkCommand(null, { fetchImpl, key: KEY })).toBe('none');
    expect(networkAckPayload()).toEqual({});
  });

  it('does not confirm when there is no Helper 1.9 or it cannot be reached', async () => {
    const cmd = { id: 'cmd123456789', type: 'wifi_scan' };
    expect(await handleNetworkCommand(cmd, { fetchImpl: async () => ({}), key: '' })).toBe('no-helper');
    expect(await handleNetworkCommand(cmd, { fetchImpl: async () => { throw new Error('refused'); }, key: KEY })).toBe('unreachable');
    expect(networkAckPayload()).toEqual({});
  });

  it('never keeps the command in what the tablet saves', () => {
    expect(withoutNetworkCommand({ a: 1, network_command: { password: 'x' } })).toEqual({ a: 1 });
  });
});

describe('Admin display helpers', () => {
  it('compares helper versions', () => {
    expect(helperAtLeast('1.9')).toBe(true);
    expect(helperAtLeast('1.10')).toBe(true);
    expect(helperAtLeast('1.8')).toBe(false);
    expect(helperAtLeast(undefined)).toBe(false);
  });
  it('explains where a command is and shows only the latest Wi-Fi result', () => {
    const d = { network_status: { id: 'new', type: 'wifi_join', state: 'sent' }, helper_health: { wifi: { ssid: 'B', networks: [{ ssid: 'A', bars: 4 }, { ssid: 'B', bars: 1 }], join: { id: 'old', state: 'failed' } } } };
    expect(commandProgress(d)).toMatch(/Sent/);
    expect(pendingCommand(d)).toBeTruthy();
    expect(latestJoin(d)).toBeNull();
    expect(latestJoin({ ...d, helper_health: { wifi: { join: { id: 'new', state: 'connected' } } } }).state).toBe('connected');
    expect(scannedNetworks(d).map((n) => n.ssid)).toEqual(['B', 'A']);
  });
  it('checks Wi-Fi passwords before sending', () => {
    expect(wifiPasswordProblem('open', '')).toBe('');
    expect(wifiPasswordProblem('password', 'short')).toMatch(/at least 8/);
    expect(wifiPasswordProblem('password', 'long-enough')).toBe('');
    expect(wifiPasswordProblem('unsupported', 'long-enough')).toMatch(/company log-in/);
  });
  it('shows the hotspot switch as the change on its way, else what the tablet reports', () => {
    expect(hotspotAlwaysOn({ helper_health: { hotspot_always: true } })).toBe(true);
    expect(hotspotAlwaysOn({ helper_health: { hotspot_always: true }, network_status: { type: 'hotspot', always_on: false, state: 'waiting' } })).toBe(false);
  });
});
