// Tests the X-ray driver inspection, scheduling triggers, and the admin builder.
import { chromium } from "@playwright/test";
import fs from "node:fs";
const base = process.argv[2] || "http://localhost:4173";
fs.mkdirSync("/tmp/shots", { recursive: true });
fs.writeFileSync("/tmp/part.png", new Uint8Array(fs.readFileSync("public/brand/icon-192.png")));

const T1 = {
  id: "t1", name: "Driver pre-trip walk-around", driver_trigger: "start_of_day", driver_days: [], driver_from_time: "", driver_required: true, driver_sent_at: null,
  sections: [
    { section_name: "Outside", items: [
      { item_name: "Mirrors clean, secure and adjusted", critical: "High", zone: "mirrors" },
      { item_name: "Tyres inflated, no cuts or bulges", critical: "Critical", zone: "tyres", instructions: "Walk round and look at every tyre." },
      { item_name: "Tail, brake and signal lights work", critical: "Critical" },
    ] },
    { section_name: "Inside", items: [
      { item_name: "Fire extinguisher present and charged", critical: "Critical", zone: "fire_extinguisher" },
      { item_name: "No warning lights on the dashboard", critical: "High", requires_photo: true },
    ] },
  ],
};
const T2 = { id: "t2", name: "Shift start check", driver_trigger: "shift_start", driver_days: [], driver_required: false, sections: [{ section_name: "Quick", items: [{ item_name: "Horn works", critical: "Medium" }, { item_name: "Brakes feel firm", critical: "Critical" }] }] };
const T3 = { id: "t3", name: "Deep clean check", driver_trigger: "on_demand", driver_days: [], driver_required: false, sections: [{ section_name: "Cabin", items: [{ item_name: "Floor swept", critical: "Low" }] }] };

const vehicle = { id: "v1", name: "Bus 12", company_id: "c1", driver_name: "Marcus Reid", driver_pin: "1234", current_odometer: 84250, status: "idle" };
const calls = [];
let recent = [];
let openShift = null;

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
await ctx.addInitScript(() => {
  localStorage.setItem("tt_driver_device_id", "dev1");
  localStorage.setItem("tt_driver_unlock_date", new Date().toISOString().slice(0, 10));
  localStorage.setItem("tt-xr-speak", "off");
});
const adminTemplates = [
  { id: "t1", ...T1, audience: "driver" },
  { id: "m1", name: "Daily", audience: undefined, frequency_days: 1, sections: [{ section_name: "Brake System", items: [{ item_name: "Check brake operation", critical: "Critical" }, { item_name: "Check headlights", critical: "High" }] }] },
];
const writes = [];
await ctx.route("**/api/**", async (r) => {
  const req = r.request(); const url = req.url();
  if (url.includes("public-settings")) return r.continue();
  if (url.includes("/functions/driverSession")) {
    const body = req.postDataJSON();
    calls.push(body);
    if (body.action === "heartbeat") {
      return r.fulfill({ json: { vehicle, driver_name: "Marcus Reid", driver_pin: "1234", company_id: "c1", staff: [], route: null, broadcasts: [], check_ins: [], group_messages: [], trips: [], open_shift: openShift, inspection_templates: [T1, T2, T3], recent_inspections: recent } });
    }
    if (body.action === "submit_template_inspection") {
      const rec = { id: "i" + calls.length, template_id: body.template_id, status: "passed", created_date: new Date().toISOString() };
      recent = [rec, ...recent];
      return r.fulfill({ json: { inspection: rec } });
    }
    if (body.action === "start_shift") { openShift = { id: "s1", started_at: new Date().toISOString() }; return r.fulfill({ json: { shift: openShift } }); }
    return r.fulfill({ json: { ok: true } });
  }
  if (url.includes("/entities/User/me")) return r.fulfill({ json: { id: "u1", email: "a@x.com", full_name: "Ana Admin", role: "admin" } });
  if (req.method() !== "GET") {
    const m = url.match(/entities\/([A-Za-z]+)/);
    let body = null; try { body = req.postDataJSON(); } catch { /* none */ }
    writes.push({ entity: m?.[1], method: req.method(), body });
    return r.fulfill({ json: { id: "new", ...(body || {}) } });
  }
  if (url.includes("/entities/InspectionTemplate")) return r.fulfill({ json: adminTemplates });
  if (url.includes("/entities/Company")) return r.fulfill({ json: [{ id: "c1", name: "Island Transit Co." }] });
  if (url.includes("/entities/")) return r.fulfill({ json: [] });
  return r.fulfill({ json: {} });
});

const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(String(e).slice(0, 200)));
const out = {};
const has = (t) => page.getByText(t).first().isVisible().catch(() => false);

// 1. Home shows the due banner
await page.goto(base + "/driver", { waitUntil: "domcontentloaded" });
await page.waitForTimeout(3500);
out.bannerShown = await has("Driver pre-trip walk-around is due");
await page.getByRole("button", { name: /^Start/ }).first().click();
await page.waitForTimeout(600);
out.noBackOnRequired = !(await page.getByRole("button", { name: "Back", exact: true }).first().isVisible().catch(() => false)) || "back visible";
await page.waitForTimeout(1500);
await page.screenshot({ path: "/tmp/shots/x_outside.png" });
out.firstItem = await page.locator("h3").first().innerText();

