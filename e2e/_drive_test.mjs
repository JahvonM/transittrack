// Driver Drive screen: one screen, no page scroll, at tablet + phone sizes.
import { chromium } from "@playwright/test";
import fs from "node:fs";
const base = process.argv[2] || "http://localhost:4173";
fs.mkdirSync("/tmp/shots", { recursive: true });

const vehicle = { id: "v1", name: "Bus 12", company_id: "c1", company_name: "Island Transit Co.", driver_name: "Marcus", driver_pin: "1111", capacity: 30, current_lat: 12.1286, current_lng: -61.7483, status: "idle", route_id: "r1", plate_number: "PE 4512",
  trail: [{ lat: 12.1270, lng: -61.7500 }, { lat: 12.1286, lng: -61.7483 }] };
const route = { id: "r1", name: "Town loop", stops: [{ name: "Market Square", lat: 12.1300, lng: -61.7450, order: 1 }, { name: "Grand Anse", lat: 12.1200, lng: -61.7550, order: 2 }] };
const names = ["Ana Joseph", "Kevin Paul", "Maria Charles", "Dion Thomas", "Lisa Noel", "Ryan Baptiste", "Tessa Mark"];
const staff = names.map((n, i) => ({ id: "s" + i, full_name: n, email: "s" + i + "@x.com", home_lat: 12.12 + i * 0.003, home_lng: -61.745 - i * 0.002 }));
const trips = [0, 1, 2].map((i) => ({ id: "t" + i, status: "scheduled", scheduled_time: new Date(Date.now() + (i + 1) * 3600e3).toISOString(), pickup_name: ["Market Square", "St George's", "Airport"][i], dropoff_name: "Grand Anse", passenger_name: "Visitor group" }));
const templates = [{ id: "t1", name: "Driver pre-trip walk-around", driver_trigger: "start_of_day", driver_days: [], driver_required: true, sections: [{ section_name: "A", items: [{ item_name: "Tyres" }] }] }];

const sizes = process.env.ONE ? [["tablet_landscape", 1280, 800]] : [["tablet_landscape", 1280, 800], ["tablet_landscape_browserbars", 1280, 720], ["tablet_portrait", 800, 1280], ["tablet_portrait_browserbars", 800, 1200]];
const browser = await chromium.launch({ args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
for (const [label, w, h] of sizes) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, geolocation: { latitude: 12.1286, longitude: -61.7483 }, permissions: ["geolocation"] });
  await ctx.addInitScript(() => {
    localStorage.setItem("tt_driver_device_id", "dev1");
    localStorage.setItem("tt_driver_unlock_date", new Date().toISOString().slice(0, 10));
  });
  const calls = [];
  await ctx.route("**/api/**", async (r) => {
    const req = r.request(); const url = req.url();
    if (url.includes("public-settings")) return r.continue();
    if (url.includes("/functions/driverSession")) {
      const body = req.postDataJSON(); calls.push(body.action);
      if (body.action === "heartbeat") return r.fulfill({ json: { vehicle, driver_name: "Marcus", driver_pin: "1111", company_id: "c1", staff, route, broadcasts: [], check_ins: [], group_messages: [], trips, open_shift: null, inspection_templates: templates, recent_inspections: [] } });
      return r.fulfill({ json: { ok: true } });
    }
    if (url.includes("/entities/")) return r.fulfill({ json: [] });
    return r.fulfill({ json: {} });
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e).slice(0, 160)));
  await page.goto(base + "/driver/track", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(6500);
  const vis = async (loc) => { const b = await loc.first().boundingBox().catch(() => null); return !!b && b.y >= 0 && b.y + b.height <= h + 1 && b.height > 0; };
  const out = {};
  out.pageScrolls = await page.evaluate(() => document.documentElement.scrollHeight > window.innerHeight + 1);
  out.panelScrolls = await page.evaluate(() => [...document.querySelectorAll('aside *')].some((el) => { const cs = getComputedStyle(el); return /(auto|scroll)/.test(cs.overflowY) && el.scrollHeight > el.clientHeight + 1; }));
  out.pickupsShown = await page.locator('aside').getByRole('button', { name: /more|See all/ }).allInnerTexts().then((t) => t.join(' | '));
  const mapBox = await page.locator("canvas.mapboxgl-canvas, .leaflet-container").first().boundingBox();
  out.mapSize = mapBox ? `${Math.round(mapBox.width)}x${Math.round(mapBox.height)}` : "none";
  out.startTrackingOnScreen = await vis(page.getByRole("button", { name: /Start tracking/ }));
  out.sosOnScreen = await vis(page.getByRole("button", { name: /SOS/i }));
  out.bottomNavOnScreen = await vis(page.getByRole("navigation", { name: "Driver sections" }));
  out.turnCardOnScreen = await vis(page.getByText(/Loading directions|Bear|Turn|Head|Awaiting route|Continue|Recalculating/).first());
  await page.screenshot({ path: `/tmp/shots/drive_${label}.png` });
  // tracking survives switching tabs
  await page.getByRole("button", { name: /Start tracking/ }).click();
  await page.waitForTimeout(800);
  out.afterStartStopBtn = await page.getByRole("button", { name: /Stop tracking/ }).first().isVisible().catch(() => false);
  out.afterStartCalls = calls.filter((c) => c !== "heartbeat").join(",");
  await page.getByRole("button", { name: "Chat", exact: true }).click();
  await page.waitForTimeout(800);
  out.chatShown = page.url().endsWith("/driver/chat");
  await page.getByRole("button", { name: "Drive", exact: true }).click();
  await page.waitForTimeout(800);
  out.stillTracking = await page.getByRole("button", { name: /Stop tracking/ }).first().isVisible().catch(() => false);
  out.navigateAlias = await (async () => { await page.goto(base + "/driver/navigate", { waitUntil: "domcontentloaded" }); await page.waitForTimeout(3500); return await page.getByRole("button", { name: "Drive", exact: true }).getAttribute("aria-current"); })();
  out.errors = errors.length ? errors : "none";
  console.log(`--- ${label} ${w}x${h}`);
  for (const [k, v] of Object.entries(out)) console.log("  " + k.padEnd(22), v);
  await ctx.close();
}
await browser.close();
