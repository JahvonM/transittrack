// Close-up of the 3D model picker in the Add vehicle dialog.
import { chromium } from "@playwright/test";
const base = process.argv[2] || "http://localhost:4173";
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1.5 });
await ctx.addInitScript(() => { localStorage.setItem("base44_access_token", "fake"); localStorage.setItem("token", "fake"); });
await ctx.route("**/api/**", async (r) => {
  const url = r.request().url();
  if (url.includes("public-settings")) return r.continue();
  if (url.includes("/entities/User/me")) return r.fulfill({ json: { id: "u1", email: "a@x.com", full_name: "Ana", role: "admin" } });
  if (url.includes("/entities/Company")) return r.fulfill({ json: [{ id: "c1", name: "Island Transit Co." }] });
  if (url.includes("/entities/")) return r.fulfill({ json: [] });
  return r.fulfill({ json: {} });
});
const page = await ctx.newPage();
await page.goto(base + "/admin/vehicles", { waitUntil: "domcontentloaded" });
await page.waitForTimeout(3000);
await page.getByRole("button", { name: /Add vehicle/ }).first().click();
await page.waitForTimeout(800);
const grid = page.getByRole("radiogroup", { name: "3D model on the map" });
await grid.scrollIntoViewIfNeeded();
await page.waitForTimeout(400);
await grid.screenshot({ path: "/tmp/shots/picker.jpg", type: "jpeg", quality: 70 });
await browser.close();
console.log("ok");
