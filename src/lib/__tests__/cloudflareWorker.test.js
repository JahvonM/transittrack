import { describe, it, expect, vi, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import worker from "../../../cloudflare/worker.js";

// Cloudflare runs cloudflare/worker.js only for a request no file matches
// that isn't a page being opened. A missing build file must say "not found",
// never hand back the app's page as a script; everything else is passed on.
const asset = (body) => ({ fetch: async (req) => new Response(body, { status: 200, headers: { "Content-Type": "text/html", "X-From": "assets", "X-Url": req.url } }) });

describe("Cloudflare: missing files", () => {
  it("a missing build file answers 404, not the app's page", async () => {
    const res = await worker.fetch(new Request("https://app.example/assets/Admin-OLD.js"), { ASSETS: asset("<html>app</html>") });
    expect(res.status).toBe(404);
    expect(res.headers.get("content-type")).toContain("text/plain");
    expect(res.headers.get("cache-control")).toBe("no-store");
  });

  it("every other address is passed to the assets unchanged", async () => {
    for (const path of ["/admin", "/driver?code=X", "/images/missing.webp", "/assetsx/thing.js"]) {
      const res = await worker.fetch(new Request("https://app.example" + path), { ASSETS: asset("<html>app</html>") });
      expect(res.status).toBe(200);
      expect(res.headers.get("x-from")).toBe("assets");
      expect(res.headers.get("x-url")).toBe("https://app.example" + path);
    }
  });

  it("a missing build file keeps its 404 even with the tablet update route in place", async () => {
    const res = await worker.fetch(new Request("https://app.example/assets/native-releases/kiosk-build-13.apk"), { ASSETS: asset("") });
    expect(res.status).toBe(404);
  });

  it("is wired up: the worker, its assets binding, and the app's page for opened pages", () => {
    const config = readFileSync(new URL("../../../cloudflare/wrangler.jsonc", import.meta.url), "utf8");
    expect(config).toMatch(/"main":\s*"worker\.js"/);
    expect(config).toMatch(/"binding":\s*"ASSETS"/);
    expect(config).toMatch(/"not_found_handling":\s*"single-page-application"/);
    // Opened pages only skip the worker from this date on (Cloudflare's
    // assets_navigation_prefers_asset_serving); before it, every missing
    // address would run it.
    expect(config.match(/"compatibility_date":\s*"(\d{4}-\d{2}-\d{2})"/)[1] >= "2025-04-01").toBe(true);
  });
});

// Tablet app updates: /native-releases/kiosk-build-<n>.apk comes straight from
// the GitHub release of that name, as one direct 200 (the tablet refuses a
// redirect), and nothing else can be fetched through this address.
describe("Cloudflare: tablet app update files", () => {
  afterEach(() => vi.unstubAllGlobals());
  const github = (status = 200, body = "APK-BYTES") => {
    const calls = [];
    vi.stubGlobal("fetch", async (url, init) => {
      calls.push({ url, init });
      return new Response(status === 200 ? body : "missing", { status, headers: { "Content-Length": String(body.length), "Content-Type": "application/octet-stream" } });
    });
    return calls;
  };

  it("passes the release file through as one direct answer", async () => {
    const calls = github();
    const res = await worker.fetch(new Request("https://app.mcsweenstransport.com/native-releases/kiosk-build-13.apk"), { ASSETS: asset("") });
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("APK-BYTES");
    expect(res.headers.get("content-type")).toBe("application/vnd.android.package-archive");
    expect(res.headers.get("content-length")).toBe("9");
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("https://github.com/JahvonM/transittrack/releases/download/kiosk-build-13/kiosk-build-13.apk");
    expect(calls[0].init.redirect).toBe("follow");
  });

  it("answers a size check without the file", async () => {
    github();
    const res = await worker.fetch(new Request("https://app.mcsweenstransport.com/native-releases/kiosk-build-13.apk", { method: "HEAD" }), { ASSETS: asset("") });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-length")).toBe("9");
    expect(await res.text()).toBe("");
  });

  it("says not found for a missing release, and fetches nothing for any other name", async () => {
    let calls = github(404);
    expect((await worker.fetch(new Request("https://app.mcsweenstransport.com/native-releases/kiosk-build-99.apk"), { ASSETS: asset("") })).status).toBe(404);
    calls = github();
    for (const path of ["/native-releases/desktop-v1.0.0.apk", "/native-releases/kiosk-build-13.apk.exe", "/native-releases/kiosk-build-.apk",
      "/native-releases/kiosk-build-13/kiosk-build-13.apk", "/native-releases/KIOSK-build-13.apk", "/native-releases/"]) {
      const res = await worker.fetch(new Request("https://app.mcsweenstransport.com" + path), { ASSETS: asset("") });
      expect(res.status, path).toBe(404);
    }
    // "/native-releases/../x" is just "/x" by the time it arrives: the app's own files.
    const res = await worker.fetch(new Request("https://app.mcsweenstransport.com/native-releases/../kiosk-build-13.apk"), { ASSETS: asset("") });
    expect(res.headers.get("x-url")).toBe("https://app.mcsweenstransport.com/kiosk-build-13.apk");
    expect(calls).toHaveLength(0);
  });

  it("only reads release files", async () => {
    const calls = github();
    const res = await worker.fetch(new Request("https://app.mcsweenstransport.com/native-releases/kiosk-build-13.apk", { method: "POST", body: "x" }), { ASSETS: asset("") });
    expect(res.status).toBe(405);
    expect(calls).toHaveLength(0);
  });
});
