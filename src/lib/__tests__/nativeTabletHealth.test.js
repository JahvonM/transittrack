import { describe, it, expect, vi, afterEach } from "vitest";
import { helperHealthPayload, helperLink } from "../helperHealth";
import { load, mock } from "../../../security-tests/helpers.js";
afterEach(() => vi.unstubAllGlobals());
describe("native health heartbeat", () => {
  it("uses existing heartbeat fields and excludes raw diagnostic/card data", () => {
    vi.stubGlobal("window", { __ttNativeHealth: { available: true, at: Date.now(), battery: 74, charging: true,
      batteryTemperature: 32.5, freeStorageMb: 6000, model: "Tablet X", androidVersion: "10", network: "wifi",
      usbDevices: 1, gps: { enabled: true, status: "Fix (9 sats)" },
      reader: { enabled: true, status: "Connected", lastTapAt: 1000 },
      events: [{ uid: "SECRET-CARD" }], password: "SECRET-PASSWORD" } });
    const h = helperHealthPayload().helper_health;
    expect(h).toMatchObject({ version: "native-0.2", native_version: "0.2", battery: 74, charging: true, reader: "Connected", gps: "Fix (9 sats)", battery_temperature: 32.5 });
    expect(JSON.stringify(h)).not.toContain("SECRET");
    expect(h.events).toBeUndefined();
    expect(helperLink()).toBe("ok");
  });
  it("keeps legacy network metadata and helper version while adding native health", () => {
    const at = Date.now();
    vi.stubGlobal("window", {
      __ttHelperHealth: { at, version: "1.14", wifi: { ssid: "Bus WiFi" }, reader: "Connected" },
      __ttNativeHealth: { available: true, at, battery: 88, reader: { enabled: false }, gps: { enabled: true, status: "Fix (8 sats)" } }
    });
    expect(helperHealthPayload().helper_health).toMatchObject({ version: "1.14", native_version: "0.2", wifi: { ssid: "Bus WiFi" }, reader: "Connected", battery: 88 });
  });
  it("does not resurrect stale native health or replace legacy reader with an off reader", () => {
    vi.stubGlobal("window", { __ttNativeHealth: { available: true, at: Date.now() - 301000, battery: 20 } });
    expect(helperHealthPayload()).toEqual({});
  });
});
describe("server health allowlist", () => {
  const clean = value => load("kioskHeartbeat", mock(null), ["cleanHelperHealth"]).cleanHelperHealth(value);
  it("stores bounded native health fields and drops arbitrary extra data", () => {
    const h = clean({ native_version: "0.2", battery_temperature: 34.2, free_storage_mb: 500.9, usb_devices: 4,
      model: "Tablet<test>", android_version: "10", network_type: "wifi", card_uid: "PRIVATE", pin: "1234", credentials: { token: "secret" }, events: ["private"] });
    expect(h).toMatchObject({ native_version: "0.2", battery_temperature: 34.2, free_storage_mb: 500, usb_devices: 4, model: "Tablettest", android_version: "10", network_type: "wifi" });
    expect(h.card_uid).toBeUndefined(); expect(h.pin).toBeUndefined(); expect(h.credentials).toBeUndefined(); expect(h.events).toBeUndefined();
  });
  it("refuses invalid measurements and unknown network values", () => {
    const h = clean({ battery_temperature: Infinity, free_storage_mb: -1, usb_devices: 999, network_type: "password=secret" });
    expect(h.battery_temperature).toBeUndefined(); expect(h.free_storage_mb).toBeUndefined();
    expect(h.network_type).toBeUndefined(); expect(h.usb_devices).toBe(64);
  });
});
