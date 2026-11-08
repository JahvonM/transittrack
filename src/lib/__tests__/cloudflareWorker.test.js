import { describe, it, expect } from "vitest";
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
