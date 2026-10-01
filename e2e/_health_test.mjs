// Admin → Fleet health with a mix of healthy and broken buses.
import { chromium } from "@playwright/test";
const base = process.argv[2] || "http://localhost:4173";
const now = Date.now();
const iso = (minAgo) => new Date(now - minAgo * 60000).toISOString();
const vehicles = [
  { id: "v1", name: "Bus 12", fleet_number: "BUS-012", driver_name: "Marcus Reid", status: "on_trip", last_location_update: iso(0.3) },
  { id: "v2", name: "Bus 14", driver_name: "Dee Driver", status: "on_trip", last_location_update: iso(25) },
  { id: "v3", name: "Bus 3", status: "idle", last_location_update: iso(600) },
];
const devices = [
  { id: "d1", kiosk_type: "driver", vehicle_id: "v1", label: "Bus 12 driver", status: "active", paired: true, last_seen: iso(0.2), app_health: { build: "OLD", online: true, queued_gps: 0 }, helper_health: { battery: 88, charging: true, reported_at: iso(1) } },
  { id: "k1", kiosk_type: "bus_boarding", vehicle_id: "v1", label: "Bus 12 boarding", status: "active", paired: true, last_seen: iso(0.5), app_health: { online: true, queued_checkins: 0, reader: "usb_reader", saved_list_at: iso(3) }, helper_health: { reader: "connected", last_card_at: iso(4), reported_at: iso(1) } },
  { id: "d2", kiosk_type: "driver", vehicle_id: "v2", label: "Bus 14 driver", status: "active", paired: true, last_seen: iso(40), app_health: { queued_gps: 37 }, helper_health: { battery: 12, charging: false, reported_at: iso(40) } },
  { id: "k2", kiosk_type: "bus_boarding", vehicle_id: "v2", label: "Bus 14 boarding", status: "active", paired: true, last_seen: iso(1), app_health: { online: false, queued_checkins: 3 }, helper_health: { reader: "disconnected", reported_at: iso(1) } },
];
const errors = [{ id: "e1", device_id: "k2", message: "x", created_date: iso(60) }, { id: "e2", device_id: "", message: "y", created_date: iso(30) }];
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
await ctx.addInitScript(() => { localStorage.setItem("base44_access_token", "fake"); localStorage.setItem("token", "fake"); });
await ctx.route("**/api/**", async (r) => {
  const url = r.request().url();
  if (url.includes("public-settings")) return r.continue();
  if (url.includes("/entities/User/me")) return r.fulfill({ json: { id: "u1", email: "a@x.com", full_name: "Ana Admin", role: "admin" } });
  if (url.includes("/entities/KioskDevice")) return r.fulfill({ json: devices });
  if (url.includes("/entities/ClientError")) return r.fulfill({ json: errors });
  if (url.includes("/entities/Vehicle")) return r.fulfill({ json: vehicles });
  if (url.includes("/entities/")) return r.fulfill({ json: [] });
  return r.fulfill({ json: {} });
});
const page = await ctx.newPage();
const errs = [];
page.on("pageerror", (e) => errs.push(String(e).slice(0, 200)));
const ok = (l, v) => console.log((v ? "PASS " : "FAIL ") + l);
await page.goto(base + "/admin/health");
await page.getByText("Fleet health").first().waitFor({ timeout: 20000 });
await page.waitForTimeout(1500);
const row = (name) => page.locator("tbody tr", { hasText: name });
ok("Bus 12 GPS live", await row("Bus 12").getByText("Live").isVisible());
ok("Bus 12 driver tablet flagged older version", await row("Bus 12").getByText(/older version/).isVisible());
ok("Bus 14 GPS lost", await row("Bus 14").getByText("GPS lost").isVisible());
ok("Bus 14 driver tablet offline", await row("Bus 14").getByText(/Offline/).first().isVisible());
ok("Bus 14 boarding has no internet", await row("Bus 14").getByText("No internet").isVisible());
ok("Bus 14 reader problem", await row("Bus 14").getByText("Reader: disconnected").isVisible());
ok("Bus 14 40 items waiting", await row("Bus 14").getByText("40 items").isVisible());
ok("Bus 14 low battery", await row("Bus 14").getByText("Low battery").isVisible());
ok("Bus 14 1 error", (await row("Bus 14").locator("td").last().innerText()).startsWith("1"));
ok("Bus 3 has no tablets / not tracking", await row("Bus 3").getByText("Not tracking").isVisible() && await row("Bus 3").getByText("No driver tablet").isVisible());
ok("problems listed first", (await page.locator("tbody tr").first().innerText()).includes("Bus 14"));
await page.screenshot({ path: "/tmp/shots/health.png" });
await page.getByLabel("Problems only").click();
await page.waitForTimeout(300);
ok("problems-only filter", (await page.locator("tbody tr").count()) >= 1);
console.log("errors:", errs.length ? errs : "none");
await browser.close();
