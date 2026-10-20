import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { loadScreen, saveScreen, forgetScreens, SAVED_SCREEN_MAX_AGE_MS } from "../savedScreen.js";

// Home screens open with what they showed last time (src/lib/savedScreen.js):
// only for the same person, only for a day, and gone on sign-out.

function memoryStorage() {
  const data = new Map();
  return {
    getItem: (k) => (data.has(k) ? data.get(k) : null), setItem: (k, v) => data.set(k, String(v)), removeItem: (k) => data.delete(k),
    key: (i) => [...data.keys()][i] ?? null, get length() { return data.size; },
  };
}
beforeEach(() => vi.stubGlobal("window", { localStorage: memoryStorage() }));
afterEach(() => vi.unstubAllGlobals());

describe("saved screens", () => {
  it("open for the same person with what they showed", () => {
    expect(saveScreen("driver-phone", "u1", { today: { bus: "Bus 1" } }, 1000)).toBe(true);
    expect(loadScreen("driver-phone", "u1", 2000)).toEqual({ today: { bus: "Bus 1" } });
  });

  it("are never shown to someone else signed in on the device", () => {
    saveScreen("admin", "admin-1", { vehicles: [{ id: "v1" }] }, 1000);
    expect(loadScreen("admin", "admin-2", 2000)).toBeNull();
    expect(loadScreen("admin", undefined, 2000)).toBeNull();
    expect(saveScreen("admin", "", { x: 1 })).toBe(false);
  });

  it("last a day", () => {
    saveScreen("company", "u1", { company: { id: "c1" } }, 0);
    expect(loadScreen("company", "u1", SAVED_SCREEN_MAX_AGE_MS - 1)).not.toBeNull();
    expect(loadScreen("company", "u1", SAVED_SCREEN_MAX_AGE_MS + 1)).toBeNull();
  });

  it("are all cleared on sign-out, leaving other settings alone", () => {
    saveScreen("admin", "u1", { a: 1 });
    saveScreen("mechanic", "u1", { b: 2 });
    window.localStorage.setItem("tt_staff_pickup", "Stop 5");
    forgetScreens();
    expect(loadScreen("admin", "u1")).toBeNull();
    expect(loadScreen("mechanic", "u1")).toBeNull();
    expect(window.localStorage.getItem("tt_staff_pickup")).toBe("Stop 5");
  });

  it("skip anything too big rather than filling the phone, and survive blocked storage", () => {
    saveScreen("admin", "u1", { small: true });
    expect(saveScreen("admin", "u1", { rows: "x".repeat(2_000_000) })).toBe(false);
    expect(loadScreen("admin", "u1")).toBeNull(); // the old copy went too, never a stale mix
    vi.stubGlobal("window", { localStorage: { getItem() { throw new Error("blocked"); }, setItem() { throw new Error("blocked"); }, removeItem() { throw new Error("blocked"); } } });
    expect(saveScreen("admin", "u1", { a: 1 })).toBe(false);
    expect(loadScreen("admin", "u1")).toBeNull();
    expect(() => forgetScreens()).not.toThrow();
  });
});
