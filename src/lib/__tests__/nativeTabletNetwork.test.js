import fs from "node:fs";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
const env = vi.hoisted(() => ({ available: true, plugin: {} }));
vi.mock("@capacitor/core", () => ({
  Capacitor: { isNativePlatform: () => env.available, getPlatform: () => "android", isPluginAvailable: name => env.available && name === "TabletNetwork" },
  registerPlugin: () => env.plugin,
}));
import { handleNetworkCommand, networkAckPayload, resetNetworkState } from "../tabletNetwork";
import { networkCheckIn, cleanNetworkHealth } from "../../../base44/shared/tabletNetwork.ts";
import { helperHealthPayload } from "../helperHealth";
import { nativeNetworkState, requestNetworkScanAccess, onNativeNetworkState } from "../nativeTabletNetwork";
const cmd = { id: "command-12345678", type: "wifi_join", ssid: "Depot", password: "PRIVATE-PASSWORD" };
const device = command => ({ kiosk_type: "bus_boarding", network_command: { ...command, requested_at: new Date().toISOString() }, network_status: { id: command.id, type: command.type, state: "sent" } });
beforeEach(() => {
  resetNetworkState(); env.available = true;
  vi.stubGlobal("window", { location: { pathname: "/kiosk" }, dispatchEvent: vi.fn() });
  env.plugin.getState = vi.fn(async () => ({ available: true, enabled: true }));
  env.plugin.setMode = vi.fn(async () => {});
  env.plugin.execute = vi.fn(async ({ command }) => ({ id: command.id, code: "MANAGED_WIFI_REQUIRED" }));
  env.plugin.requestScanAccess = vi.fn(async () => ({ available: true, enabled: true }));
  env.plugin.requestScanAccess = vi.fn(async () => ({ available: true }));
  env.plugin.addListener = vi.fn(async () => ({ remove: vi.fn() }));
});
afterEach(() => vi.unstubAllGlobals());
describe("integrated admin network handoff", () => {
  it("uses typed native calls and never puts a password in localhost URLs or acknowledgements", async () => {
    const fetchImpl = vi.fn();
    expect(await handleNetworkCommand(cmd, { fetchImpl, key: "k".repeat(32) })).toBe("sent");
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(env.plugin.execute).toHaveBeenCalledExactlyOnceWith({ command: cmd });
    expect(env.plugin.requestScanAccess).not.toHaveBeenCalled();
    expect(networkAckPayload()).toEqual({ network_ack: cmd.id, network_result: { id: cmd.id, code: "MANAGED_WIFI_REQUIRED" } });
    expect(JSON.stringify(networkAckPayload())).not.toContain("PRIVATE");
  });
  it("coalesces parallel same-ID commands and reuses the completion result", async () => {
    const results = await Promise.all(Array.from({ length: 30 }, () => handleNetworkCommand(cmd)));
    expect(results.every(x => x === "sent")).toBe(true);
    expect(env.plugin.execute).toHaveBeenCalledOnce();
    expect(await handleNetworkCommand(cmd)).toBe("already");
    expect(env.plugin.execute).toHaveBeenCalledOnce();
  });
  it("does not acknowledge an exception or a mismatched receipt", async () => {
    env.plugin.execute.mockRejectedValueOnce(Error("disconnected"));
    expect(await handleNetworkCommand(cmd)).toBe("unreachable"); expect(networkAckPayload()).toEqual({});
    env.plugin.execute.mockResolvedValue({ id: "other-command-123", code: "WIFI_JOIN_CONNECTED" });
    expect(await handleNetworkCommand(cmd)).toBe("unreachable"); expect(networkAckPayload()).toEqual({});
  });
  it("preserves the existing helper path when integrated controls are off", async () => {
    env.plugin.getState.mockResolvedValue({ available: true, enabled: false });
    const fetchImpl = vi.fn(async () => ({}));
    expect(await handleNetworkCommand(cmd, { fetchImpl, key: "k".repeat(32) })).toBe("sent");
    expect(fetchImpl).toHaveBeenCalledOnce(); expect(env.plugin.execute).not.toHaveBeenCalled();
    expect(networkAckPayload()).toEqual({ network_ack: cmd.id });
  });
  it("stops confirming after the server clears the command", async () => {
    await handleNetworkCommand(cmd); await handleNetworkCommand(null);
    expect(networkAckPayload()).toEqual({});
  });
});
describe("server native completion validation", () => {
  it("removes credentials for a blocked action and stores only fixed server wording", () => {
    const { updates, command } = networkCheckIn(device(cmd), cmd.id, true, Date.now(),
      { id: cmd.id, code: "MANAGED_WIFI_REQUIRED", state: "applied", message: "PRIVATE-PASSWORD" });
    expect(command).toBeNull(); expect(updates.network_command).toBeNull();
    expect(updates.network_status.state).toBe("blocked");
    expect(updates.network_status.result_code).toBe("MANAGED_WIFI_REQUIRED");
    expect(JSON.stringify(updates)).not.toContain("PRIVATE");
  });
  it("records success only for a matching action, ID and fixed result code", () => {
    const apply = result => networkCheckIn(device(cmd), cmd.id, true, Date.now(), result).updates.network_status;
    expect(apply({ id: cmd.id, code: "WIFI_JOIN_CONNECTED" }).state).toBe("applied");
    for (const r of [{ id: "wrong-123456", code: "WIFI_JOIN_CONNECTED" }, { id: cmd.id, code: "HOTSPOT_ON" }, { id: cmd.id, code: "__proto__" }, { id: cmd.id, code: "PRIVATE-PASSWORD" }])
      expect(apply(r).state).toBe("delivered");
  });
  it("cannot claim hotspot activation for a policy-off command", () => {
    const c = { id: cmd.id, type: "hotspot", always_on: false };
    const status = networkCheckIn({ ...device(c), kiosk_type: "driver" }, c.id, true, Date.now(), { id: c.id, code: "HOTSPOT_ON" }).updates.network_status;
    expect(status.state).toBe("delivered");
  });
  it("requires the matching acknowledgement before consuming any result", () => {
    expect(networkCheckIn(device(cmd), "wrong-123456", true, Date.now(), { id: cmd.id, code: "WIFI_JOIN_CONNECTED" }).updates.network_command).toBeUndefined();
  });
  it("allows only Boolean native capability metadata", () => {
    expect(cleanNetworkHealth({ network_native: true, network_available: true, password: "PRIVATE" })).toEqual({ network_native: true, network_available: true });
    expect(cleanNetworkHealth({ network_native: "true", network_available: "true" })).toEqual({});
  });
});
describe("native network health and explicit permissions", () => {
  it("strips credentials from the network heartbeat", () => {
    window.__ttNativeNetwork = { available: true, enabled: true, at: Date.now(), hotspot: "Off", wifi: {
      ssid: "Depot", password: "PRIVATE", networks: [{ ssid: "Depot", bars: 4, lock: "password", password: "PRIVATE" }],
      join: { id: cmd.id, state: "connected", password: "PRIVATE" },
    } };
    const payload = helperHealthPayload();
    expect(payload.helper_health.network_native).toBe(true);
    expect(JSON.stringify(payload)).not.toContain("PRIVATE");
  });
  it("prefers a fresh disabled state over an older enabled health sample", () => {
    window.__ttNativeHealth = { available: true, at: Date.now(), networkControl: { available: true, enabled: true } };
    window.__ttNativeNetwork = { available: true, enabled: false, at: Date.now() };
    expect(helperHealthPayload().helper_health).toMatchObject({ network_available: true, network_native: false });
  });
  it("permission prompts only happen through an explicit settings action", async () => {
    await nativeNetworkState();
    expect(env.plugin.requestScanAccess).not.toHaveBeenCalled();
    await requestNetworkScanAccess(); expect(env.plugin.requestScanAccess).toHaveBeenCalledOnce();
  });
  it("handles absent plugins and listener cleanup", async () => {
    env.available = false; expect(await nativeNetworkState()).toEqual({ available: false, enabled: false });
    env.available = true;
    const remove = vi.fn(); env.plugin.addListener.mockResolvedValue({ remove });
    const stop = onNativeNetworkState(vi.fn()); stop(); await Promise.resolve();
    expect(remove).toHaveBeenCalledOnce();
  });
});


describe("native transport log privacy", () => {
  it("disables argument-logging in both source and synced Android config", () => {
    for (const path of ["../../../capacitor.config.json", "../../../android/app/src/main/assets/capacitor.config.json"]) {
      const config = JSON.parse(fs.readFileSync(new URL(path, import.meta.url), "utf8"));
      expect(config.android.loggingBehavior).toBe("none");
    }
  });
});
