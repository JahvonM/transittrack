// Confirms the lazily loaded map actually mounts on /admin (mocked admin).
import { chromium } from "@playwright/test";
const base = process.argv[2] || "http://localhost:4173";
const browser = await chromium.launch({ args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 850 } });
await ctx.addInitScript(() => { localStorage.setItem("base44_access_token", "fake"); localStorage.setItem("token", "fake"); });
await ctx.route("**/api/**", (route) => {
  const url = route.request().url();
  if (url.includes("public-settings")) return route.continue();
  if (url.includes("/entities/User/me")) return route.fulfill({ json: { id: "u1", email: "qa@example.com", full_name: "QA", role: "admin" } });
  if (url.includes("/entities/")) return route.fulfill({ json: [] });
  return route.fulfill({ json: {} });
});
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(String(e).slice(0, 200)));
const t0 = Date.now();
await page.goto(base + "/admin", { waitUntil: "domcontentloaded" });
await page.waitForSelector("text=Overview", { timeout: 15000 }).catch(() => {});
console.log("page content visible after", Date.now() - t0, "ms");
await page.waitForSelector(".mapboxgl-canvas", { timeout: 20000 }).then(() => console.log("map canvas mounted after", Date.now() - t0, "ms")).catch(() => console.log("NO MAP CANVAS"));
const cssOk = await page.evaluate(() => getComputedStyle(document.querySelector(".mapboxgl-map") || document.body).overflow);
console.log("mapboxgl-map overflow (css applied if 'hidden'):", cssOk);
console.log("errors:", errors.length ? errors : "none");
await browser.close();
