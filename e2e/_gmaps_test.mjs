// Driver Drive screen: Google Maps button with the stops still ahead.
import { chromium } from "@playwright/test";
const base = process.argv[2] || "http://localhost:4173";
const vehicle = { id: "v1", name: "Bus 12", company_id: "c1", driver_pin: "1111", current_lat: 12.1286, current_lng: -61.7483, status: "idle", route_id: "r1",
  trail: [{ lat: 12.10, lng: -61.70, t: "2026-01-01T00:00:00Z" }, { lat: 12.1286, lng: -61.7483, t: "2026-01-01T00:01:00Z" }] };
const route = { id: "r1", name: "Town loop", stops: [{ name: "Market Square", lat: 12.1300, lng: -61.7450, order: 1 }, { name: "Mid", lat: 12.1250, lng: -61.7500, order: 2 }, { name: "Grand Anse", lat: 12.1200, lng: -61.7550, order: 3 }] };
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, geolocation: { latitude: 12.1286, longitude: -61.7483 }, permissions: ["geolocation"] });
await ctx.addInitScript(() => { localStorage.setItem("tt_driver_device_id", "dev1"); localStorage.setItem("tt_driver_unlock_date", new Date().toISOString().slice(0, 10)); localStorage.setItem("tt-map-engine", "basic"); });
await ctx.route("https://api.mapbox.com/**", (r) => r.abort());
await ctx.route("**/api/**", async (r) => {
  const url = r.request().url();
  if (url.includes("public-settings")) return r.continue();
  if (url.includes("/functions/driverSession")) {
    const body = r.request().postDataJSON();
    if (body.action === "heartbeat") return r.fulfill({ json: { vehicle, driver_name: "Marcus", driver_pin: "1111", company_id: "c1", staff: [], route, broadcasts: [], check_ins: [], group_messages: [], trips: [], open_shift: null, inspection_templates: [], recent_inspections: [] } });
    return r.fulfill({ json: { ok: true } });
  }
  if (url.includes("/entities/")) return r.fulfill({ json: [] });
  return r.fulfill({ json: {} });
});
const page = await ctx.newPage();
const errs = []; page.on("pageerror", (e) => errs.push(String(e).slice(0, 160)));
const ok = (l, v) => console.log((v ? "PASS " : "FAIL ") + l);
await page.goto(base + "/driver/track");
await page.waitForTimeout(7000);
const link = page.getByRole("link", { name: /Google Maps/ });
ok("Google Maps button visible", await link.isVisible().catch(() => false));
const href = await link.getAttribute("href").catch(() => "");
console.log(href);
ok("goes to last stop via the stops ahead", /destination=12\.12%2C-61\.755/.test(href) && /waypoints=/.test(href) && /dir_action=navigate/.test(href));
ok("old trail not drawn", (await page.locator(".leaflet-overlay-pane path").count()) <= 1);
ok("no page errors " + JSON.stringify(errs), errs.length === 0);
await page.screenshot({ path: "/tmp/shots/drive.png" });
await browser.close();
