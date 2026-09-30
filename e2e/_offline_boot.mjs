// Offline start-up: open the bus boarding kiosk and driver app once online,
// then cut the network, reload, and check both still open and work.
import { chromium } from "@playwright/test";
const base = process.argv[2] || "http://localhost:4173";
const shotDir = process.argv[3] || "/tmp";

const device = { device_id: "dev1", kiosk_type: "bus_boarding", company_id: "c1", company_name: "Acme", vehicle_id: "v1", vehicle_name: "Bus 7", paired: true, status: "active" };
const staff = [
  { id: "s1", full_name: "Ana Lopez", photo_url: "", nfc_tag: "04A1B2C3", access_code: "12345", one_time_code: "", one_time_code_expires_at: null },
  { id: "s2", full_name: "Ben Ode", photo_url: "", nfc_tag: "", access_code: "", one_time_code: "777888", one_time_code_expires_at: new Date(Date.now() + 3600e3).toISOString() },
];
const session = {
  vehicle: { id: "v1", name: "Bus 7", driver_pin: "1234", status: "active" }, driver_name: "Dee Driver",
  broadcasts: [], check_ins: [], trips: [], staff: [], group_messages: [], inspection_templates: [], recent_inspections: [], open_shift: null,
};

let offline = false;
const calls = [];
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
await ctx.addInitScript(() => {
  if (!localStorage.getItem("tt_kiosk_device_id")) localStorage.setItem("tt_kiosk_device_id", "dev1");
  if (!localStorage.getItem("tt_driver_device_id")) localStorage.setItem("tt_driver_device_id", "drv1");
  localStorage.setItem("tt_driver_unlock_date", new Date().toISOString().slice(0, 10));
});
await ctx.route("**/api/**", async (route) => {
  const req = route.request();
  const url = req.url();
  if (offline) return route.abort("internetdisconnected");
  if (url.includes("public-settings")) return route.continue();
  let body = {}; try { body = req.postDataJSON() || {}; } catch { /* none */ }
  if (url.includes("/functions/")) calls.push({ fn: url.split("/functions/")[1], action: body.action, occurred_at: body.occurred_at, staff_id: body.staff_id });
  if (url.includes("/functions/kioskHeartbeat")) return route.fulfill({ json: device });
  if (url.includes("/functions/kioskCheckIn")) {
    if (body.action === "offline_directory") return route.fulfill({ json: { generated_at: new Date().toISOString(), staff } });
    if (body.action === "check_in") return route.fulfill({ json: { record: { staff_name: "Ana Lopez", status: body.status } } });
    return route.fulfill({ status: 404, json: { error: "badge_not_registered" } });
  }
  if (url.includes("/functions/driverSession")) {
    if (body.action === "start_shift") return route.fulfill({ json: { shift: { id: "sh1", started_at: body.occurred_at } } });
    return route.fulfill({ json: session });
  }
  if (url.includes("/entities/User/me")) return route.fulfill({ status: 401, json: { error: "no" } });
  if (url.includes("/entities/")) return route.fulfill({ json: [] });
  return route.fulfill({ json: {} });
});

const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(String(e).slice(0, 200)));
const ok = (label, v) => console.log((v ? "PASS " : "FAIL ") + label);

// 1) Online first visit: kiosk + driver, and let the service worker save the app.
await page.goto(base + "/kiosk");
await page.getByText("Slide to check in").first().waitFor({ timeout: 20000 });
await page.waitForFunction(() => !!localStorage.getItem("tt_kiosk_directory"), null, { timeout: 15000 });
await page.evaluate(() => navigator.serviceWorker.ready);
await page.goto(base + "/driver/track");
await page.getByText(/Dee/).first().waitFor({ timeout: 20000 });
// Wait for the whole build to be saved.
const saved = await page.waitForFunction(async () => {
  const m = await (await fetch("/offline-manifest.json")).json();
  const c = await caches.open("tt-assets-v1");
  return (await c.keys()).length >= m.files.length;
}, null, { timeout: 60000, polling: 1000 }).then(() => true).catch(() => false);
ok("service worker saved every app file", saved);

// 2) No network: reload both.
offline = true;
await ctx.setOffline(true);
await page.goto(base + "/kiosk").catch((e) => console.log("goto error", String(e).slice(0, 120)));
const kioskUp = await page.getByText("Slide to check in").first().waitFor({ timeout: 15000 }).then(() => true).catch(() => false);
ok("kiosk opens with no network", kioskUp);
const chip = await page.getByText(/Offline - using saved list/).waitFor({ timeout: 10000 }).then(() => true).catch(() => false);
ok("kiosk shows offline chip", chip);
await page.screenshot({ path: shotDir + "/off_kiosk.png" });

// Slide to unlock, then tap a card.
const slider = page.getByText("Slide to check in").first();
const box = await (await slider.elementHandle()).evaluate((el) => {
  const n = el.parentElement;
  const r = n.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height };
});
await page.mouse.move(box.x + 36, box.y + box.h / 2);
await page.mouse.down();
for (let i = 1; i <= 20; i++) await page.mouse.move(box.x + 36 + (box.w - 40) * i / 20, box.y + box.h / 2);
await page.mouse.up();
await page.waitForTimeout(800);
await page.evaluate(() => window.dispatchEvent(new CustomEvent("tt-badge", { detail: "04:a1:b2:c3" })));
const found = await page.getByText("Ana Lopez").first().waitFor({ timeout: 8000 }).then(() => true).catch(() => false);
ok("card recognised from saved list", found);
await page.screenshot({ path: shotDir + "/off_confirm.png" });
if (found) {
  await page.getByRole("button", { name: /Boarding/ }).first().click();
  await page.waitForTimeout(1200);
}
const queued = await page.evaluate(() => JSON.parse(localStorage.getItem("tt_offline_checkins") || "[]"));
ok("check-in queued with time", queued.length === 1 && !!queued[0].payload.occurred_at);
await page.screenshot({ path: shotDir + "/off_result.png" });

await page.goto(base + "/driver/track").catch(() => {});
const driverUp = await page.getByText(/Dee/).first().waitFor({ timeout: 15000 }).then(() => true).catch(() => false);
ok("driver app opens with no network", driverUp);
const drvOffline = await page.getByRole("status").filter({ hasText: "Offline" }).first().waitFor({ timeout: 15000 }).then(() => true).catch(() => false);
ok("driver shows Offline badge", drvOffline);
const startBtn = page.getByRole("button", { name: /start shift/i }).first();
if (await startBtn.isVisible().catch(() => false)) {
  await startBtn.click();
  await page.waitForTimeout(800);
}
const jobs = await page.evaluate(() => JSON.parse(localStorage.getItem("tt_offline_jobs") || "[]"));
ok("shift start queued offline", jobs.some((j) => j.kind === "driver_shift" && j.payload.action === "start_shift"));
await page.screenshot({ path: shotDir + "/off_driver.png" });

// 3) Back online: queued work uploads with the original times.
offline = false;
await ctx.setOffline(false);
await page.waitForTimeout(5000);
await page.goto(base + "/kiosk");
await page.waitForTimeout(6000);
const ci = calls.filter((c) => c.action === "check_in");
ok("queued check-in uploaded with occurred_at", ci.length >= 1 && ci.every((c) => c.occurred_at));
const sh = calls.filter((c) => c.action === "start_shift");
ok("queued shift uploaded with occurred_at", sh.length >= 1 && sh.every((c) => c.occurred_at));
console.log("errors:", errors.length ? errors : "none");
await browser.close();
