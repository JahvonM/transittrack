import { describe, it, expect, vi, afterEach } from 'vitest';
import { BLE_SERVICE, BLE_CODE, sendBoardingCodeByBluetooth, bluetoothProblem, takeBleCodes, markBleCodeSeen } from '../bluetoothBoarding';
import { localCommandUrl } from '../tabletNetwork';

function fakeBluetooth({ fail } = {}) {
  const written = [];
  const disconnect = vi.fn();
  const characteristic = { writeValueWithResponse: vi.fn(async (bytes) => { if (fail) throw Object.assign(new Error('x'), { name: fail }); written.push(new TextDecoder().decode(bytes)); }) };
  const service = { getCharacteristic: vi.fn(async (uuid) => { expect(uuid).toBe(BLE_CODE); return characteristic; }) };
  const server = { getPrimaryService: vi.fn(async (uuid) => { expect(uuid).toBe(BLE_SERVICE); return service; }) };
  const device = { name: 'Bus 12', gatt: { connect: vi.fn(async () => server), disconnect } };
  const bluetooth = { requestDevice: vi.fn(async () => device) };
  return { bluetooth, written, disconnect };
}

afterEach(() => { delete globalThis.window; });

describe('phone side', () => {
  it('asks only for TransitTrack boarding tablets and sends the QR code', async () => {
    const f = fakeBluetooth();
    expect(await sendBoardingCodeByBluetooth('TOKEN123', f.bluetooth)).toEqual({ bus: 'Bus 12' });
    expect(f.bluetooth.requestDevice).toHaveBeenCalledWith({ filters: [{ services: [BLE_SERVICE] }] });
    expect(f.written).toEqual(['tt-code:TOKEN123']);
    expect(f.disconnect).toHaveBeenCalled();
  });
  it('disconnects even when the write fails, and explains the problem', async () => {
    const f = fakeBluetooth({ fail: 'NetworkError' });
    const error = await sendBoardingCodeByBluetooth('TOKEN123', f.bluetooth).catch((e) => e);
    expect(f.disconnect).toHaveBeenCalled();
    expect(bluetoothProblem(error)).toMatch(/Move closer/);
    expect(bluetoothProblem({ name: 'NotFoundError' })).toMatch(/pick your bus/);
    expect(bluetoothProblem({ name: 'Other' })).toMatch(/QR/);
  });
  it('refuses to send without a code', async () => {
    await expect(sendBoardingCodeByBluetooth('', fakeBluetooth().bluetooth)).rejects.toMatchObject({ name: 'NoCode' });
  });
});

describe('tablet side', () => {
  it('takes recent codes once from the inbox the helper fills', () => {
    const now = Date.now();
    globalThis.window = { __ttBleInbox: [
      { id: 'ble-a', code: 'tt-code:A', at: now - 1000 },
      { id: 'ble-old', code: 'tt-code:OLD', at: now - 60000 },
      { id: 'ble-b', code: 'tt-code:B', at: now },
    ] };
    expect(takeBleCodes(now)).toEqual(['tt-code:A', 'tt-code:B']);
    expect(takeBleCodes(now)).toEqual([]);
    expect(markBleCodeSeen({ id: 'ble-a' })).toBe(false);
    expect(markBleCodeSeen({ id: 'ble-c' })).toBe(true);
  });
  it('tells the helper the bus name with the page key', () => {
    expect(localCommandUrl('/ble/name', { name: 'Bus 12' }, 'k'.repeat(32))).toBe(`http://127.0.0.1:8765/ble/name?k=${'k'.repeat(32)}&name=Bus+12`);
    expect(localCommandUrl('/ble/name', { name: '' }, 'k'.repeat(32))).toBeNull();
  });
});
