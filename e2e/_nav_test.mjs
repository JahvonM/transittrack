// Driver Drive screen, Google-Maps-style directions: drives a real saved
// Mapbox route (Grenada) by moving the tablet's GPS along it and checks the
// banner, "Then", arrival card, voice prompts, rerouting, and that nothing
// opens Google Maps.
import { chromium } from "@playwright/test";
import fs from "node:fs";
const base = process.argv[2] || "http://localhost:4173";
const engine = process.env.ENGINE || "full";
const fixture = JSON.parse(fs.readFileSync("src/lib/__tests__/fixtures/route-short.json", "utf8"));
const geom = fixture.routes[0].geometry.coordinates;
const R = 6371000, rad = (d) => (d * Math.PI) / 180;
const metres = (a, b) => { const dLat = rad(b[1] - a[1]), dLng = rad(b[0] - a[0]); const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a[1])) * Math.cos(rad(b[1])) * Math.sin(dLng / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(h)); };
const cum = [0]; for (let i = 1; i < geom.length; i++) cum.push(cum[i - 1] + metres(geom[i - 1], geom[i]));
const at = (d) => { const i = Math.max(1, cum.findIndex((c) => c >= d)); const f = (d - cum[i - 1]) / (cum[i] - cum[i - 1]); return { latitude: geom[i - 1][1] + (geom[i][1] - geom[i - 1][1]) * f, longitude: geom[i - 1][0] + (geom[i][0] - geom[i - 1][0]) * f, accuracy: 8 }; };

const vehicle = { id: "v1", name: "Bus 12", company_id: "c1", driver_pin: "1111", current_lat: geom[0][1], current_lng: geom[0][0], status: "idle", route_id: "r1" };
const route = { id: "r1", name: "Town loop", stops: [{ name: "Grand Anse", lat: 12.12, lng: -61.755, order: 1 }] };
const browser = await chromium.launch({ args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, geolocation: at(0), permissions: ["geolocation"] });
await ctx.addInitScript((engine) => {
  localStorage.setItem("tt_driver_device_id", "dev1");
  localStorage.setItem("tt_driver_unlock_date", new Date().toISOString().slice(0, 10));
  localStorage.setItem("tt-map-engine", engine);
  window.__said = [];
  const fake = { speak: (u) => window.__said.push(u.text), cancel: () => {}, getVoices: () => [] };
  Object.defineProperty(window, "speechSynthesis", { get: () => fake });
}, engine);
let directions = 0;
await ctx.route("https://api.mapbox.com/directions/**", (r) => { directions++; return r.fulfill({ json: fixture }); });
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
const errs = []; page.on("pageerror", (e) => errs.push(String(e).slice(0, 200)));
const ok = (l, v, extra = "") => console.log((v ? "PASS " : "FAIL ") + l + (extra ? `  [${extra}]` : ""));
const text = async (id) => (await page.getByTestId(id).innerText().catch(() => "")).replace(/\s+/g, " ").trim();
const driveTo = async (d) => { await ctx.setGeolocation(at(d)); await page.waitForTimeout(1600); };

await page.goto(base + "/driver/track");
await page.getByTestId("nav-instruction").waitFor({ timeout: 25000 });
await page.waitForTimeout(1500);
ok("first turn shown", /Western Road/.test(await text("nav-instruction")), await text("nav-instruction"));
ok("distance to it", /^\d+ m$/.test(await text("nav-distance")), await text("nav-distance"));
const eta0 = await text("nav-eta");
ok("time, distance, arrival time and stop", /20 min/.test(eta0) && /8\.3 km/.test(eta0) && /Grand Anse/.test(eta0), eta0);
ok("no Google Maps hand-off", (await page.getByRole("link", { name: /Google Maps/ }).count()) === 0);
await page.screenshot({ path: "/tmp/shots/nav_start.png" });

for (const d of [200, 600, 1000]) await driveTo(d);
ok("counts down to the next turn", /Turn right/.test(await text("nav-instruction")) && /1\.\d km/.test(await text("nav-distance")), `${await text("nav-instruction")} / ${await text("nav-distance")}`);
const eta1 = await text("nav-eta");
ok("time left goes down", /(1[0-9]) min/.test(eta1), eta1);

for (const d of [1600, 2000, 2380]) await driveTo(d);
ok("'Then' shown for a turn right after", await page.getByTestId("nav-then").isVisible().catch(() => false));
await page.screenshot({ path: "/tmp/shots/nav_then.png" });
await driveTo(2450); // Mapbox says "Turn right. Then turn left." 115 m before the turn

const said = await page.evaluate(() => window.__said);
ok("voice: starting prompt", said.some((s) => /Drive northwest on Old Road/.test(s)), said.join(" | "));
ok("voice: 800 m warning", said.some((s) => /In 800 meters, Turn right/.test(s)));
ok("voice: turn now with 'then'", said.some((s) => /^Turn right\. Then Turn left/.test(s)));
ok("each prompt once", new Set(said).size === said.length);

// Wrong turn: drive ~200 m off the route.
const off = at(2380);
const before = directions;
await ctx.setGeolocation({ ...off, latitude: off.latitude + 0.002 });
await page.waitForTimeout(1500);
await ctx.setGeolocation({ ...off, latitude: off.latitude + 0.0021 });
await page.waitForTimeout(2500);
ok("reroutes when off the route", directions > before, `${before} -> ${directions}`);

ok("no page errors " + JSON.stringify(errs), errs.length === 0);
await page.screenshot({ path: "/tmp/shots/nav_after.png" });
await browser.close();
