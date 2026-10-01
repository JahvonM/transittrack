// Inspection templates: X-ray bus type picker, set times, bus picker; saved fields.
import { chromium } from "@playwright/test";
const base = process.argv[2] || "http://localhost:4173";
const companies = [{ id: "c1", name: "Island Transit Co." }];
const vehicles = [{ id: "v1", name: "Bus 12", fleet_number: "BUS-012", company_id: "c1" }, { id: "v2", name: "Bus 14", company_id: "c1" }];
const templates = [{
  id: "t1", name: "Walk-around", company_id: "c1", company_name: "Island Transit Co.", audience: "driver", driver_trigger: "start_of_day",
  sections: [{ section_name: "Outside", items: [{ item_name: "Engine oil level" }, { item_name: "Radiator coolant" }, { item_name: "Tyres" }, { item_name: "Tail lights" }, { item_name: "Wheelchair ramp" }, { item_name: "Rear door" }] },
    { section_name: "Inside", items: [{ item_name: "Fire extinguisher" }, { item_name: "Seats" }, { item_name: "Dashboard warning lights" }] }],
}];
const updates = [];
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
await ctx.addInitScript(() => { localStorage.setItem("base44_access_token", "fake"); localStorage.setItem("token", "fake"); });
await ctx.route("**/api/**", async (r) => {
  const req = r.request(); const url = req.url();
  if (url.includes("public-settings")) return r.continue();
  if (url.includes("/entities/User/me")) return r.fulfill({ json: { id: "u1", email: "a@x.com", full_name: "Ana Admin", role: "admin" } });
  if (req.method() === "PUT" && url.includes("/entities/InspectionTemplate/")) { const b = req.postDataJSON(); updates.push(b); Object.assign(templates[0], b); return r.fulfill({ json: templates[0] }); }
  if (url.includes("/entities/InspectionTemplate")) return r.fulfill({ json: templates });
  if (url.includes("/entities/Company")) return r.fulfill({ json: companies });
  if (url.includes("/entities/Vehicle")) return r.fulfill({ json: vehicles });
  if (url.includes("/entities/")) return r.fulfill({ json: [] });
  return r.fulfill({ json: {} });
});
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(String(e).slice(0, 200)));
const ok = (l, v) => console.log((v ? "PASS " : "FAIL ") + l);
await page.goto(base + "/admin/templates");
await page.getByText("Walk-around").first().click();
await page.waitForTimeout(800);
ok("three bus types offered", await page.getByRole("radio", { name: /Engine in front/ }).isVisible() && await page.getByRole("radio", { name: /Minibus/ }).isVisible() && await page.getByRole("radio", { name: /City bus/ }).isVisible());
ok("engine-in-front is the default", (await page.getByRole("radio", { name: /Engine in front/ }).getAttribute("aria-checked")) === "true");
ok("no wheelchair hotspot on front-engine preview", (await page.locator('[aria-label^="Wheelchair"]').count()) === 0);
await page.getByRole("radio", { name: /At set times/ }).click();
await page.getByLabel("Add a time").fill("07:00");
await page.getByRole("button", { name: "Add time" }).click();
await page.getByLabel("Add a time").fill("13:30");
await page.getByRole("button", { name: "Add time" }).click();
await page.getByRole("button", { name: /Bus 14/ }).click();
await page.screenshot({ path: "/tmp/shots/tpl_settings.png", fullPage: true });
await page.getByRole("button", { name: /Save changes/ }).click();
await page.waitForTimeout(1000);
const u = updates.find((x) => x.driver_trigger);
ok("saved times + bus + layout", !!u && JSON.stringify(u.driver_times) === '["07:00","13:30"]' && JSON.stringify(u.driver_vehicle_ids) === '["v2"]' && u.xray_layout === "front_engine");
await page.getByRole("radio", { name: /City bus/ }).click();
await page.waitForTimeout(300);
ok("city bus shows wheelchair hotspot", (await page.locator('[aria-label^="Wheelchair"]').count()) > 0);
await page.getByRole("radio", { name: /Minibus/ }).click();
await page.waitForTimeout(300);
const box = await page.getByText("X-ray preview").boundingBox();
await page.screenshot({ path: "/tmp/shots/tpl_minibus.png", clip: { x: box.x - 20, y: box.y - 10, width: 1000, height: 330 } });
console.log("errors:", errors.length ? errors : "none");
await browser.close();