// 2. Walk through: OK, Problem (+note+photo), OK, OK, OK+photo
const ok = () => page.getByRole("button", { name: /^OK$/ }).click();
await ok(); await page.waitForTimeout(500);
out.secondItem = await page.locator("h3").first().innerText();
await page.getByRole("button", { name: /^Problem$/ }).click();
await page.getByLabel("What's wrong?").fill("Front left tyre looks low");
await page.locator("input[type=file]").setInputFiles("/tmp/part.png");
await page.waitForTimeout(700);
await page.screenshot({ path: "/tmp/shots/x_problem.png" });
await page.getByRole("button", { name: /Save and next/ }).click(); await page.waitForTimeout(400);
const order = [];
for (let i = 0; i < 6 && !(await has("Almost done")); i++) {
  const title = await page.locator("h3").first().innerText();
  order.push(title);
  if (i === 1) {
    out.onInsideView = await page.getByRole("tab", { name: "Inside" }).getAttribute("aria-selected");
    await page.screenshot({ path: "/tmp/shots/x_inside.png" });
  }
  await ok(); await page.waitForTimeout(400);
  if (await page.getByRole("button", { name: /Take the required photo/ }).isVisible().catch(() => false)) {
    await page.locator("input[type=file]").setInputFiles("/tmp/part.png");
    await page.waitForTimeout(1000);
  }
}
out.walkOrderRest = order.join(" → ");
out.readingsShown = await has("Almost done");
await page.screenshot({ path: "/tmp/shots/x_readings.png" });
await page.getByRole("button", { name: /Submit inspection/ }).click();
await page.waitForTimeout(1200);
const sub = calls.find((c) => c.action === "submit_template_inspection");
out.submitted = sub ? JSON.stringify({ t: sub.template_id, n: sub.results.length, failed: sub.results.filter((r) => r.condition === "FAILED").map((r) => r.item_name + " / " + r.notes + " / photo:" + !!r.photo_data), photos: sub.results.filter((r) => r.photo_data).length, zones: sub.results.map((r) => r.zone).join(",") }) : "NOT SUBMITTED";
out.doneScreen = await has("Problems reported");
await page.screenshot({ path: "/tmp/shots/x_done.png" });
await page.getByRole("button", { name: "Continue" }).click();
await page.waitForTimeout(2500);
out.bannerGoneAfter = !(await has("Driver pre-trip walk-around is due"));

// 3. Start shift runs the shift_start template first
await page.getByRole("button", { name: /Start shift/ }).click();
await page.waitForTimeout(2200);
out.shiftInspectionOpened = page.url().includes("t=t2") && page.url().includes("then=start_shift");
out.canSkipOptional = await page.getByRole("button", { name: /Skip for now/ }).isVisible();
await ok(); await page.waitForTimeout(500); await ok(); await page.waitForTimeout(500);
await page.getByRole("button", { name: /Submit inspection/ }).click();
await page.waitForTimeout(1000);
await page.getByRole("button", { name: "Continue" }).click();
await page.waitForTimeout(1500);
out.shiftStartedAfter = calls.some((c) => c.action === "start_shift");

// 4. Safety tab list
await page.getByRole("tab", { name: /Safety/ }).click();
await page.waitForTimeout(600);
out.safetyList = (await has("Deep clean check")) && (await has("Done today"));
await page.screenshot({ path: "/tmp/shots/x_safety.png" });

// 5. Admin builder
await page.goto(base + "/admin/templates", { waitUntil: "domcontentloaded" });
await page.waitForTimeout(3500);
out.adminAudienceShown = await has("Drivers · Start of the day");
await page.getByText("Driver pre-trip walk-around").first().click();
await page.waitForTimeout(800);
await page.getByRole("radio", { name: /When a shift starts/ }).click();
await page.getByRole("button", { name: "Mon" }).click();
await page.getByRole("button", { name: /Save changes/ }).click();
await page.waitForTimeout(800);
const put = writes.find((w) => w.entity === "InspectionTemplate" && w.method === "PUT");
out.adminSaved = put ? JSON.stringify({ audience: put.body.audience, trigger: put.body.driver_trigger, days: put.body.driver_days, required: put.body.driver_required }) : "NOT SAVED";
await page.screenshot({ path: "/tmp/shots/x_admin.png", fullPage: true });
await page.getByRole("button", { name: /Send to drivers now/ }).click();
await page.waitForTimeout(400);
await page.getByRole("button", { name: /^Send$/ }).click();
await page.waitForTimeout(800);
out.sentNow = writes.some((w) => w.entity === "InspectionTemplate" && w.body?.driver_sent_at);
// mechanic template shows auto zones in picker label
out.errors = errors.length ? errors : "none";
for (const [k, v] of Object.entries(out)) console.log(k.padEnd(24), v);
await browser.close();
