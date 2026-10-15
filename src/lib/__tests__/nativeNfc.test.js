import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
const f = vi.hoisted(() => ({ installed: true, state: { available: true, enabled: true, status: "Connected" }, listeners: {}, acks: [], ready: [], writes: [] }));
vi.mock("@capacitor/core", () => ({
  Capacitor: { isNativePlatform: () => true, getPlatform: () => "android", isPluginAvailable: () => f.installed },
  registerPlugin: () => ({
    getState: async () => f.state,
    addListener: async (name, cb) => { f.listeners[name] = cb; return { remove: async () => { delete f.listeners[name]; } }; },
    acknowledge: async result => { f.acks.push(result); return { acknowledged: true }; },
    setReady: async value => { f.ready.push(value); },
  })
}));
import { nativeTap, bridgeNativeNfc, acknowledgeNativeTap, setNativeNfcReady, nativeNfcState } from "../nativeNfc";
let target, stop;
let serial = 0;
const tap = () => ({ uid: "AABBCCDD", tapId: "native-" + String(++serial).padStart(20, "a"), at: Date.now() });
beforeEach(() => {
  Object.assign(f, { installed: true, state: { available: true, enabled: true, status: "Connected" }, listeners: {}, acks: [], ready: [] });
  target = new EventTarget(); target.localStorage = { setItem: vi.fn() };
  stop = null;
});
afterEach(() => { stop?.(); });
describe("native NFC handoff", () => {
  it("checks framing, age and tap IDs before delivering card data", () => {
    expect(nativeTap(tap()).uid).toBe("AABBCCDD");
    for (const bad of [null, {}, { ...tap(), uid: "not a card" }, { ...tap(), tapId: "x" },
      { ...tap(), at: Date.now() - 30000 }, { ...tap(), at: Date.now() + 3000 }]) expect(nativeTap(bad)).toBeNull();
  });
  it("installs the listener before allowing the native reader to start", async () => {
    stop = bridgeNativeNfc(target);
    await setNativeNfcReady(true);
    await vi.waitFor(() => expect(f.ready).toContainEqual({ ready: true }));
    expect(f.listeners.card).toBeTypeOf("function");
  });
  it("hands the tap to the page with its receipt and buffers in memory only", async () => {
    const received = vi.fn(); target.addEventListener("tt-badge", received);
    stop = bridgeNativeNfc(target);
    await vi.waitFor(() => expect(f.listeners.card).toBeTypeOf("function"));
    const raw = tap(); f.listeners.card(raw);
    expect(received).toHaveBeenCalledTimes(1);
    const e = received.mock.calls[0][0];
    expect(e.detail).toBe(raw.uid); expect(e.ttTapId).toBe(raw.tapId); expect(e.ttSource).toBe("native");
    expect(target.__ttBadgeInbox).toEqual([{ uid: raw.uid, id: raw.tapId, at: raw.at, source: "native" }]);
    for (const args of target.localStorage.setItem.mock.calls) expect(args.join(" ")).not.toContain(raw.uid);
  });
  it("re-acknowledges a delivery retry without looking the passenger up again", async () => {
    const received = vi.fn(); target.addEventListener("tt-badge", received);
    stop = bridgeNativeNfc(target);
    await vi.waitFor(() => expect(f.listeners.card).toBeTypeOf("function"));
    const raw = tap(); f.listeners.card(raw);
    await acknowledgeNativeTap(raw.tapId, true);
    f.listeners.card(raw);
    await vi.waitFor(() => expect(f.acks).toHaveLength(2));
    expect(received).toHaveBeenCalledTimes(1);
    expect(f.acks[1]).toEqual({ tapId: raw.tapId, accepted: true });
  });
  it("shares subscriptions across callers and ignores late events after cleanup", async () => {
    const first = bridgeNativeNfc(target), second = bridgeNativeNfc(target);
    stop = () => { first(); second(); };
    await vi.waitFor(() => expect(f.listeners.card).toBeTypeOf("function"));
    first(); expect(f.listeners.card).toBeTypeOf("function");
    const callback = f.listeners.card;
    second(); callback(tap());
    expect(target.__ttBadgeInbox).toBeUndefined();
    await vi.waitFor(() => expect(f.listeners.card).toBeUndefined());
  });
  it("older builds keep the existing reader path", async () => {
    f.installed = false; stop = bridgeNativeNfc(target);
    expect(await nativeNfcState()).toEqual({ available: false, enabled: false });
    expect(f.listeners.card).toBeUndefined();
  });
});
