import { describe, it, expect, vi } from "vitest";

const memory = () => { const m = new Map(); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v) }; };

// Each test loads a fresh copy, so one test's reload doesn't leak into the next.
const fresh = async () => { vi.resetModules(); return (await import("@/lib/updateReload")).reloadForUpdate; };

describe("reloading into a newly published version", () => {
  it("reloads once when a screen's file is missing", async () => {
    const reloadFor = await fresh();
    let reloads = 0;
    expect(reloadFor({ now: 1000, storage: memory(), online: true, reload: () => reloads++ })).toBe(true);
    expect(reloads).toBe(1);
  });

  it("doesn't reload again within a minute, so it can never loop", async () => {
    const storage = memory();
    let reloads = 0;
    expect((await fresh())({ now: 1000, storage, online: true, reload: () => reloads++ })).toBe(true);
    expect((await fresh())({ now: 30_000, storage, online: true, reload: () => reloads++ })).toBe(false);
    expect((await fresh())({ now: 70_000, storage, online: true, reload: () => reloads++ })).toBe(true);
    expect(reloads).toBe(2);
  });

  it("leaves things alone when offline or when it can't remember trying", async () => {
    let reloads = 0;
    expect((await fresh())({ now: 1000, storage: memory(), online: false, reload: () => reloads++ })).toBe(false);
    const broken = { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("blocked"); } };
    expect((await fresh())({ now: 1000, storage: broken, online: true, reload: () => reloads++ })).toBe(false);
    expect(reloads).toBe(0);
  });
});
