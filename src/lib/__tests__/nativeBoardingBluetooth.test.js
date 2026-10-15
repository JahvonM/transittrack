import { describe, it, expect, vi, beforeEach } from "vitest";
const env = vi.hoisted(() => ({ native: true, handlers: new Map(), removed: vi.fn(), plugin: {} }));
vi.mock("@capacitor/core", () => ({
  Capacitor: { isNativePlatform: () => env.native, getPlatform: () => "android", isPluginAvailable: () => env.native },
  registerPlugin: () => env.plugin,
}));
import { startBoardingBluetooth, validNativeBoardingCode, boardingBluetoothState, enableBoardingBluetooth } from "../nativeBoardingBluetooth";
beforeEach(() => {
  env.native = true; env.handlers.clear(); env.removed.mockClear();
  env.plugin.addListener = vi.fn(async (name, cb) => { env.handlers.set(name, cb); return { remove: env.removed }; });
  env.plugin.setReady = vi.fn(async () => ({}));
  env.plugin.getState = vi.fn(async () => ({ available: true, enabled: false }));
  env.plugin.setEnabled = vi.fn(async v => v);
});
const settle = async () => { await Promise.resolve(); await Promise.resolve(); };
const event = () => ({ id: "ble-native-12345678-12345678", code: "tt-code:PASS", at: Date.now() });
describe("native kiosk Bluetooth delivery", () => {
  it("does not open the receiver in web or non-helper builds", async () => {
    env.native = false;
    startBoardingBluetooth("Bus 1", vi.fn())();
    expect(env.plugin.addListener).not.toHaveBeenCalled();
    expect(await boardingBluetoothState()).toEqual({ available: false, enabled: false });
  });
  it("installs listener before declaring the page ready, and stops on unmount", async () => {
    const stop = startBoardingBluetooth("Bus 12", vi.fn());
    expect(env.plugin.setReady).not.toHaveBeenCalled();
    await settle();
    expect(env.plugin.setReady).toHaveBeenCalledWith({ ready: true, name: "Bus 12" });
    stop();
    expect(env.plugin.setReady).toHaveBeenLastCalledWith({ ready: false });
    expect(env.removed).toHaveBeenCalledOnce();
  });
  it("never enables a receiver after an early unmount", async () => {
    const stop = startBoardingBluetooth("Bus 12", vi.fn()); stop(); await settle();
    expect(env.plugin.setReady).not.toHaveBeenCalledWith(expect.objectContaining({ ready: true }));
    expect(env.removed).toHaveBeenCalledOnce();
  });
  it("delivers each native event once and ignores stale, future and malformed payloads", async () => {
    const onCode = vi.fn(), stop = startBoardingBluetooth("Bus", onCode); await settle();
    const receive = env.handlers.get("boardingCode"), e = event();
    receive(e); receive(e);
    receive({ ...e, id: "bad-id" });
    receive({ ...e, id: "ble-native-abcdefgh-abcdefgh", at: Date.now() - 30001 });
    receive({ ...e, at: Date.now() + 9000 });
    receive({ ...e, code: "tt-code:A\n" });
    expect(onCode).toHaveBeenCalledExactlyOnceWith("tt-code:PASS");
    stop(); receive(event()); expect(onCode).toHaveBeenCalledOnce();
  });
  it("caps code bytes and requires a payload", () => {
    const e = event();
    expect(validNativeBoardingCode({ ...e, code: "tt-code:" })).toBe(false);
    expect(validNativeBoardingCode({ ...e, code: "tt-code:" + "A".repeat(192) })).toBe(true);
    expect(validNativeBoardingCode({ ...e, code: "tt-code:" + "A".repeat(193) })).toBe(false);
    expect(validNativeBoardingCode({ ...e, code: "tt-code:é" })).toBe(false);
    expect(validNativeBoardingCode({ ...e, code: "tt-code:PASS\n" })).toBe(false);
    expect(validNativeBoardingCode({ ...e, id: e.id + "\n" })).toBe(false);
  });
  it("keeps opt-in as an explicit setting and reports unavailable state safely", async () => {
    expect(await enableBoardingBluetooth(true)).toEqual({ enabled: true });
    env.plugin.getState.mockRejectedValue(Error("missing"));
    expect(await boardingBluetoothState()).toEqual({ available: false, enabled: false });
  });
});
