// Two phone-sized screenshots of the live staff home (top, and scrolled to
// the map) side by side, mocked data.
import { chromium } from "@playwright/test";
const base = process.argv[2] || "https://eager-transit-track-go.base44.app";
const iso = (ago) => new Date(Date.now() - ago).toISOString();
const browser = await chromium.launch({ args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, geolocation: { latitude: 18.479, longitude: -77.938 }, permissions: ["geolocation"] });
await ctx.addInitScript(() => { localStorage.setItem("base44_access_token", "fake"); localStorage.setItem("token", "fake"); localStorage.setItem("tt_staff_pickup", "Hotel Riu"); localStorage.setItem("tt_notif_prompt_dismissed", "1"); });
const vehicles = [
  { id: "v1", name: "Bus 12", plate_number: "PE 4512", type: "bus", company_id: "c1", capacity: 30, current_lat: 18.4745, current_lng: -77.929, tracking_active: true, status: "on_trip", route_id: "r1", driver_name: "Marcus", heading: 300 },
  { id: "v2", name: "Bus 7", type: "bus", company_id: "c1", capacity: 14, current_lat: 18.483, current_lng: -77.95, tracking_active: true, status: "idle", driver_name: "Andre", heading: 120 },
  { id: "v3", name: "Taxi 3", type: "taxi", company_id: "c1", current_lat: 18.477, current_lng: -77.945, tracking_active: true, status: "on_trip", heading: 40 },
];
await ctx.route("**/api/**", async (r) => {
  const url = r.request().url();
  if (url.includes("public-settings")) return r.continue();
  if (url.includes("/entities/User/me")) return r.fulfill({ json: { id: "u1", email: "tanya@x.com", full_name: "Tanya Brown", role: "staff", company_id: "c1" } });
  if (url.includes("/entities/Company")) return r.fulfill({ json: [{ id: "c1", name: "Island Transit Co.", access_code: "A", phone: "+18765550100" }] });
  if (url.includes("/entities/Vehicle")) return r.fulfill({ json: vehicles });
  if (url.includes("/entities/Route")) return r.fulfill({ json: [{ id: "r1", name: "Hotel loop", company_id: "c1", stops: [{ name: "Sandals Royal", lat: 18.47, lng: -77.92 }, { name: "Hotel Riu", lat: 18.48, lng: -77.94 }, { name: "Staff Village", lat: 18.49, lng: -77.96 }] }] });
  if (url.includes("/entities/StaffCheckIn")) return r.fulfill({ json: Array.from({ length: 21 }, (_, i) => ({ id: "c" + i, vehicle_id: "v1", staff_name: "S" + i, status: "boarded", company_id: "c1", created_date: iso(600e3) })) });
  if (url.includes("/entities/Broadcast")) return r.fulfill({ json: [{ id: "b1", type: "bus_arrived", company_id: "c1", message: "Bus 12 has arrived at Sandals Royal.", vehicle_name: "Bus 12", created_date: iso(240e3) }] });
  if (url.includes("/entities/")) return r.fulfill({ json: [] });
  return r.fulfill({ json: {} });
});
const page = await ctx.newPage();
await page.goto(base + "/staff", { waitUntil: "domcontentloaded" });
await page.waitForTimeout(6000);

await page.locator(".mapboxgl-map").first().scrollIntoViewIfNeeded();
await page.mouse.wheel(0, 120);
await page.waitForTimeout(2500);
await page.screenshot({ path: "/tmp/shots/pmap.png" });
await browser.close();
console.log("ok");
