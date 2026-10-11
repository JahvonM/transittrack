import { describe, it, expect, vi, beforeEach } from 'vitest';

// The phone app (iPhone/Android) path: the native Bluetooth plugin.
const env = vi.hoisted(() => ({ native: true, plugin: true, platform: 'ios', ble: null }));
vi.mock('@capacitor/core', () => ({
  Capacitor: {
    isNativePlatform: () => env.native,
    isPluginAvailable: (name) => env.plugin && name === 'BluetoothLe',
    getPlatform: () => env.platform,
  },
}));
vi.mock('@capacitor-community/bluetooth-le', () => ({ get BleClient() { return env.ble; } }));

import { BLE_SERVICE, BLE_CODE, bluetoothBoardingSupported, sendBoardingCodeByBluetooth, sendByNativeBluetooth, bluetoothProblem, nativeBluetoothErrorName } from '../bluetoothBoarding';

function fakeBle({ enabled = true, enableWorks = false, pick, connect, write } = {}) {
  let on = enabled;
  const written = [];
  const ble = {
    initialize: vi.fn(async () => {}),
    isEnabled: vi.fn(async () => on),
    requestEnable: vi.fn(async () => { if (!enableWorks) throw new Error('requestEnable failed.'); on = true; }),
    requestDevice: vi.fn(async () => { if (pick) throw new Error(pick); return { deviceId: 'dev-1', name: 'Bus 12' }; }),
    connect: vi.fn(async () => { if (connect) throw new Error(connect); }),
    write: vi.fn(async (id, service, characteristic, view) => {
      if (write) throw new Error(write);
      expect(id).toBe('dev-1');
      expect(service).toBe(BLE_SERVICE);
      expect(characteristic).toBe(BLE_CODE);
      written.push(new TextDecoder().decode(new Uint8Array(view.buffer, view.byteOffset, view.byteLength)));
    }),
    disconnect: vi.fn(async () => {}),
  };
  return { ble, written };
}

beforeEach(() => { env.native = true; env.plugin = true; env.platform = 'ios'; env.ble = null; });

describe('phone app Bluetooth', () => {
  it('is offered in the phone app only when the installed app has the Bluetooth plugin', () => {
    expect(bluetoothBoardingSupported()).toBe(true);
    env.plugin = false;
    expect(bluetoothBoardingSupported()).toBe(false);
  });

  it('the Board by Bluetooth button uses the phone app plugin and sends the boarding code', async () => {
    const f = fakeBle();
    env.ble = f.ble;
    expect(await sendBoardingCodeByBluetooth('TOKEN123')).toEqual({ bus: 'Bus 12' });
    expect(f.ble.initialize).toHaveBeenCalledWith({ androidNeverForLocation: true });
    expect(f.ble.requestDevice).toHaveBeenCalledWith({ services: [BLE_SERVICE] });
    expect(f.ble.connect).toHaveBeenCalledWith('dev-1');
    expect(f.written).toEqual(['tt-code:TOKEN123']);
    expect(f.ble.disconnect).toHaveBeenCalledWith('dev-1');
  });

  it('iPhone with Bluetooth off: says how to turn it on and does not search', async () => {
    const f = fakeBle({ enabled: false });
    const error = await sendByNativeBluetooth('T', f.ble, 'ios').catch((e) => e);
    expect(error.name).toBe('BluetoothOff');
    expect(f.ble.requestEnable).not.toHaveBeenCalled();
    expect(f.ble.requestDevice).not.toHaveBeenCalled();
    expect(bluetoothProblem(error)).toMatch(/Bluetooth is off/);
  });

  it('Android with Bluetooth off: asks to turn it on, then carries on', async () => {
    const f = fakeBle({ enabled: false, enableWorks: true });
    expect(await sendByNativeBluetooth('T', f.ble, 'android')).toEqual({ bus: 'Bus 12' });
    expect(f.ble.requestEnable).toHaveBeenCalled();
    expect(f.written).toEqual(['tt-code:T']);
  });

  it('closing the bus list is "no bus chosen"', async () => {
    const f = fakeBle({ pick: 'requestDevice cancelled.' });
    const error = await sendByNativeBluetooth('T', f.ble, 'ios').catch((e) => e);
    expect(error.name).toBe('NotFoundError');
    expect(bluetoothProblem(error)).toMatch(/pick your bus/);
    expect(f.ble.disconnect).not.toHaveBeenCalled();
  });

  it('a failed connection or send says move closer, and always disconnects', async () => {
    for (const fail of [{ connect: 'Connection timeout' }, { write: 'Write failed' }]) {
      const f = fakeBle(fail);
      const error = await sendByNativeBluetooth('T', f.ble, 'ios').catch((e) => e);
      expect(error.name).toBe('NetworkError');
      expect(bluetoothProblem(error)).toMatch(/Move closer/);
      expect(f.ble.disconnect).toHaveBeenCalledWith('dev-1');
    }
  });

  it('Bluetooth permission refused: points to the phone settings', async () => {
    const f = fakeBle();
    f.ble.initialize = vi.fn(async () => { throw new Error('BLE permission denied'); });
    const error = await sendByNativeBluetooth('T', f.ble, 'ios').catch((e) => e);
    expect(error.name).toBe('NativeDenied');
    expect(bluetoothProblem(error)).toMatch(/Settings/);
  });

  it('names other plugin messages', () => {
    expect(nativeBluetoothErrorName('No device found.', 'pick')).toBe('NoBusFound');
    expect(nativeBluetoothErrorName('Permission denied.', 'start')).toBe('NativeDenied');
    expect(nativeBluetoothErrorName('BLE is not supported.', 'start')).toBe('Unsupported');
    expect(nativeBluetoothErrorName('weird', 'start')).toBe('Other');
    expect(bluetoothProblem({ name: 'NoBusFound' })).toMatch(/No bus tablet found/);
  });

  it('refuses to send without a code', async () => {
    await expect(sendByNativeBluetooth('', fakeBle().ble, 'ios')).rejects.toMatchObject({ name: 'NoCode' });
  });
});
