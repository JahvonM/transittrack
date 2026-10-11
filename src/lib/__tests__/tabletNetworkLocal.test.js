import { describe, it, expect, vi } from 'vitest';
import { localCommandUrl, sendLocalCommand, localCommandId } from '../tabletNetwork';
import { wifiStatus, mobileStatus, hotspotStatus, freshNetworks, joinFor } from '../tabletNetworkStatus';

const KEY = 'k'.repeat(32);

describe('driver tablet Wi-Fi commands go only to the helper on the tablet', () => {
  it('builds keyed local addresses for each command', () => {
    expect(localCommandUrl('/wifi/power', { on: true }, KEY)).toBe(`http://127.0.0.1:8765/wifi/power?k=${KEY}&on=1`);
    expect(localCommandUrl('/wifi/power', { on: false }, KEY)).toContain('on=0');
    expect(localCommandUrl('/health', {}, KEY)).toBe(`http://127.0.0.1:8765/health?k=${KEY}`);
    const join = new URL(localCommandUrl('/wifi/join', { id: 'tab-12345678', ssid: 'Depot Wi-Fi', pass: 'p@ss word!' }, KEY));
    expect(join.origin).toBe('http://127.0.0.1:8765');
    expect(join.searchParams.get('ssid')).toBe('Depot Wi-Fi');
    expect(join.searchParams.get('pass')).toBe('p@ss word!');
  });
  it('refuses bad input and unknown routes', () => {
    expect(localCommandUrl('/wifi/join', { id: 'tab-12345678', ssid: 'x', pass: 'short' }, KEY)).toBeNull();
    expect(localCommandUrl('/wifi/join', { id: 'tab-12345678', ssid: 'a'.repeat(33), pass: '' }, KEY)).toBeNull();
    expect(localCommandUrl('/wifi/scan', { id: 'bad id' }, KEY)).toBeNull();
    expect(localCommandUrl('/hotspot', {}, KEY)).toBeNull();
    expect(localCommandUrl('/wifi/power', { on: true }, '')).toBeNull();
  });
  it('reports no helper, sent and unreachable', async () => {
    expect(await sendLocalCommand('/health', {}, { key: '' })).toBe('no-helper');
    const fetchImpl = vi.fn(async () => ({}));
    expect(await sendLocalCommand('/wifi/power', { on: true }, { key: KEY, fetchImpl })).toBe('sent');
    expect(fetchImpl).toHaveBeenCalledWith(expect.stringContaining('/wifi/power?'), { mode: 'no-cors', cache: 'no-store' });
    expect(await sendLocalCommand('/health', {}, { key: KEY, fetchImpl: async () => { throw new Error('down'); } })).toBe('unreachable');
  });
  it('makes ids the helper accepts', () => {
    expect(localCommandId()).toMatch(/^tab-[0-9a-f]{18}$/);
  });
});

describe('Internet status wording on the driver tablet', () => {
  it('describes Wi-Fi', () => {
    expect(wifiStatus({ wifi: { enabled: true, ssid: 'Depot', bars: 3 } })).toMatchObject({ enabled: true, text: 'Connected to Depot', bars: 3 });
    expect(wifiStatus({ wifi: { enabled: true, ssid: '' } }).text).toBe('On, not connected to a network');
    expect(wifiStatus({ wifi: { enabled: false } }).text).toBe('Off');
    expect(wifiStatus(null).text).toBe('Off');
  });
  it('describes mobile data', () => {
    expect(mobileStatus({ mobile: { sim: 'none' } }).text).toBe('No SIM card in this tablet');
    expect(mobileStatus({ mobile: { sim: 'ready', data: false } }).text).toMatch(/^Off\. Run Update/);
    expect(mobileStatus({ mobile: { sim: 'ready', data: true, connected: true, operator: 'Flow', type: 'LTE', bars: 2 } })).toMatchObject({ tone: 'ok', text: 'On · Flow · LTE', bars: 2 });
    expect(mobileStatus({ wifi: { ssid: 'Depot' }, mobile: { sim: 'ready', data: true, connected: false, operator: 'Flow' } }).text).toBe('On · Flow · standing by while Wi-Fi is used');
    expect(mobileStatus({ mobile: { sim: 'ready', data: true, connected: false } }).tone).toBe('warn');
    expect(mobileStatus({}).text).toBe('Not reported yet');
  });
  it('shows the hotspot and only fresh scans and this screen\'s join', () => {
    expect(hotspotStatus({ hotspot: 'On', hotspot_always: true })).toEqual({ text: 'On', always: true });
    expect(hotspotStatus({})).toBeNull();
    const since = Date.parse('2026-10-11T12:00:00Z');
    const h = { wifi: { scanned_at: '2026-10-11T12:00:05Z', networks: [{ ssid: 'A' }, { ssid: '' }, null], join: { id: 'tab-1', state: 'joining' } } };
    expect(freshNetworks(h, since)).toEqual([{ ssid: 'A' }]);
    expect(freshNetworks(h, since + 60_000)).toBeNull();
    expect(joinFor(h, 'tab-1')).toMatchObject({ state: 'joining' });
    expect(joinFor(h, 'tab-2')).toBeNull();
  });
});
