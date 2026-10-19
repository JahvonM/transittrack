import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
const f = vi.hoisted(() => ({ native: true, installed: true, state: { available: true, enabled: false, status: "Off" }, listeners: {}, removed: [] }));
vi.mock("@capacitor/core", () => ({
  Capacitor: { isNativePlatform: () => f.native, getPlatform: () => "android", isPluginAvailable: () => f.installed },
  registerPlugin: () => ({
    getState: async () => f.state,
    addListener: async (name, cb) => { f.listeners[name] = cb; return { remove: async () => { f.removed.push(name); delete f.listeners[name]; } }; },
    setEnabled: async ({ enabled }) => ({ ...f.state, enabled }),
    rescan: async () => {}
  })
}));
import { watchDriverPosition, usbPosition, readUsbGpsState } from "../driverGps";
let browserSuccess, browserFailure, stop;
const watch = vi.fn((s, e) => { browserSuccess = s; browserFailure = e; return 17; });
const clear = vi.fn();
const fix = () => ({ timestamp: Date.now(), coords: { latitude: 12.05, longitude: -61.75, accuracy: 5, speed: 12, heading: 180 } });
beforeEach(() => {
  Object.assign(f, { native: true, installed: true, state: { available: true, enabled: false, status: "Off" }, listeners: {}, removed: [] });
  watch.mockClear(); clear.mockClear(); stop = null;
  vi.stubGlobal("navigator", { geolocation: { watchPosition: watch, clearWatch: clear } });
});
afterEach(() => { stop?.(); vi.unstubAllGlobals(); });
describe("driver GPS source switching", () => {
  it("keeps browser/helper GPS as the default", async () => {
    const success = vi.fn();
    stop = watchDriverPosition(success);
    await vi.waitFor(() => expect(watch).toHaveBeenCalledTimes(1));
    browserSuccess(fix());
    expect(success).toHaveBeenCalledTimes(1);
  });
  it("uses USB positions and never starts tablet GPS in USB mode", async () => {
    f.state = { available: true, enabled: true, status: "Looking for USB GPS" };
    const success = vi.fn();
    stop = watchDriverPosition(success);
    await vi.waitFor(() => expect(f.listeners.gpsPosition).toBeTypeOf("function"));
    await Promise.resolve();
    f.listeners.gpsPosition(fix());
    expect(success).toHaveBeenCalledTimes(1);
    expect(success.mock.calls[0][0].coords.speed).toBe(12);
    expect(watch).not.toHaveBeenCalled();
  });
  it("switches sources live and suppresses late callbacks from the previous source", async () => {
    const success = vi.fn(), failure = vi.fn();
    stop = watchDriverPosition(success, failure);
    await vi.waitFor(() => expect(watch).toHaveBeenCalledTimes(1));
    f.listeners.gpsState({ available: true, enabled: true, status: "Not plugged in" });
    expect(clear).toHaveBeenCalledWith(17);
    browserSuccess(fix()); browserFailure({ code: 1 });
    expect(success).not.toHaveBeenCalled();
    expect(failure).toHaveBeenLastCalledWith(expect.objectContaining({ source: "usb", message: "Not plugged in" }));
    f.listeners.gpsState({ available: true, enabled: false, status: "Off" });
    expect(watch).toHaveBeenCalledTimes(2);
    f.listeners.gpsPosition(fix());
    expect(success).not.toHaveBeenCalled();
    browserSuccess(fix());
    expect(success).toHaveBeenCalledTimes(1);
  });
  it("keeps installed older Android builds on the existing location path", async () => {
    f.installed = false;
    stop = watchDriverPosition(vi.fn());
    expect(watch).toHaveBeenCalledTimes(1);
    expect((await readUsbGpsState()).available).toBe(false);
  });
  it("cleans listeners even when unmounted during async setup", async () => {
    stop = watchDriverPosition(vi.fn());
    stop();
    await vi.waitFor(() => expect(f.removed).toContain("gpsState"));
    expect(watch).not.toHaveBeenCalled();
  });
  it("cleans both listeners and ignores events after stop", async () => {
    const success = vi.fn();
    stop = watchDriverPosition(success);
    await vi.waitFor(() => expect(watch).toHaveBeenCalledTimes(1));
    const late = f.listeners.gpsPosition;
    stop();
    late(fix());
    expect(success).not.toHaveBeenCalled();
    expect(f.removed.sort()).toEqual(["gpsPosition", "gpsState"]);
  });
});
describe("USB sample validation", () => {
  it("rejects malformed, stale, future and out-of-range positions", () => {
    for (const p of [null, {}, { ...fix(), timestamp: Date.now() - 11000 },
      { ...fix(), timestamp: Date.now() + 3000 }, { ...fix(), coords: { ...fix().coords, latitude: 91 } },
      { ...fix(), coords: { ...fix().coords, longitude: -181 } }, { ...fix(), coords: { ...fix().coords, accuracy: -1 } }]) expect(usbPosition(p)).toBeNull();
  });
  it("preserves speed units and treats missing speed/heading as unknown", () => {
    expect(usbPosition(fix()).coords.speed).toBe(12);
    expect(usbPosition({ ...fix(), coords: { ...fix().coords, speed: undefined, heading: undefined } }).coords).toMatchObject({ speed: null, heading: null });
  });
});

it("uses the native tablet GPS service as the sole source when USB mode is off",async()=>{
 f.state={available:true,enabled:false,backgroundManaged:true,status:"Fix (tablet background GPS)"};
 const success=vi.fn();stop=watchDriverPosition(success);
 await vi.waitFor(()=>expect(f.listeners.gpsPosition).toBeTypeOf("function"));
 await vi.waitFor(()=>expect(watch).not.toHaveBeenCalled());
 f.listeners.gpsPosition({...fix(),nativeManaged:true,nativePersisted:true});
 expect(success).toHaveBeenCalledWith(expect.objectContaining({nativeManaged:true,nativePersisted:true}));
});
