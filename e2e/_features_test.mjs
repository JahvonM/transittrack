// Smoke-tests the Batch F screens against mocked data.
import { chromium } from "@playwright/test";
const base = process.argv[2] || "http://localhost:4173";
const now = Date.now();
const iso = (msAgo) => new Date(now - msAgo).toISOString();

const company = { id: "c1", name: "Island Transit Co.", access_code: "ABC123", phone: "+1 555 0100" };
const route = { id: "r1", name: "Loop", company_id: "c1", active: true, stops: [{ name: "Hotel A", lat: 18.0, lng: -76.8 }, { name: "Hotel B", lat: 18.01, lng: -76.79 }] };
const vehicles = [
  { id: "v1", name: "Bus 1", plate_number: "ISL-1", company_id: "c1", company_name: "Island Transit Co.", capacity: 10, current_lat: 18.0, current_lng: -76.8, tracking_active: true, status: "on_trip", route_id: "r1", driver_name: "Dee", last_location_update: iso(1000) },
  { id: "v2", name: "Bus 2", plate_number: "ISL-2", company_id: "c1", company_name: "Island Transit Co.", capacity: 4, current_lat: 18.005, current_lng: -76.795, tracking_active: true, status: "on_trip", driver_name: "Jo", last_location_update: iso(1000) },
];
const checkIns = [
  ...Array.from({ length: 2 }, (_, i) => ({ id: "a" + i, vehicle_id: "v1", staff_name: "P" + i, status: "boarded", company_id: "c1", created_date: iso(60000) })),
  ...Array.from({ length: 4 }, (_, i) => ({ id: "b" + i, vehicle_id: "v2", staff_name: "Q" + i, status: "boarded", company_id: "c1", created_date: iso(60000) })),
];
const shifts = [
  { id: "s1", driver_name: "Dee", driver_email: "dee@x.com", vehicle_name: "Bus 1", started_at: iso(3 * 3600e3), ended_at: iso(3600e3), duration_minutes: 120 },
  { id: "s2", driver_name: "Jo", vehicle_name: "Bus 2", started_at: iso(30 * 60e3) },
];
const audit = [{ id: "l1", action: "update", entity: "Vehicle", record_id: "v1", summary: "Bus 1", actor_name: "Ana Admin", actor_role: "admin", changes: JSON.stringify({ driver_pin: "••••", capacity: 10 }), created_date: iso(5000) }];

async function run(role, path, extraInit, check) {
  const user = { id: "u1", email: "qa@example.com", full_name: "QA User", role, company_id: "c1" };
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await ctx.addInitScript((extra) => {
    localStorage.setItem("base44_access_token", "fake"); localStorage.setItem("token", "fake");
    for (const [k, v] of Object.entries(extra || {})) localStorage.setItem(k, v);
  }, extraInit);
  const calls = [];
  await ctx.route("**/api/**", async (r) => {
    const req = r.request(); const url = req.url();
    if (url.includes("public-settings")) return r.continue();
    if (url.includes("/entities/User/me")) {
      if (req.method() !== "GET") { calls.push({ updateMe: req.postDataJSON() }); return r.fulfill({ json: user }); }
      return r.fulfill({ json: user });
    }
    if (url.includes("/functions/")) {
      let body = {}; try { body = req.postDataJSON(); } catch { /* none */ }
      calls.push({ fn: body.action });
      if (body.action === "start_shift") return r.fulfill({ json: { shift: { id: "sx", started_at: new Date().toISOString() } } });
      if (body.action === "end_shift") return r.fulfill({ json: { shift: { id: "sx", duration_minutes: 95 } } });
      return r.fulfill({ json: { vehicle: vehicles[0], driver_name: "Dee", driver_pin: "", company_id: "c1", company_name: "Co", staff: [], route, broadcasts: [], check_ins: [], group_messages: [], trips: [], open_shift: null } });
    }
    if (req.method() !== "GET") return r.fulfill({ json: { id: "new" } });
    if (url.includes("/entities/Company")) return r.fulfill({ json: [company] });
    if (url.includes("/entities/Vehicle")) return r.fulfill({ json: vehicles });
    if (url.includes("/entities/Route")) return r.fulfill({ json: [route] });
    if (url.includes("/entities/StaffCheckIn")) return r.fulfill({ json: checkIns });
    if (url.includes("/entities/DriverShift")) return r.fulfill({ json: shifts });
    if (url.includes("/entities/AuditLog")) return r.fulfill({ json: audit });
    if (url.includes("/entities/")) return r.fulfill({ json: [] });
    return r.fulfill({ json: {} });
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e).slice(0, 200)));
  await page.goto(base + path, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(3500);
  const out = await check(page, calls);
  console.log(`== [${role}] ${path}:`, JSON.stringify(out), "| errors:", errors.length ? errors : "none");
  await browser.close();
}

const has = (page, text) => page.getByText(text).first().isVisible().catch(() => false);

await run("admin", "/admin/shifts", {}, async (page) => ({
  title: await has(page, "Driver shifts"),
  deeHours: await has(page, "2.0 h"),
  onShift: await has(page, "On shift"),
}));

await run("admin", "/admin/audit", {}, async (page) => {
  const row = { title: await has(page, "Change history"), row: await has(page, "Ana Admin (admin)") };
  await page.getByText("Ana Admin (admin)").first().click().catch(() => {});
  row.pinHidden = await has(page, "••••");
  return row;
});

await run("user", "/staff", { tt_company_code: "ABC123", tt_staff_pickup: "Hotel B" }, async (page, calls) => {
  const r = {
    seats: await has(page, "Seats available"),
    full: await has(page, "Full"),
    toggle: await page.getByRole("switch", { name: /one stop away/i }).isVisible().catch(() => false),
  };
  await page.getByRole("switch", { name: /one stop away/i }).click().catch(() => {});
  await page.waitForTimeout(1500);
  r.savedToAccount = JSON.stringify(calls.filter((c) => c.updateMe));
  return r;
});

await run("user", "/driver/track", { tt_driver_device_id: "d1", tt_driver_unlock_date: new Date().toISOString().slice(0, 10) }, async (page, calls) => {
  const r = { offShift: await has(page, "Off shift") };
  await page.getByRole("button", { name: /start shift/i }).click().catch(() => {});
  await page.waitForTimeout(1200);
  r.onShift = await has(page, /On shift/);
  await page.getByRole("button", { name: /end shift/i }).click().catch(() => {});
  await page.getByRole("button", { name: /^end shift$/i }).last().click().catch(() => {});
  await page.waitForTimeout(1200);
  r.loggedToast = await has(page, "Logged 1h 35m.");
  r.fnCalls = calls.filter((c) => c.fn && c.fn !== "heartbeat").map((c) => c.fn);
  return r;
});
