// Driver tablet map on a device WITHOUT WebGL (like budget tablets) vs a normal one.
import { chromium } from "@playwright/test";
import fs from "node:fs";
const base = process.argv[2] || "http://localhost:4173";
fs.mkdirSync("/tmp/shots", { recursive: true });

const vehicle = { id: "v1", name: "Bus 12", company_id: "c1", driver_name: "Marcus", driver_pin: "1111", current_lat: 12.1286, current_lng: -61.7483, status: "on_trip", route_id: "r1",
  trail: [{ lat: 12.1270, lng: -61.7500 }, { lat: 12.1280, lng: -61.7490 }, { lat: 12.1286, lng: -61.7483 }] };
const route = { id: "r1", name: "Town loop", stops: [{ name: "Market Square", lat: 12.1300, lng: -61.7450 }, { name: "Grand Anse", lat: 12.1200, lng: -61.7550 }] };

async function run(label, launchArgs) {
  const browser = await chromium.launch({ args: launchArgs });
  const ctx = await browser.newContext({ viewport: { width: 1180, height: 820 }, geolocation: { latitude: 12.1286, longitude: -61.7483 }, permissions: ["geolocation"] });
  await ctx.addInitScript(() => {
    localStorage.setItem("tt_driver_device_id", "dev1");
    localStorage.setItem("tt_driver_unlock_date", new Date().toISOString().slice(0, 10));
  });
  const beats = [];
  await ctx.route("**/api/**", async (r) => {
    const req = r.request(); const url = req.url();
    if (url.includes("public-settings")) return r.continue();
    if (url.includes("/functions/driverSession")) {
      const body = req.postDataJSON();
      if (body.action === "heartbeat") {
        beats.push(body);
        return r.fulfill({ json: { vehicle, driver_name: "Marcus", driver_pin: "1111", company_id: "c1", staff: [], route, broadcasts: [], check_ins: [], group_messages: [], trips: [], open_shift: null, inspection_templates: [], recent_inspections: [] } });
      }
      return r.fulfill({ json: { ok: true } });
    }
    if (url.includes("/entities/")) return r.fulfill({ json: [] });
    return r.fulfill({ json: {} });
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e).slice(0, 160)));
  const out = {};
  out.webgl2 = await page.evaluate(() => !!document.createElement("canvas").getContext("webgl2")).catch(() => "?");
  await page.goto(base + "/driver/track", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(6000);
  out.trackBasicLabel = await page.getByText("Basic map").first().isVisible().catch(() => false);
  out.trackTilesLoaded = await page.locator("img.leaflet-tile-loaded").count();
  out.trackMapboxCanvas = await page.locator("canvas.mapboxgl-canvas").count();
  await page.screenshot({ path: `/tmp/shots/lm_${label}_track.png` });
  await page.getByRole("tab", { name: /Navigate/ }).click();
  await page.waitForTimeout(5000);
  out.navBasicLabel = await page.getByText("Basic map").first().isVisible().catch(() => false);
  out.navTilesLoaded = await page.locator("img.leaflet-tile-loaded").count();
  out.navBusMarker = await page.locator(".leaflet-marker-icon").count();
  out.navMapboxCanvas = await page.locator("canvas.mapboxgl-canvas").count();
  await page.screenshot({ path: `/tmp/shots/lm_${label}_nav.png` });
  out.deviceInfoSent = (beats.find((b) => b.device_info)?.device_info || "none").slice(0, 60);
  out.errors = errors.length ? errors : "none";
  console.log(`--- ${label}`);
  for (const [k, v] of Object.entries(out)) console.log(k.padEnd(20), v);
  await browser.close();
}

await run("nowebgl", ["--disable-3d-apis", "--disable-webgl", "--disable-webgl2"]);
await run("normal", ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"]);
