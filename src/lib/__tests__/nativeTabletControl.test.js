import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
const env = vi.hoisted(() => ({ available: true, plugin: {} }));
vi.mock("@capacitor/core", () => ({
  Capacitor: { isNativePlatform: () => env.available, getPlatform: () => "android", isPluginAvailable: name => name === "TabletControl" && env.available },
  registerPlugin: () => env.plugin,
}));
vi.mock("../tabletUpdate", () => ({ idleFor: () => true }));
import { handleTabletControl, rebootWorkSafe } from "../nativeTabletControl";
const id = "a".repeat(32), token = "b".repeat(64);
beforeEach(() => {
  const values = new Map([["tt_device_token_tablet1", token]]);
  vi.stubGlobal("localStorage", { getItem: key => values.get(key) || null, setItem: (k,v) => values.set(k,v) });
  vi.stubGlobal("window", {});
  vi.stubGlobal("document", { visibilityState: "visible" });
  env.available = true;
  env.plugin.setWorkSafety = vi.fn(async () => {});
  env.plugin.getState = vi.fn(async () => ({ available: true, deviceOwner: true }));
  env.plugin.pendingReceipts = vi.fn(async () => ({ ids: [] }));
  env.plugin.execute = vi.fn(async () => ({ code: "DEVICE_OWNER_REQUIRED" }));
});
afterEach(() => vi.unstubAllGlobals());
describe("native privileged handoff", () => {
  it("sends only IDs/device key to native; never accepts executable JS action/role/URL", async () => {
    await handleTabletControl("tablet1", { id, action: "reboot", role: "admin", url: "http://evil", shell: "wipe" });
    expect(env.plugin.execute).toHaveBeenCalledExactlyOnceWith({ device_id: "tablet1", device_token: token, command_id: id });
    expect(window.__ttNativeControl.deviceOwner).toBe(true);
  });
  it("does nothing for web, invalid ID or missing secure pairing", async () => {
    env.available = false; await handleTabletControl("tablet1", { id });
    env.available = true; await handleTabletControl("legacy1", { id });
    await handleTabletControl("tablet1", { id: "wrong" });
    expect(env.plugin.execute).not.toHaveBeenCalled();
  });
  it("forwards persisted pending receipts through the same native method and coalesces parallel heartbeats", async () => {
    env.plugin.pendingReceipts.mockResolvedValue({ ids: [id, id, "invalid"] });
    await Promise.all(Array.from({ length: 20 }, () => handleTabletControl("tablet1", { id })));
    expect(env.plugin.execute).toHaveBeenCalledOnce();
  });
  it("unknown pages and unreadable storage fail closed for reboot", () => {
    expect(rebootWorkSafe("tablet1")).toBe(false);
    localStorage.setItem("tt_offline_jobs", "broken");
    expect(rebootWorkSafe("tablet1")).toBe(false);
  });
});
