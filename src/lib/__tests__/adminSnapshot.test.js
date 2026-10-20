import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// The admin overview's saved copy (src/lib/adminSnapshot.js): same admin only,
// up to a day old, overview lists only, no codes, wiped on sign-out.
vi.mock("tt-backend", () => ({ sessionSubject: () => "b44:admin-1" }));
const { loadAdminSnapshot, saveAdminSnapshot, clearAdminSnapshot, ADMIN_SNAPSHOT_KEY, ADMIN_SNAPSHOT_MAX_AGE_MS } = await import("../adminSnapshot.js");
const { forgetProfile } = await import("../savedSignIn.js");

function memoryStorage() {
  const data = new Map();
  return { getItem: (k) => (data.has(k) ? data.get(k) : null), setItem: (k, v) => data.set(k, String(v)), removeItem: (k) => data.delete(k) };
}
beforeEach(() => { const s = memoryStorage(); vi.stubGlobal("localStorage", s); vi.stubGlobal("window", { localStorage: s }); });
afterEach(() => vi.unstubAllGlobals());

const vehicles = [{ id: "v1", name: "Bus 12", status: "active" }];
const companies = [{ id: "c1", name: "Grand Hotel", access_code: "JOIN-4471", boss_phone: "4735551234" }];

describe("admin overview saved copy", () => {
  it("gives back the overview lists to the same admin", () => {
    saveAdminSnapshot("admin-1", { vehicles, companies }, 1000);
    const saved = loadAdminSnapshot("admin-1", 2000);
    expect(saved.data.vehicles).toEqual(vehicles);
    expect(saved.data.companies[0].name).toBe("Grand Hotel");
  });

  it("never shows one admin's copy to another account", () => {
    saveAdminSnapshot("admin-1", { vehicles }, 1000);
    expect(loadAdminSnapshot("admin-2", 2000)).toBeNull();
    expect(loadAdminSnapshot(undefined, 2000)).toBeNull();
  });

  it("waits for the server again after a day", () => {
    saveAdminSnapshot("admin-1", { vehicles }, 0);
    expect(loadAdminSnapshot("admin-1", ADMIN_SNAPSHOT_MAX_AGE_MS - 1)).not.toBeNull();
    expect(loadAdminSnapshot("admin-1", ADMIN_SNAPSHOT_MAX_AGE_MS + 1)).toBeNull();
  });

  it("never keeps join codes or other codes on the device", () => {
    saveAdminSnapshot("admin-1", { companies, kiosks: [{ id: "k1", pairing_code: "889900", device_token: "secret" }] }, 1000);
    const raw = localStorage.getItem(ADMIN_SNAPSHOT_KEY);
    expect(raw).not.toMatch(/JOIN-4471|889900|secret/);
    expect(loadAdminSnapshot("admin-1", 2000).data.companies[0]).not.toHaveProperty("access_code");
  });

  it("keeps only the overview's lists, and adds new lists to the copy", () => {
    saveAdminSnapshot("admin-1", { vehicles, users: [{ id: "u1", email: "x@y.z" }], invoices: [{ id: "i1" }] }, 1000);
    saveAdminSnapshot("admin-1", { trips: [{ id: "t1" }] }, 1500);
    const saved = loadAdminSnapshot("admin-1", 2000).data;
    expect(Object.keys(saved).sort()).toEqual(["trips", "vehicles"]);
  });

  it("drops a copy that's too big rather than filling the device", () => {
    saveAdminSnapshot("admin-1", { vehicles }, 1000);
    saveAdminSnapshot("admin-1", { checkIns: Array.from({ length: 20000 }, (_, i) => ({ id: "c" + i, staff_name: "Someone with a long name " + i, status: "boarded" })) }, 1500);
    expect(loadAdminSnapshot("admin-1", 2000)).toBeNull();
  });

  it("is wiped on sign-out, and survives broken or blocked storage", () => {
    saveAdminSnapshot("admin-1", { vehicles }, 1000);
    forgetProfile();
    expect(loadAdminSnapshot("admin-1", 2000)).toBeNull();
    localStorage.setItem(ADMIN_SNAPSHOT_KEY, "{not json");
    expect(loadAdminSnapshot("admin-1", 2000)).toBeNull();
    const blocked = { getItem() { throw new Error("blocked"); }, setItem() { throw new Error("blocked"); }, removeItem() { throw new Error("blocked"); } };
    vi.stubGlobal("localStorage", blocked);
    expect(() => saveAdminSnapshot("admin-1", { vehicles })).not.toThrow();
    expect(loadAdminSnapshot("admin-1")).toBeNull();
    expect(() => clearAdminSnapshot()).not.toThrow();
  });
});
