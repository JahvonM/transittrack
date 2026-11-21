// Screenshots of the Admin for design review (playwright.shots.config.js).
import { test } from "@playwright/test";
import { mockFleet, fleetData } from "./helpers/fleetFixture.js";

const minutes = (n) => new Date(Date.now() - n * 60_000).toISOString();
function data() {
  const d = fleetData();
  const a = d.vehicles[0];
  const more = [
    ["bus-c", "Bus 3", "PA 103", "on_trip", 12.035, -61.742, 1, "Marcus Charles", 18],
    ["bus-d", "Bus 4", "PA 104", "on_trip", 12.06, -61.73, 4, "Shanice Baptiste", 11],
    ["bus-e", "Bus 5", "PA 105", "idle", 12.0, -61.79, 45, "", 0],
    ["bus-f", "Bus 6", "PA 106", "maintenance", 12.05, -61.75, 300, "", 0],
    ["bus-g", "Bus 7", "PA 107", "on_trip", 12.12, -61.70, 2, "Devon Noel", 22],
  ];
  for (const [id, name, plate, status, lat, lng, age, driver] of more) {
    d.vehicles.push({ ...a, id, name, plate_number: plate, fleet_number: name.slice(4), status, current_lat: lat, current_lng: lng,
      last_location_update: minutes(age), tracking_active: status !== "maintenance", driver_name: driver || null });
  }
  a.driver_name = "Kevin Thomas";
  return d;
}

async function open(page, path, { width = 1440, height = 900, light = false } = {}) {
  await page.setViewportSize({ width, height });
  if (light) await page.addInitScript(() => localStorage.setItem("tt-theme-v2", "light"));
  await mockFleet(page, { role: "admin", data: data() });
  // Real map tiles for the pictures.
  await page.route(/tile\.openstreetmap|basemaps\.cartocdn|arcgisonline|tiles\./, (r) => r.continue());
  await page.goto(path);
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.waitForTimeout(2500);
}

const shots = [
  ["admin-home-1440", "/admin", { width: 1440, height: 900 }, true],
  ["admin-home-light-1440", "/admin", { width: 1440, height: 900, light: true }, true],
  ["bus-page-1440", "/vehicle/" + fleetData().vehicles[0].id, { width: 1440, height: 900 }, false],
  ["bus-page-390", "/vehicle/" + fleetData().vehicles[0].id, { width: 390, height: 844 }, false],
  ["admin-hub-390", "/admin/travel-times", { width: 390, height: 844 }, false],
  ["admin-home-1280", "/admin", { width: 1280, height: 800 }, false],
  ["admin-home-1024", "/admin", { width: 1024, height: 768 }, true],
  ["admin-home-390", "/admin", { width: 390, height: 844 }, true],
  ["admin-vehicles-1440", "/admin/vehicles", { width: 1440, height: 900 }, false],
  ["admin-kiosks-1440", "/admin/kiosks", { width: 1440, height: 900 }, false],
  ["admin-fleet-1440", "/admin/fleet", { width: 1440, height: 900 }, false],
];
for (const [name, path, size, full] of shots) {
  test(name, async ({ page }) => {
    await open(page, path, size);
    await page.screenshot({ path: `shots/${name}.png`, fullPage: full });
  });
}
test("admin-dialog-1440", async ({ page }) => {
  await open(page, "/admin/vehicles?create=1", { width: 1440, height: 900 });
  await page.screenshot({ path: "shots/admin-dialog-1440.png" });
});
