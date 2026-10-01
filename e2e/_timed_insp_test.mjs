// Driver app: an "at set times" inspection pops up when its time comes, and
// the walk-around uses the engine-in-front X-ray.
import { chromium } from "@playwright/test";
const base = process.argv[2] || "http://localhost:4173";
const vehicle = { id: "v1", name: "Bus 12", company_id: "c1", driver_name: "Marcus Reid", driver_pin: "1234", status: "idle" };
const timed = {
  id: "t9", name: "Midday check", driver_trigger: "at_times", driver_times: ["00:00"], driver_days: [], driver_required: false, xray_layout: "front_engine",
  sections: [{ section_name: "Outside", items: [{ item_name: "Engine oil level", critical: "High" }, { item_name: "Radiator coolant", critical: "High" }, { item_name: "Tail lights", critical: "Medium" }, { item_name: "Rear door opens", critical: "Medium" }] }],
};
let heartbeats = 0;
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
await ctx.addInitScript(() => {
  localStorage.setItem("tt_driver_device_id", "drv1");
  localStorage.setItem("tt_driver_unlock_date", new Date().toISOString().slice(0, 10));
});
await ctx.route("**/api/**", async (r) => {
  const req = r.request(); const url = req.url();
  if (url.includes("public-settings")) return r.continue();
  if (url.includes("/functions/driverSession")) {
    const body = req.postDataJSON();
    if (body.action === "heartbeat") {
      heartbeats += 1;
      // The timed inspection becomes due after the app is already open.
      return r.fulfill({ json: { vehicle, driver_name: "Marcus Reid", broadcasts: [], check_ins: [], trips: [], staff: [], group_messages: [], recent_inspections: [], open_shift: null, inspection_templates: heartbeats > 1 ? [timed] : [] } });
    }
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
await page.goto(base + "/driver/track");
const popped = await page.getByText("Inspection due").first().waitFor({ timeout: 20000 }).then(() => true).catch(() => false);
ok("timed inspection pops up", popped);
ok("popup names the time", await page.getByText(/time for “Midday check”/).isVisible().catch(() => false));
await page.getByRole("button", { name: "Start now" }).click();
await page.waitForTimeout(1500);
ok("walk-around opened", await page.getByText("Engine & oil (front)").first().isVisible().catch(() => false));
ok("no wheelchair hotspot", (await page.locator('[aria-label^="Wheelchair"]').count()) === 0);
await page.screenshot({ path: "/tmp/shots/timed_xray.png" });
console.log("errors:", errors.length ? errors : "none");
await browser.close();
