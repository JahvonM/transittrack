import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
const f = vi.hoisted(() => ({ native: true, installed: true, state: { available: true, enabled: false, status: "Off" }, listeners: {}, removed: [] }));
vi.mock("@capacitor/core", () => ({
  Capacitor: { isNativePlatform: () => f.native, getPlatform: () => "android", isPluginAvailable: () => f.installed },
  registerPlugin: () => ({
    getState: async () => f.state,
    addListener: async (name, cb) => { f.listeners[name] = cb; return { remove: async () => { f.removed.push(name); delete f.listeners[name]; } }; },
    setEnabled: async ({ enabled }) => { f.setCalls = [...(f.setCalls || []), enabled]; return { ...f.state, enabled }; },
    rescan: async () => {}
  })
}));
import { watchDriverPosition, usbPosition, readUsbGpsState, USB_BACKUP_AFTER_MS, applyAdminGpsChoice, adminGpsChoice } from "../driverGps";
let browserSuccess, browserFailure, stop;
const watch = vi.fn((s, e) => { browserSuccess = s; browserFailure = e; return 17; });
const clear = vi.fn();
const fix = () => ({ timestamp: Date.now(), coords: { latitude: 12.05, longitude: -61.75, accuracy: 5, speed: 12, heading: 180 } });
beforeEach(() => {
  Object.assign(f, { native: true, installed: true, state: { available: true, enabled: false, status: "Off" }, listeners: {}, removed: [] });
  watch.mockClear(); clear.mockClear(); stop = null;
  vi.stubGlobal("navigator", { geolocation: { watchPosition: watch, clearWatch: clear } });
});
afterEach(() => { stop?.(); vi.unstubAllGlobals(); vi.useRealTimers(); });
describe("driver GPS source switching", () => {
  it("keeps browser/helper GPS as the default", async () => {
    const success = vi.fn();
    stop = watchDriverPosition(success);
    await vi.waitFor(() => expect(watch).toHaveBeenCalledTimes(1));
    browserSuccess(fix());
    expect(success).toHaveBeenCalledTimes(1);
  });
  it("uses USB positions and leaves tablet GPS off while the module has a signal", async () => {
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
    // The tablet app's background GPS marks positions from the tablet's own GPS while the module is quiet.
    expect(usbPosition({ ...fix(), nativeManaged: true, backup: true })).toMatchObject({ backup: true, nativeManaged: true });
    expect(usbPosition(fix()).backup).toBeUndefined();
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

describe("tablet GPS backup when the USB GPS module goes quiet", () => {
  const settle = async () => { for (let i = 0; i < 6; i++) await Promise.resolve(); };
  const startUsb = async (success, failure = vi.fn()) => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    f.state = { available: true, enabled: true, status: "Fix (8 sats)" };
    stop = watchDriverPosition(success, failure);
    await vi.waitFor(() => expect(f.listeners.gpsPosition).toBeTypeOf("function"));
    await settle();
  };
  it("switches to the tablet's own GPS after 30 seconds without a USB position, and back when the module returns", async () => {
    const success = vi.fn(), failure = vi.fn();
    await startUsb(success, failure);
    f.listeners.gpsPosition(fix());
    expect(success).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(USB_BACKUP_AFTER_MS - 1);
    expect(watch).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(watch).toHaveBeenCalledTimes(1);
    browserSuccess(fix());
    expect(success).toHaveBeenCalledTimes(2);
    expect(success.mock.calls[1][0]).toMatchObject({ backup: true, coords: { latitude: 12.05 } });
    // The module's status changes while the tablet fills in: the backup keeps going.
    f.listeners.gpsState({ available: true, enabled: true, status: "Searching (2 sats)" });
    expect(clear).not.toHaveBeenCalled();
    expect(failure).not.toHaveBeenCalled();
    browserFailure({ code: 1 });
    expect(failure).not.toHaveBeenCalled();
    // The module has a position again: it takes over straight away.
    f.listeners.gpsPosition(fix());
    expect(clear).toHaveBeenCalledWith(17);
    expect(success).toHaveBeenCalledTimes(3);
    expect(success.mock.calls[2][0].backup).toBeUndefined();
    browserSuccess(fix());
    expect(success).toHaveBeenCalledTimes(3);
    // And the tablet fills in again if the module goes quiet again.
    vi.advanceTimersByTime(USB_BACKUP_AFTER_MS);
    expect(watch).toHaveBeenCalledTimes(2);
  });
  it("fills in when the module never gets a position, even while its status keeps changing", async () => {
    const success = vi.fn();
    await startUsb(success);
    for (let s = 0; s < 3; s++) {
      vi.advanceTimersByTime(10000);
      f.listeners.gpsState({ available: true, enabled: true, status: `Searching (${s} sats)` });
    }
    expect(watch).toHaveBeenCalledTimes(1);
  });
  it("stops the backup and its timer when the screen closes or USB GPS is switched off", async () => {
    const success = vi.fn();
    await startUsb(success);
    vi.advanceTimersByTime(USB_BACKUP_AFTER_MS);
    expect(watch).toHaveBeenCalledTimes(1);
    // Switched off: the tablet GPS is now the normal source, no longer a backup.
    f.listeners.gpsState({ available: true, enabled: false, status: "Off" });
    browserSuccess(fix());
    expect(success.mock.calls.at(-1)[0].backup).toBeUndefined();
    stop(); stop = null;
    expect(clear).toHaveBeenCalledWith(17);
    vi.advanceTimersByTime(USB_BACKUP_AFTER_MS * 2);
    expect(watch).toHaveBeenCalledTimes(1);
  });
});

describe("Admin's GPS choice for the tablet", () => {
  beforeEach(() => { f.setCalls = []; });
  it("switches the tablet to the module or to its own GPS, only when it differs", async () => {
    f.state = { available: true, enabled: false, status: "Off" };
    expect(await applyAdminGpsChoice("usb")).toMatchObject({ enabled: true });
    expect(f.setCalls).toEqual([true]);
    f.state = { available: true, enabled: true, status: "Fix (8 sats)" };
    await applyAdminGpsChoice("usb");
    expect(f.setCalls).toEqual([true]);
    await applyAdminGpsChoice("tablet");
    expect(f.setCalls).toEqual([true, false]);
  });
  it("leaves the tablet alone without a choice, or without the built-in GPS", async () => {
    f.state = { available: true, enabled: true, status: "Fix (8 sats)" };
    expect(await applyAdminGpsChoice(null)).toBeNull();
    expect(await applyAdminGpsChoice("satellite")).toBeNull();
    f.state = { available: false, enabled: false, status: "Unsupported" };
    expect(await applyAdminGpsChoice("usb")).toBeNull();
    f.installed = false;
    expect(await applyAdminGpsChoice("tablet")).toBeNull();
    f.installed = true;
    expect(f.setCalls).toEqual([]);
    expect(adminGpsChoice("tablet")).toBe("tablet");
  });
});
