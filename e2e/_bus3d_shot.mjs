// Close-up of the 3D vehicle marker at several headings (rendered on a plain
// page via the built app's map pins) plus the pins on the staff map.
import { chromium } from "@playwright/test";
const base = process.argv[2] || "http://localhost:4173";
const browser = await chromium.launch({ args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
await ctx.addInitScript(() => {
  localStorage.setItem("base44_access_token", "fake"); localStorage.setItem("token", "fake");
  localStorage.setItem("tt_staff_pickup", "Hotel Riu");
});
const vehicles = [
  { id: "v1", name: "Bus 12", type: "bus", company_id: "c1", capacity: 30, current_lat: 18.472, current_lng: -77.925, tracking_active: true, status: "on_trip", route_id: "r1", heading: 60 },
  { id: "v2", name: "Taxi 3", type: "taxi", company_id: "c1", current_lat: 18.475, current_lng: -77.93, tracking_active: true, status: "idle", heading: 200 },
];
await ctx.route("**/api/**", async (r) => {
  const url = r.request().url();
  if (url.includes("public-settings")) return r.continue();
  if (url.includes("/entities/User/me")) return r.fulfill({ json: { id: "u1", email: "t@x.com", full_name: "Tanya", role: "staff", company_id: "c1" } });
  if (url.includes("/entities/Company")) return r.fulfill({ json: [{ id: "c1", name: "Island Transit Co.", access_code: "A" }] });
  if (url.includes("/entities/Vehicle")) return r.fulfill({ json: vehicles });
  if (url.includes("/entities/Route")) return r.fulfill({ json: [{ id: "r1", name: "Loop", company_id: "c1", stops: [{ name: "Hotel Riu", lat: 18.48, lng: -77.94 }, { name: "B", lat: 18.49, lng: -77.95 }] }] });
  if (url.includes("/entities/")) return r.fulfill({ json: [] });
  return r.fulfill({ json: {} });
});
const page = await ctx.newPage();
await page.goto(base + "/staff", { waitUntil: "domcontentloaded" });
await page.waitForTimeout(6000);
const map = page.locator(".mapboxgl-map").first();
await map.scrollIntoViewIfNeeded();
await page.waitForTimeout(1500);
await map.screenshot({ path: "/tmp/shots/map3d.png" });
for (const name of ["Bus 12", "Taxi 3"]) {
  const el = page.locator(`[aria-label^="${name}"]`).first();
  const box = await el.boundingBox().catch(() => null);
  console.log(name, "marker box:", JSON.stringify(box));
  if (box) await page.screenshot({ path: `/tmp/shots/${name.replace(" ", "_")}.png`, clip: { x: box.x - 20, y: box.y - 20, width: box.width + 40, height: box.height + 40 } });
}
await browser.close();
