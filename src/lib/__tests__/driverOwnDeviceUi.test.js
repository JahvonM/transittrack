import { describe, it, expect, beforeEach, vi } from "vitest";

const store = new Map();
vi.stubGlobal("localStorage", {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
});

const { isOwnDevice, needsBusChoice, busChoiceMessage, forgetBusAccess } = await import("@/lib/driverOwnDevice");

const fail = (status, data) => ({ response: { status, data } });

describe("driver's own phone (store app)", () => {
  beforeEach(() => store.clear());

  it("asks for a bus only on a personal phone with none chosen", () => {
    expect(needsBusChoice({ personal: true, vehicle: null })).toBe(true);
    expect(needsBusChoice({ personal: true, vehicle: { id: "bus-1" } })).toBe(false);
    expect(needsBusChoice({ vehicle: null })).toBe(false);
    expect(needsBusChoice(null)).toBe(false);
    expect(isOwnDevice({ personal: "true" })).toBe(false);
  });

  it("explains a busy bus, an open shift and a lost pairing in plain words", () => {
    expect(busChoiceMessage(fail(409, { code: "BUS_BUSY", error: "Bus 3 already has a driver on shift" }))).toBe("Bus 3 already has a driver on shift");
    expect(busChoiceMessage(fail(409, { code: "SHIFT_OPEN" }))).toMatch(/End your shift/);
    expect(busChoiceMessage(fail(401, { code: "DEVICE_ACCESS_REQUIRED", error: "Invalid or unpaired driver device" }))).toMatch(/new code/);
  });

  it("never shows a server crash message", () => {
    expect(busChoiceMessage(fail(500, { error: "TypeError: x is undefined" }), "Try again.")).toBe("Try again.");
    expect(busChoiceMessage(new Error("Network Error"), "Try again.")).toBe("Try again.");
  });

  it("forgets the old bus's saved PIN and driver grant when the bus changes", () => {
    localStorage.setItem("tt_driver_grant_dev-1", "a".repeat(64));
    localStorage.setItem("tt_driver_grant_dev-2", "b".repeat(64));
    forgetBusAccess("dev-1");
    expect(localStorage.getItem("tt_driver_grant_dev-1")).toBeNull();
    expect(localStorage.getItem("tt_driver_grant_dev-2")).toBe("b".repeat(64));
  });
});

describe("what the app calls the device", () => {
  it("is a tablet from 600 points on the short side, otherwise a phone", async () => {
    const { ownDeviceNoun } = await import("@/lib/driverOwnDevice");
    expect(ownDeviceNoun({ width: 390, height: 844 })).toBe("phone");
    expect(ownDeviceNoun({ width: 844, height: 390 })).toBe("phone");
    expect(ownDeviceNoun({ width: 820, height: 1180 })).toBe("tablet");
    expect(ownDeviceNoun({ width: 1280, height: 800 })).toBe("tablet");
    expect(ownDeviceNoun(undefined)).toBe("phone");
  });
});
