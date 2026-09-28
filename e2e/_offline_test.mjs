// End-to-end check of offline inspections: fill a checklist, lose signal,
// submit (should be kept on the device), reconnect (should upload once).
import { chromium } from "@playwright/test";
const base = process.argv[2] || "http://localhost:4173";
const user = { id: "u1", email: "mech@example.com", full_name: "Mo Mechanic", role: "mechanic" };
const vehicles = [{ id: "v1", name: "Bus 1", company_id: "c1", company_name: "Co" }];
const templates = [{ id: "t1", name: "Daily check", sections: [{ section_name: "Brakes", items: [{ item_name: "Pads", critical: "High" }, { item_name: "Fluid" }] }] }];

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
await ctx.addInitScript(() => { localStorage.setItem("base44_access_token", "fake"); localStorage.setItem("token", "fake"); });
const writes = [];
await ctx.route("**/api/**", async (route) => {
  const req = route.request();
  const url = req.url();
  if (url.includes("public-settings")) return route.continue();
  if (url.includes("/entities/User/me")) return route.fulfill({ json: user });
  if (req.method() !== "GET" && url.includes("/entities/")) {
    const m = url.match(/entities\/([A-Za-z]+)(\/[^?]*)?/);
    let body = null; try { body = req.postDataJSON(); } catch { /* none */ }
    writes.push({ method: req.method(), entity: m?.[1], path: m?.[2] || "", rows: Array.isArray(body) ? body.length : 1 });
    return route.fulfill({ json: Array.isArray(body) ? body.map((b, i) => ({ id: "n" + i, ...b })) : { id: "new1", ...(body || {}) } });
  }
  if (url.includes("/entities/Vehicle")) return route.fulfill({ json: vehicles });
  if (url.includes("/entities/InspectionTemplate")) return route.fulfill({ json: templates });
  if (url.includes("/entities/")) return route.fulfill({ json: [] });
  return route.fulfill({ json: {} });
});
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(String(e).slice(0, 200)));
await page.goto(base + "/run-inspection", { waitUntil: "domcontentloaded" });
await page.getByRole("combobox").first().click();
await page.getByRole("option", { name: "Bus 1" }).click();
await page.getByRole("combobox").nth(1).click();
await page.getByRole("option", { name: "Daily check" }).click();
await page.getByRole("button", { name: /start inspection/i }).click();
await page.getByRole("button", { name: "Failed" }).first().click();
await page.getByRole("button", { name: "Good" }).nth(1).click();

await ctx.setOffline(true);
await page.getByRole("button", { name: /^submit$/i }).click();
const saved = await page.getByText("Inspection saved on this device").isVisible({ timeout: 8000 }).catch(() => false);
const pillOffline = await page.getByText(/1 inspection waiting for signal/).isVisible({ timeout: 3000 }).catch(() => false);
const queued = await page.evaluate(() => JSON.parse(localStorage.getItem("tt_offline_jobs") || "[]").length);
console.log("offline submit -> saved screen:", saved, "| pill:", pillOffline, "| queued jobs:", queued, "| writes while offline:", writes.length);

await ctx.setOffline(false);
await page.waitForFunction(() => JSON.parse(localStorage.getItem("tt_offline_jobs") || "[]").length === 0, null, { timeout: 15000 }).catch(() => {});
const left = await page.evaluate(() => JSON.parse(localStorage.getItem("tt_offline_jobs") || "[]").length);
const pillGone = !(await page.getByText(/inspection.*(waiting|uploading)/).isVisible().catch(() => false));
const real = writes.filter((w) => w.entity !== "AuditLog");
console.log("after reconnect -> jobs left:", left, "| pill gone:", pillGone);
console.log("uploads:", JSON.stringify(real));
console.log("audit log rows written:", writes.filter((w) => w.entity === "AuditLog").length);
console.log("page errors:", errors.length ? errors : "none");
await browser.close();
