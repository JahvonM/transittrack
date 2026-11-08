import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import vm from "node:vm";

// After a release, a browser still on the old version asks for a file the
// server no longer has. Some hosts (app.mcsweenstransport.com) answer with
// the app's page, status 200, instead of "not found". The service worker must
// never save that or hand it to the app as a script, or a reload opens the
// same broken copy again ("Failed to fetch dynamically imported module").
const source = readFileSync(new URL("../../../public/sw.js", import.meta.url), "utf8");
const ORIGIN = "https://app.example";
const page = () => new Response("<!doctype html><html>app</html>", { status: 200, headers: { "Content-Type": "text/html" } });
const script = (body = "export default 1") => new Response(body, { status: 200, headers: { "Content-Type": "text/javascript" } });
const key = (r) => new URL(typeof r === "string" ? r : r.url, ORIGIN).pathname;

function memoryCaches() {
  const stores = new Map();
  const open = async (name) => {
    if (!stores.has(name)) {
      const m = new Map();
      stores.set(name, {
        m,
        put: async (r, res) => { m.set(key(r), res.clone()); },
        match: async (r) => m.get(key(r))?.clone() || undefined,
        delete: async (r) => m.delete(key(r)),
        keys: async () => [...m.keys()].map((p) => new Request(ORIGIN + p)),
      });
    }
    return stores.get(name);
  };
  const match = async (r, opts = {}) => {
    const names = opts.cacheName ? [opts.cacheName] : [...stores.keys()];
    for (const n of names) { const hit = await stores.get(n)?.match(r); if (hit) return hit; }
    return undefined;
  };
  return { open, match, keys: async () => [...stores.keys()], delete: async (n) => stores.delete(n), stores };
}

function load(fetchImpl) {
  const caches = memoryCaches();
  const listeners = {};
  const fetch = vi.fn(fetchImpl);
  const context = vm.createContext({
    Response, Request, URL, Set, Map, Date, setTimeout, clearTimeout, fetch, caches, importScripts() {},
    self: { addEventListener(name, handler) { listeners[name] = handler; }, location: { origin: ORIGIN }, skipWaiting() {}, clients: { claim: async () => {} } },
  });
  vm.runInContext(source, context);
  return { context, caches, listeners, fetch };
}

describe("app files after a release", () => {
  it("never hands the app's page to the app as a missing script, and never saves it", async () => {
    const { context, caches } = load(async () => page());
    const res = await context.cacheFirst(new Request(ORIGIN + "/assets/Admin-OLD.js"), "tt-assets-v1");
    expect(res.status).toBe(404);
    const assets = await caches.open("tt-assets-v1");
    expect(await assets.match("/assets/Admin-OLD.js")).toBeUndefined();
  });

  it("drops a page saved in place of a file by an older worker and fetches the real file", async () => {
    const { context, caches, fetch } = load(async () => script("real"));
    const assets = await caches.open("tt-assets-v1");
    await assets.put("/assets/Admin-NEW.js", page());
    const res = await context.cacheFirst(new Request(ORIGIN + "/assets/Admin-NEW.js"), "tt-assets-v1");
    expect(await res.text()).toBe("real");
    expect(fetch).toHaveBeenCalledTimes(1);
    await new Promise((r) => setTimeout(r, 0));
    expect(await (await assets.match("/assets/Admin-NEW.js")).text()).toBe("real");
  });

  it("still serves real saved files straight from the saved copy (offline)", async () => {
    const { context, caches, fetch } = load(async () => { throw new Error("offline"); });
    const assets = await caches.open("tt-assets-v1");
    await assets.put("/assets/index-A.js", script("saved"));
    const res = await context.cacheFirst(new Request(ORIGIN + "/assets/index-A.js"), "tt-assets-v1");
    expect(await res.text()).toBe("saved");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("doesn't switch to a new version whose files come back as the app's page", async () => {
    const html = '<html><script type="module" src="/assets/index-B.js"></script></html>';
    const { context, caches } = load(async (path) => {
      const p = String(path);
      if (p === "/offline-manifest.json") return new Response(JSON.stringify({ files: ["assets/index-B.js", "assets/Admin-B.js"] }), { headers: { "Content-Type": "application/json" } });
      if (p.endsWith("Admin-B.js")) return page(); // gone again, or not there yet
      return script();
    });
    const shell = await caches.open("tt-shell-v1");
    await shell.put("/", new Response("<html>version A</html>", { headers: { "Content-Type": "text/html" } }));
    expect(await context.stage(html)).toBe(false);
    expect(await (await shell.match("/")).text()).toBe("<html>version A</html>");
    expect(await (await caches.open("tt-assets-v1")).match("/assets/Admin-B.js")).toBeUndefined();
  });

  it("clears pages saved as files when the new worker takes over, and keeps real files", async () => {
    const { caches, listeners } = load(async () => script());
    const assets = await caches.open("tt-assets-v1");
    await assets.put("/assets/Admin-OLD.js", page());
    await assets.put("/assets/index-A.js", script());
    const waits = [];
    listeners.activate({ waitUntil: (p) => waits.push(p) });
    await Promise.all(waits);
    expect(await assets.match("/assets/Admin-OLD.js")).toBeUndefined();
    expect(await assets.match("/assets/index-A.js")).toBeDefined();
  });

  it("re-creates the reported crash: old saved page, file gone, reload", async () => {
    // Before: the saved copy is version A and Admin-A.js is missing from the
    // saved files; the server has moved on and answers with its page.
    const { context, caches } = load(async () => page());
    const shell = await caches.open("tt-shell-v1");
    await shell.put("/", new Response("<html>version A</html>", { headers: { "Content-Type": "text/html" } }));
    const first = await context.cacheFirst(new Request(ORIGIN + "/assets/Admin-A.js"), "tt-assets-v1");
    const second = await context.cacheFirst(new Request(ORIGIN + "/assets/Admin-A.js"), "tt-assets-v1");
    // Both tries say "not found" (so the app reloads into the newest version)
    // instead of the second one serving a saved page as the script.
    expect([first.status, second.status]).toEqual([404, 404]);
  });
});
