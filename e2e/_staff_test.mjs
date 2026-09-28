// Functional test of the redesigned staff home with mocked data: which bus
// the hero picks, quick actions, sheets, lost-item privacy, alert filtering.
import { chromium } from "@playwright/test";
const base = process.argv[2] || "http://localhost:4173";
const now = Date.now();
const iso = (ago) => new Date(now - ago).toISOString();
const company = { id: "c1", name: "Island Transit Co.", access_code: "ABC123", phone: "+18765550100" };
const routes = [
  { id: "r1", name: "Hotel loop", company_id: "c1", active: true, stops: [{ name: "Sandals Royal", lat: 18.47, lng: -77.92 }, { name: "Hotel Riu", lat: 18.48, lng: -77.94 }] },
  { id: "r2", name: "Airport run", company_id: "c1", active: true, stops: [{ name: "Airport", lat: 18.5, lng: -77.91 }, { name: "Town", lat: 18.46, lng: -77.9 }] },
];
const vehicles = [
  // Closest bus to Hotel Riu, but on the airport route: must NOT be picked.
  { id: "vX", name: "Bus 99", company_id: "c1", capacity: 20, current_lat: 18.4801, current_lng: -77.9401, tracking_active: true, status: "on_trip", route_id: "r2" },
  { id: "v1", name: "Bus 12", plate_number: "PE 4512", company_id: "c1", capacity: 30, current_lat: 18.472, current_lng: -77.925, tracking_active: true, status: "on_trip", route_id: "r1", driver_name: "Marcus" },
];
const broadcasts = [
  { id: "b1", type: "bus_arrived", company_id: "c1", message: "Bus 12 has arrived at Sandals Royal.", vehicle_name: "Bus 12", created_date: iso(60e3) },
  { id: "b2", type: "bus_arrived", company_id: "OTHER", message: "Other Co bus arrived somewhere.", vehicle_name: "Zed 1", created_date: iso(60e3) },
];
const user = { id: "u1", email: "tanya@example.com", full_name: "Tanya Brown", role: "staff", company_id: "c1", phone: "876-555-0199" };

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
await ctx.addInitScript(() => {
  localStorage.setItem("base44_access_token", "fake"); localStorage.setItem("token", "fake");
  localStorage.setItem("tt_staff_pickup", "Hotel Riu");
});
const writes = [];
await ctx.route("**/api/**", async (r) => {
  const req = r.request(); const url = req.url();
  if (url.includes("public-settings")) return r.continue();
  if (url.includes("/entities/User/me")) {
    if (req.method() !== "GET") { writes.push({ entity: "me", body: req.postDataJSON() }); }
    return r.fulfill({ json: user });
  }
  if (req.method() !== "GET") {
    const m = url.match(/entities\/([A-Za-z]+)/);
    let body = null; try { body = req.postDataJSON(); } catch { /* none */ }
    writes.push({ entity: m?.[1] || url.split("/").slice(-1)[0], body });
    if (url.includes("generateOneTimeCode")) return r.fulfill({ json: { code: "482913", expires_at: iso(-900e3) } });
    return r.fulfill({ json: { id: "new", ...(body || {}) } });
  }
  if (url.includes("/entities/Company")) return r.fulfill({ json: [company] });
  if (url.includes("/entities/Vehicle")) return r.fulfill({ json: vehicles });
  if (url.includes("/entities/Route")) return r.fulfill({ json: routes });
  if (url.includes("/entities/Broadcast")) return r.fulfill({ json: broadcasts });
  if (url.includes("/entities/")) return r.fulfill({ json: [] });
  return r.fulfill({ json: {} });
});
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(String(e).slice(0, 200)));
await page.goto(base + "/staff", { waitUntil: "domcontentloaded" });
await page.waitForTimeout(4500);
const has = (t) => page.getByText(t).first().isVisible().catch(() => false);
const out = {};
out.noCodeScreen = !(await has("Enter your company code"));
out.heroPicksRouteBus = await has("Bus 12 ·") || await page.locator("section[aria-label='Your bus']").getByText("Bus 12").first().isVisible().catch(() => false);
out.heroNotWrongBus = !(await page.locator("section[aria-label='Your bus']").getByText("Bus 99").first().isVisible().catch(() => false));
out.ownCompanyAlert = await has("Bus 12 has arrived at Sandals Royal.");
out.otherCompanyAlertHidden = !(await has("Other Co bus arrived somewhere."));
out.noDeleteAccountOnHome = !(await has("Delete account"));

await page.getByRole("button", { name: /I'm late/ }).click();
await page.waitForTimeout(800);
out.lateSaved = JSON.stringify(writes.filter((w) => w.entity === "me").map((w) => Object.keys(w.body)));
out.lateTileActive = await has("Running late");
await page.getByRole("button", { name: /Skip today/ }).click();
await page.waitForTimeout(800);

await page.getByRole("button", { name: /Chat/ }).first().click();
await page.waitForTimeout(800);
out.chatSheet = await has("Bus 12 chat");
await page.keyboard.press("Escape");
await page.waitForTimeout(500);

await page.getByRole("button", { name: /No badge/ }).click();
await page.waitForTimeout(1500);
out.badgeCode = await has("482913");
await page.keyboard.press("Escape");
await page.waitForTimeout(500);

await page.getByRole("button", { name: /My pickup/ }).click();
await page.waitForTimeout(800);
out.pickupSheet = await page.getByRole("switch", { name: /one stop away/i }).isVisible().catch(() => false);
await page.keyboard.press("Escape");
await page.waitForTimeout(500);

await page.getByRole("button", { name: /^Help/ }).click();
await page.waitForTimeout(800);
out.contactPrefilled = await page.locator("#lost-contact").inputValue().catch(() => "");
await page.locator("#lost-desc").fill("Black umbrella");
await page.getByRole("button", { name: "Send report" }).click();
await page.waitForTimeout(1000);
const lost = writes.filter((w) => w.entity === "LostItemReport" || w.entity === "Broadcast");
out.lostItemWentTo = lost.map((w) => w.entity).join(",");
out.lostItemCompany = lost[0]?.body?.company_id;
out.errors = errors.length ? errors : "none";
for (const [k, v] of Object.entries(out)) console.log(k.padEnd(24), v);
await browser.close();
