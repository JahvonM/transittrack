// Driver GPS with no connection: points are kept on the tablet with their
// times, the Drive screen says so, and they upload once the connection is back.
import { chromium } from "@playwright/test";
const base = process.argv[2] || "http://localhost:4173";
const vehicle = { id: "v1", name: "Bus 12", company_id: "c1", driver_name: "Marcus Reid", driver_pin: "1234", status: "idle", current_lat: 10.65, current_lng: -61.5 };
let offline = false;
const live = [];
const uploads = [];
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, geolocation: { latitude: 10.65, longitude: -61.5, accuracy: 10 }, permissions: ["geolocation"] });
await ctx.addInitScript(() => {
  localStorage.setItem("tt_driver_device_id", "drv1");
  localStorage.setItem("tt_driver_unlock_date", new Date().toISOString().slice(0, 10));
});
await ctx.route("**/api/**", async (r) => {
  const req = r.request(); const url = req.url();
  if (url.includes("public-settings")) return r.continue();
  if (url.includes("/functions/driverSession")) {
    const body = req.postDataJSON();
    if (offline && body.action !== "heartbeat") return r.abort("internetdisconnected");
    if (body.action === "heartbeat") return r.fulfill({ json: { vehicle, driver_name: "Marcus Reid", broadcasts: [], check_ins: [], trips: [], staff: [], group_messages: [], recent_inspections: [], open_shift: null, inspection_templates: [] } });
    if (body.action === "update_location") { live.push({ lat: body.lat, lng: body.lng }); return r.fulfill({ json: { ok: true } }); }
    if (body.action === "upload_track") { uploads.push(...body.points); return r.fulfill({ json: { ok: true, stored: body.points.length } }); }
    return r.fulfill({ json: { ok: true } });
  }
  if (url.includes("/entities/User/me")) return r.fulfill({ status: 401, json: {} });
  if (url.includes("/entities/")) return r.fulfill({ json: [] });
  return r.fulfill({ json: {} });
});
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(String(e).slice(0, 200)));
const ok = (l, v) => console.log((v ? "PASS " : "FAIL ") + l);
const move = async (i) => ctx.setGeolocation({ latitude: 10.65 + i * 0.001, longitude: -61.5 + i * 0.001, accuracy: 10 });

await page.goto(base + "/driver/track");
await page.getByRole("button", { name: /Start tracking/ }).click();
await page.waitForTimeout(1500);
await move(1);
await page.waitForTimeout(2000);
ok("online: point sent live", live.length >= 1);
ok("health shows GPS live", await page.getByText(/GPS live · sent/).isVisible());

offline = true;
for (let i = 2; i <= 5; i++) { await page.waitForTimeout(8000); await move(i); }
await page.waitForTimeout(1500);
const queued = await page.evaluate(() => JSON.parse(localStorage.getItem("tt_gps_queue") || "[]"));
ok(`offline: points kept on the tablet (${queued.length})`, queued.length >= 2 && queued.every((p) => p.t && p.lat && p.lng));
ok("health says points are saved", await page.getByText(/No connection · \d+ GPS points? saved/).isVisible());
await page.screenshot({ path: "/tmp/shots/gps_offline.png" });

offline = false;
await page.waitForTimeout(5500);
await move(6);
await page.waitForTimeout(3000);
const left = await page.evaluate(() => JSON.parse(localStorage.getItem("tt_gps_queue") || "[]").length);
ok(`back online: saved points uploaded (${uploads.length}) with their times`, uploads.length === queued.length && uploads.every((p) => !Number.isNaN(Date.parse(p.t))));
ok("queue emptied", left === 0);
ok("oldest first", uploads.every((p, i) => i === 0 || Date.parse(p.t) >= Date.parse(uploads[i - 1].t)));
console.log("errors:", errors.length ? errors : "none");
await browser.close();
