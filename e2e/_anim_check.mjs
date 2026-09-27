import { chromium } from "@playwright/test";
const base = "https://eager-transit-track-go.base44.app";
const route = { id: "r1", name: "R4 Harbour loop", company_id: "c1", stops: [
  { name: "Depot", lat: 12.040, lng: -61.760, order: 0 },
  { name: "Market St", lat: 12.050, lng: -61.750, order: 1 },
  { name: "Bay St", lat: 12.060, lng: -61.740, order: 2 },
  { name: "Palm Ave", lat: 12.070, lng: -61.730, order: 3 },
] };
const vehicles = [{ id: "v1", name: "Bus 12", status: "on_trip", type: "bus", route_id: "r1", company_id: "c1", current_lat: 12.052, current_lng: -61.748 }];

const b = await chromium.launch();
async function page(path, withData) {
  const ctx = await b.newContext({ viewport: { width: 1100, height: 900 } });
  await ctx.addInitScript(() => { localStorage.setItem("base44_access_token", "fake"); localStorage.setItem("token", "fake"); });
  await ctx.route("**/api/**", (r) => {
    const u = r.request().url();
    if (u.includes("public-settings")) return r.continue();
    if (u.includes("/entities/User/me")) return r.fulfill({ json: { id: "u1", email: "qa@example.com", full_name: "QA", role: "admin", company_id: "c1" } });
    if (withData && u.includes("/entities/Vehicle")) return r.fulfill({ json: vehicles });
    if (withData && u.includes("/entities/Route")) return r.fulfill({ json: [route] });
    if (withData && /\/entities\/Company(\/|\?|$)/.test(u)) return r.fulfill({ json: [{ id: "c1", name: "Island Transit Co.", access_code: "ABC" }] });
    if (u.includes("/entities/")) return r.fulfill({ json: [] });
    return r.fulfill({ json: {} });
  });
  const p = await ctx.newPage();
  const errs = [];
  p.on("pageerror", (e) => errs.push(String(e).slice(0, 200)));
  await p.goto(base + path, { waitUntil: "domcontentloaded" }).catch(() => {});
  await p.waitForTimeout(6000);
  return { p, ctx, errs };
}

let { p, ctx, errs } = await page("/admin", true);
console.log("admin: countups", await p.locator(".text-2xl .tabular-nums").count(), "| drawn lines", await p.locator("path.tt-draw").count(), "| errors", errs);
await ctx.close();

({ p, ctx, errs } = await page("/admin/billing", false));
console.log("admin/billing empty state bus:", await p.locator("svg ellipse").count() > 0, "| text:", (await p.locator("text=No completed trips yet.").count()), "| errors", errs);
await ctx.close();

({ p, ctx, errs } = await page("/", false));
console.log("welcome/home driving scene:", await p.locator(".tt-sky-scroll").count(), "| page fade", await p.locator(".tt-page-in").count(), "| errors", errs);
await ctx.close();

({ p, ctx, errs } = await page("/admin/fleet", true));
const btn = p.getByRole("button", { name: /route explorer/i });
console.log("route explorer button:", await btn.count());
if (await btn.count()) {
  await btn.first().click();
  await p.waitForTimeout(1500);
  console.log("trip progress 'Next:'", await p.locator("text=/Next: /").count(), "| moving bus", await p.locator('[role="dialog"] .tt-wheel-spin').count());
}
console.log("errors", errs);
await ctx.close();
await b.close();
