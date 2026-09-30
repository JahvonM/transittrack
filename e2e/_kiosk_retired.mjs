// A tablet still set to the old badge registry mode shows the "retired" screen;
// the kiosk setup dialog no longer offers that mode.
import { chromium } from "@playwright/test";
const base = process.argv[2] || "http://localhost:4173";
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1180, height: 820 } });
await ctx.addInitScript(() => {
  localStorage.setItem("tt_kiosk_device_id", "k1");
  localStorage.setItem("base44_access_token", "fake"); localStorage.setItem("token", "fake");
});
await ctx.route("**/api/**", async (r) => {
  const url = r.request().url();
  if (url.includes("public-settings")) return r.continue();
  if (url.includes("/functions/kioskHeartbeat")) return r.fulfill({ json: { ok: true, device: { id: "k1", label: "Bus one", kiosk_type: "badge_registry", company_name: "Island Transit Co.", paired: true, status: "active" }, kiosk_type: "badge_registry", label: "Bus one", company_name: "Island Transit Co.", paired: true } });
  if (url.includes("/entities/User/me")) return r.fulfill({ json: { id: "u1", role: "admin", full_name: "Ana Admin" } });
  if (url.includes("/entities/KioskDevice")) return r.fulfill({ json: [{ id: "k1", label: "Bus one", kiosk_type: "badge_registry", status: "active", paired: true, company_id: "c1" }] });
  if (url.includes("/entities/")) return r.fulfill({ json: [] });
  return r.fulfill({ json: {} });
});
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(String(e).slice(0, 160)));
await page.goto(base + "/kiosk", { waitUntil: "domcontentloaded" });
await page.waitForTimeout(4000);
const retired = await page.getByText("This kiosk mode has been retired").isVisible().catch(() => false);
await page.screenshot({ path: "/tmp/shots/kiosk_retired.png" });
await page.goto(base + "/admin/kiosks", { waitUntil: "domcontentloaded" });
await page.waitForTimeout(3500);
const flagged = await page.getByText(/Retired mode/).first().isVisible().catch(() => false);
const html = await page.content();
console.log("retiredScreen", retired, "| adminFlagged", flagged, "| registryOptionGone", !html.includes("Badge / QR registry"), "| errors", errors.length ? errors : "none");
await browser.close();
