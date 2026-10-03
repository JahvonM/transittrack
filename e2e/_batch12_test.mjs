// Live fleet history replay, admin sidebar (Fleet management + embedded
// pages), passenger naming, Send update, passenger map tools.
import { chromium } from "@playwright/test";
const base = process.argv[2] || "http://localhost:4173";
const shots = "/tmp/shots";
const now = new Date();
const day = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 8, 0, 0).getTime();
const pings = [];
for (let i = 0; i <= 30; i++) pings.push({ id: "p" + i, vehicle_id: "v1", lat: 18.47 + i * 0.002, lng: -77.92 - i * 0.001, speed: 8, recorded_at: new Date(day + i * 60000).toISOString() });
for (let i = 1; i <= 20; i++) pings.push({ id: "s" + i, vehicle_id: "v1", lat: 18.53, lng: -77.95, speed: 0, recorded_at: new Date(day + (30 + i) * 60000).toISOString() });
for (let i = 1; i <= 15; i++) pings.push({ id: "q" + i, vehicle_id: "v1", lat: 18.53 + i * 0.002, lng: -77.95, speed: 9, recorded_at: new Date(day + (50 + i) * 60000).toISOString() });
const vehicles = [
  { id: "v1", name: "Bus 12", plate_number: "PE 4512", company_name: "Island Transit", current_lat: 18.56, current_lng: -77.95, tracking_active: true, status: "on_trip", last_location_update: now.toISOString() },
  { id: "v2", name: "Bus 7", company_name: "Island Transit", current_lat: 18.48, current_lng: -77.93, tracking_active: false, status: "idle", last_location_update: now.toISOString() },
];
const devices = [
  { id: "d1", kiosk_type: "driver", vehicle_id: "v1", vehicle_name: "Bus 12", label: "Bus 12 driver", status: "active", paired: true, last_seen: now.toISOString(), app_health: { build: "2026-10-01 10:00" } },
  { id: "k1", kiosk_type: "bus_boarding", vehicle_id: "v1", vehicle_name: "Bus 12", label: "Bus 12 boarding", status: "active", paired: true, last_seen: now.toISOString() },
];
const contacts = [{ id: "c1", name: "Tanya Brown", type: "staff", phone: "+1876" }, { id: "c2", name: "Guest One", type: "passenger" }];
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
await ctx.addInitScript(() => { localStorage.setItem("base44_access_token", "fake"); localStorage.setItem("token", "fake"); localStorage.setItem("tt-map-engine", "basic"); });
await ctx.route("https://api.mapbox.com/**", (r) => r.abort());
const pingUrls = [];
const updates = [];
await ctx.route("**/api/**", async (r) => {
  const url = r.request().url();
  const m = r.request().method();
  if (url.includes("public-settings")) return r.continue();
  if (url.includes("/entities/User/me")) return r.fulfill({ json: { id: "u1", email: "a@x.com", full_name: "Ana Admin", role: "admin" } });
  if (url.includes("/entities/KioskDevice")) {
    if (m === "PUT" || m === "PATCH") { updates.push(r.request().postData()); return r.fulfill({ json: {} }); }
    return r.fulfill({ json: devices });
  }
  if (url.includes("/entities/LocationPing")) { pingUrls.push(decodeURIComponent(url)); return r.fulfill({ json: pings }); }
  if (url.includes("/entities/Vehicle")) return r.fulfill({ json: vehicles });
  if (url.includes("/entities/Contact")) return r.fulfill({ json: contacts });
  if (url.includes("/entities/")) return r.fulfill({ json: [] });
  return r.fulfill({ json: {} });
});
const page = await ctx.newPage();
const errs = [];
page.on("pageerror", (e) => errs.push(String(e).slice(0, 200)));
const ok = (l, v) => console.log((v ? "PASS " : "FAIL ") + l);

// Live fleet → History
await page.goto(base + "/admin/fleet");
await page.getByRole("tab", { name: "History" }).waitFor({ timeout: 20000 });
await page.locator("[role=button]", { hasText: "Bus 12" }).getByRole("button", { name: /Past trips/ }).click();
await page.getByTestId("replay-clock").waitFor({ timeout: 15000 });
ok("day-range query sent", pingUrls.some((u) => u.includes("recorded_at") && u.includes("$gte")));
const t0 = await page.getByTestId("replay-clock").innerText();
ok("starts at first record (8:00)", /8:00:00/.test(t0));
ok("stop listed", await page.getByText(/Stopped 8:30.*20 min/).isVisible());
ok("trip summary", await page.getByText(/8:00 AM – 9:05 AM/).isVisible());
await page.getByTestId("replay-play").click();
await page.waitForTimeout(2000);
const t1 = await page.getByTestId("replay-clock").innerText();
ok(`moves smoothly while playing (${t0.split(" ")[0]} → ${t1.split(" ")[0]})`, t1 !== t0 && /8:0[1-3]/.test(t1));
await page.screenshot({ path: `${shots}/hist.png` });
await page.getByRole("button", { name: /Stopped 8:30/ }).click();
await page.waitForTimeout(400);
ok("jump to stop", /8:30/.test(await page.getByTestId("replay-clock").innerText()));
await page.getByRole("tab", { name: "Live" }).click();
await page.waitForTimeout(800);

// Sidebar
const aside = page.locator("aside");
ok("Fleet management group", await aside.getByText("Fleet management", { exact: false }).isVisible());
for (const l of ["Vehicle log", "Driver report", "Location timeline", "Route analysis", "Fleet analysis", "Passenger directory"]) ok(`sidebar: ${l}`, await aside.getByRole("button", { name: l, exact: true }).isVisible());
await aside.getByRole("button", { name: "Vehicle log", exact: true }).click();
await page.waitForURL(/\/admin\/vehicle-logs/);
await page.waitForTimeout(1500);
ok("vehicle log inside admin (one top bar)", (await page.locator("header").count()) === 1 && await aside.isVisible());
await aside.getByRole("button", { name: "Location timeline", exact: true }).click();
await page.getByTestId("replay-clock").waitFor({ timeout: 15000 });
ok("location timeline inside admin", await aside.isVisible());
await aside.getByRole("button", { name: "Passenger directory", exact: true }).click();
await page.getByText("Tanya Brown").waitFor({ timeout: 15000 });
ok("directory filter labels", await page.getByRole("button", { name: "Company passengers" }).isVisible());
await page.screenshot({ path: `${shots}/dir.png` });

// Kiosk tablets
await aside.getByRole("button", { name: "Kiosk tablets", exact: true }).click();
await page.getByRole("button", { name: /Update all tablets/ }).waitFor({ timeout: 15000 });
ok("version shown", await page.getByText("Version 2026-10-01 10:00 UTC").isVisible());
await page.getByRole("button", { name: /Send update/ }).first().click();
await page.waitForTimeout(800);
ok("send update writes update_requested_at", updates.some((b) => b && b.includes("update_requested_at")));
await page.getByRole("button", { name: /Update all tablets/ }).click();
await page.waitForTimeout(800);
ok("update all writes both", updates.filter((b) => b && b.includes("update_requested_at")).length >= 3);

// Card issuing wording
await aside.getByRole("button", { name: "Card issuing", exact: true }).click();
await page.waitForTimeout(2000);
ok("card issuing says Passengers", await page.getByRole("button", { name: "Passengers" }).first().isVisible().catch(() => false));
ok("no 'Staff' filter", !(await page.getByRole("button", { name: "Staff", exact: true }).isVisible().catch(() => false)));

ok("no page errors " + JSON.stringify(errs), errs.length === 0);
await browser.close();
