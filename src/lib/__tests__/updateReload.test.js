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

describe("a screen's file that won't load", () => {
  const preload = (message) => { let prevented = false; return { payload: new Error(message), preventDefault: () => { prevented = true; }, get prevented() { return prevented; } }; };
  const handle = async (...args) => { vi.resetModules(); return (await import("@/lib/updateReload")).handlePreloadError(...args); };

  it("reloads first, whatever the file", async () => {
    const event = preload("Unable to preload CSS for /assets/SiteApp-x.css");
    expect(await handle(event, { reload: () => true })).toBe("reload");
    expect(event.prevented).toBe(true);
  });

  it("opens the screen without its styling when the style file still won't load", async () => {
    const event = preload("Unable to preload CSS for /assets/SiteApp-x.css");
    const missing = [];
    expect(await handle(event, { reload: () => false, onStyleMissing: (e) => missing.push(e.message) })).toBe("without-style");
    expect(event.prevented).toBe(true);
    expect(missing).toEqual(["Unable to preload CSS for /assets/SiteApp-x.css"]);
  });

  it("still shows the error when a script won't load", async () => {
    const event = preload("Failed to fetch dynamically imported module: /assets/Admin-x.js");
    expect(await handle(event, { reload: () => false, onStyleMissing: () => { throw new Error("not a style file"); } })).toBe("error");
    expect(event.prevented).toBe(false);
  });
});

describe("Microsoft's link checker", () => {
  it("is recognised by its exact message and nothing else", async () => {
    const { isLinkCheckerNoise } = await import("@/lib/reportError");
    expect(isLinkCheckerNoise("Object Not Found Matching Id:2, MethodName:update, ParamCount:4")).toBe(true);
    expect(isLinkCheckerNoise({ message: "Object Not Found Matching Id:12, MethodName:simulateEvent, ParamCount:1" })).toBe(true);
    expect(isLinkCheckerNoise("Object not found")).toBe(false);
    expect(isLinkCheckerNoise(new Error("Cannot read properties of undefined"))).toBe(false);
  });
});
