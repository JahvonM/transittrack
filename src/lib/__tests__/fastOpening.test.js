import { describe, it, expect, vi, afterEach } from "vitest";
import { homeFor } from "../roleHome.js";
import { savePassengerSnapshot, loadPassengerSnapshot, loadSavedCompany } from "../passengerSnapshot.js";

// Opening the app as one wait: where each account lands straight away, and
// what of the last passenger home is still used to start loading early.

function memoryStorage() {
  const data = new Map();
  return { getItem: (k) => (data.has(k) ? data.get(k) : null), setItem: (k, v) => data.set(k, String(v)), removeItem: (k) => data.delete(k) };
}
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe("opening the app", () => {
  it("sends each kind of account straight to its own screen, like the welcome page did", () => {
    expect(homeFor({ role: "admin" })).toBe("/admin");
    expect(homeFor({ role: "driver" })).toBe("/driver-phone");
    expect(homeFor({ role: "mechanic" })).toBe("/mechanic");
    expect(homeFor({ role: "company" })).toBe("/company");
    expect(homeFor({ role: "passenger" })).toBe("/staff");
    expect(homeFor({ role: "user" })).toBe("/staff");
    expect(homeFor({})).toBe("/staff");
    expect(homeFor({ role: "admin", access_role: "r1" })).toBe("/workspace");
    expect(homeFor(null)).toBe("/");
  });

  it("uses the last home for a day, and its company for a month, for the same person only", () => {
    vi.stubGlobal("localStorage", memoryStorage());
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-01T12:00:00Z"));
    savePassengerSnapshot("u1", { id: "c1", name: "Spice Isle Tours", phone: "473" }, { id: "b1", name: "Bus 1" }, { vehicles: [], routes: [], trips: [] });
    expect(loadPassengerSnapshot("u1")?.company.id).toBe("c1");
    expect(loadSavedCompany("u1")).toEqual({ id: "c1", name: "Spice Isle Tours", phone: "473" });
    expect(loadSavedCompany("u2")).toBeNull();
    vi.setSystemTime(new Date("2026-10-03T12:00:00Z")); // two days on
    expect(loadPassengerSnapshot("u1")).toBeNull();
    expect(loadSavedCompany("u1")?.id).toBe("c1");
    vi.setSystemTime(new Date("2026-11-05T12:00:00Z")); // over a month on
    expect(loadSavedCompany("u1")).toBeNull();
  });
});
