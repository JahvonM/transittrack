// Tests the vehicle form + 3D picker, colour themes, parts, driver documents.
import { chromium } from "@playwright/test";
import fs from "node:fs";
const base = process.argv[2] || "http://localhost:4173";
const png = new Uint8Array(fs.readFileSync("public/brand/icon-192.png"));
fs.writeFileSync("/tmp/part.png", png);

const companies = [{ id: "c1", name: "Island Transit Co." }];
const vehicles = [{ id: "v1", name: "Bus 12", company_id: "c1", company_name: "Island Transit Co.", type: "bus", fleet_number: "BUS-012", plate_number: "PE 4512", vin: "JTF123", current_odometer: 84250, model_3d: "double_decker", status: "idle" }];
const drivers = [{ id: "d1", full_name: "Marcus Reid", email: "marcus@x.com", company_id: "c1" }];
const docs = [{ id: "doc1", driver_id: "d1", kind: "license", file_uri: "private://lic", document_number: "L-99", expiry_date: "2027-03-12" }];

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
await ctx.addInitScript(() => { localStorage.setItem("base44_access_token", "fake"); localStorage.setItem("token", "fake"); });
const writes = [];
await ctx.route("**/api/**", async (r) => {
  const req = r.request(); const url = req.url();
  if (url.includes("public-settings")) return r.continue();
  if (url.includes("/entities/User/me")) {
    if (req.method() !== "GET") writes.push({ entity: "me", body: req.postDataJSON() });
    return r.fulfill({ json: { id: "u1", email: "a@x.com", full_name: "Ana Admin", role: "admin" } });
  }
  if (url.includes("UploadPrivateFile")) { writes.push({ entity: "UploadPrivateFile" }); return r.fulfill({ json: { file_uri: "private://ins" } }); }
  if (url.includes("UploadFile")) { writes.push({ entity: "UploadFile" }); return r.fulfill({ json: { file_url: "https://example.com/p.png" } }); }
  if (req.method() !== "GET") {
    const m = url.match(/entities\/([A-Za-z]+)/);
    let body = null; try { body = req.postDataJSON(); } catch { /* none */ }
    writes.push({ entity: m?.[1], method: req.method(), body });
    return r.fulfill({ json: { id: "new", ...(body || {}) } });
  }
  if (url.includes("/entities/Company")) return r.fulfill({ json: companies });
  if (url.includes("/entities/Vehicle")) return r.fulfill({ json: vehicles });
  if (url.includes("/entities/Driver/") || url.match(/entities\/Driver\?|entities\/Driver$/)) return r.fulfill({ json: drivers });
  if (url.includes("/entities/DriverDocument")) return r.fulfill({ json: docs });
  if (url.includes("/entities/")) return r.fulfill({ json: [] });
  return r.fulfill({ json: {} });
});
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(String(e).slice(0, 200)));
const out = {};
const has = (t) => page.getByText(t).first().isVisible().catch(() => false);

// Vehicles
await page.goto(base + "/admin/vehicles", { waitUntil: "domcontentloaded" });
await page.waitForTimeout(3500);
out.listShowsNewDetails = await has("No. BUS-012 · PE 4512 · 84,250 km · VIN JTF123");
out.fleetSyncGone = !(await has("Fleet sync"));
await page.getByRole("button", { name: /Add vehicle/ }).first().click();
await page.waitForTimeout(800);
out.pickerModels = await page.getByRole("radio").count();
await page.screenshot({ path: "/tmp/shots/v_dialog.png" });
await page.getByPlaceholder("Bus 12").fill("Coach 3");
await page.getByPlaceholder("BUS-012").fill("CO-003");
await page.getByPlaceholder("JTFSS22P…").fill("abc123xyz");
await page.getByPlaceholder("84250").fill("12000");
await page.getByRole("radio", { name: /Coach/ }).click();
// company via MobileSelect
await page.getByText("Choose company").click().catch(() => {});
await page.getByRole("option", { name: "Island Transit Co." }).click().catch(async () => { await page.getByText("Island Transit Co.").last().click(); });
await page.getByRole("button", { name: /^Add vehicle$/ }).last().click();
await page.waitForTimeout(1000);
const vc = writes.find((w) => w.entity === "Vehicle" && w.method === "POST");
out.vehicleSaved = vc ? JSON.stringify({ fleet_number: vc.body.fleet_number, vin: vc.body.vin, current_odometer: vc.body.current_odometer, model_3d: vc.body.model_3d, company_id: vc.body.company_id }) : "NOT SAVED";

// Parts
await page.goto(base + "/admin/parts", { waitUntil: "domcontentloaded" });
await page.waitForTimeout(3000);
out.partsNoCompany = !(await page.getByText("Choose company").isVisible().catch(() => false));
await page.locator("label:has-text('Take or choose a photo') input[type=file]").setInputFiles("/tmp/part.png");
await page.waitForTimeout(800);
await page.locator("input").nth(1).fill("Brake pads");
const nameInput = page.locator("label:has-text('Part name') + input, label:text('Part name') ~ input").first();
if (await nameInput.count()) await nameInput.fill("Brake pads");
await page.getByRole("button", { name: /^Add part$/ }).click();
await page.waitForTimeout(800);
const pc = writes.find((w) => w.entity === "Part" && w.method === "POST");
out.partSaved = pc ? JSON.stringify({ part_name: pc.body.part_name, photo_url: pc.body.photo_url, company_id: pc.body.company_id ?? null }) : "NOT SAVED";

// Drivers + documents
await page.goto(base + "/admin/drivers", { waitUntil: "domcontentloaded" });
await page.waitForTimeout(3000);
out.docChips = await has("Licence: Valid to") && await has("Insurance: Missing");
await page.getByRole("button", { name: /Documents/ }).first().click();
await page.waitForTimeout(700);
await page.locator("section:has-text('Insurance') input[type=file]").setInputFiles("/tmp/part.png");
await page.waitForTimeout(1000);
const dc = writes.find((w) => w.entity === "DriverDocument" && w.method === "POST");
out.insuranceSavedPrivately = writes.some((w) => w.entity === "UploadPrivateFile") && !!dc && dc.body.kind === "insurance" && dc.body.file_uri === "private://ins";
await page.screenshot({ path: "/tmp/shots/v_docs.png" });
await page.keyboard.press("Escape");

// Colour themes
await page.goto(base + "/account", { waitUntil: "domcontentloaded" });
await page.waitForTimeout(2500);
await page.getByRole("radio", { name: /Ocean/ }).click();
await page.waitForTimeout(300);
out.oceanApplied = await page.evaluate(() => [document.documentElement.getAttribute("data-accent"), getComputedStyle(document.documentElement).getPropertyValue("--primary").trim(), localStorage.getItem("tt-accent")].join(" | "));
out.accentSavedToAccount = JSON.stringify(writes.filter((w) => w.entity === "me").map((w) => w.body));
await page.screenshot({ path: "/tmp/shots/v_account_ocean.png" });
await page.reload({ waitUntil: "domcontentloaded" });
await page.waitForTimeout(1500);
out.persistsAfterReload = await page.evaluate(() => document.documentElement.getAttribute("data-accent"));
out.errors = errors.length ? errors : "none";
for (const [k, v] of Object.entries(out)) console.log(k.padEnd(26), v);
await browser.close();
