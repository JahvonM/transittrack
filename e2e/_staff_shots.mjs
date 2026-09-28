// Full-page phone screenshots of the staff app with realistic mocked data.
import { chromium } from "@playwright/test";
import fs from "node:fs";
const base = process.argv[2] || "http://localhost:4173";
const now = Date.now();
const iso = (ago) => new Date(now - ago).toISOString();
const company = { id: "c1", name: "Island Transit Co.", access_code: "ABC123", phone: "+18765550100" };
const route = { id: "r1", name: "Hotel loop", company_id: "c1", active: true, stops: [
  { name: "Sandals Royal", lat: 18.47, lng: -77.92 }, { name: "Hotel Riu", lat: 18.48, lng: -77.94 }, { name: "Staff Village", lat: 18.49, lng: -77.96 }] };
const vehicles = [
  { id: "v1", name: "Bus 12", plate_number: "PE 4512", company_id: "c1", company_name: "Island Transit Co.", capacity: 30, current_lat: 18.472, current_lng: -77.925, speed: 9, tracking_active: true, status: "on_trip", route_id: "r1", driver_name: "Marcus", last_location_update: iso(20e3) },
  { id: "v2", name: "Bus 7", plate_number: "PE 1107", company_id: "c1", company_name: "Island Transit Co.", capacity: 14, current_lat: 18.5, current_lng: -77.99, tracking_active: false, status: "idle", driver_name: "Andre", last_location_update: iso(3 * 3600e3) },
];
const checkIns = Array.from({ length: 21 }, (_, i) => ({ id: "c" + i, vehicle_id: "v1", staff_name: "S" + i, status: "boarded", company_id: "c1", created_date: iso(600e3) }));
const trips = [{ id: "t1", company_id: "c1", pickup_name: "Hotel Riu", dropoff_name: "Airport", status: "on_the_way", scheduled_time: iso(-1800e3), vehicle_name: "Bus 12", plate_number: "PE 4512", driver_name: "Marcus", passenger_name: "Guest party of 3" }];
const broadcasts = [{ id: "b1", type: "bus_arrived", message: "Bus 12 has arrived at Sandals Royal.", vehicle_name: "Bus 12", driver_name: "Marcus", created_date: iso(300e3) }];
const messages = [
  { id: "m1", vehicle_id: "v1", channel: "staff", sender_role: "driver", sender_name: "Marcus", text: "Leaving Sandals now, 5 min to Riu", created_date: iso(240e3) },
  { id: "m2", vehicle_id: "v1", channel: "staff", sender_role: "staff", sender_name: "Tanya", text: "Thanks! Please wait 1 min at Riu", created_date: iso(200e3) },
];
const user = { id: "u1", email: "tanya@example.com", full_name: "Tanya Brown", role: "staff", company_id: "c1" };

const scenario = process.argv[3] || "pickup";
fs.mkdirSync("/tmp/shots", { recursive: true });
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
await ctx.addInitScript((sc) => {
  localStorage.setItem("base44_access_token", "fake"); localStorage.setItem("token", "fake");
  localStorage.setItem("tt_company_code", "ABC123");
  localStorage.setItem("tt_staff_chat_name", "Tanya");
  if (sc === "pickup") localStorage.setItem("tt_staff_pickup", "Hotel Riu");
}, scenario);
await ctx.route("**/api/**", async (r) => {
  const req = r.request(); const url = req.url();
  if (url.includes("public-settings")) return r.continue();
  if (url.includes("/entities/User/me")) return r.fulfill({ json: user });
  if (req.method() !== "GET") return r.fulfill({ json: { id: "new" } });
  if (url.includes("/entities/Company")) return r.fulfill({ json: [company] });
  if (url.includes("/entities/Vehicle")) return r.fulfill({ json: vehicles });
  if (url.includes("/entities/Route")) return r.fulfill({ json: [route] });
  if (url.includes("/entities/Trip")) return r.fulfill({ json: trips });
  if (url.includes("/entities/StaffCheckIn")) return r.fulfill({ json: checkIns });
  if (url.includes("/entities/Broadcast")) return r.fulfill({ json: broadcasts });
  if (url.includes("/entities/GroupMessage")) return r.fulfill({ json: messages });
  if (url.includes("/entities/")) return r.fulfill({ json: [] });
  return r.fulfill({ json: {} });
});
const page = await ctx.newPage();
await page.goto(base + "/staff", { waitUntil: "domcontentloaded" });
await page.waitForTimeout(5000);
const h = await page.evaluate(() => document.documentElement.scrollHeight);
console.log("page height px:", h, "=", (h / 844).toFixed(1), "phone screens");
// Section order as a user scrolls
const order = await page.evaluate(() => {
  const out = [];
  document.querySelectorAll("main h2, main h3, main [class*=CardTitle], main .font-semibold, main button, main p.text-sm.font-medium").forEach((el) => {
    const t = (el.innerText || "").trim().split("\n")[0];
    if (t && t.length < 70) out.push(Math.round(el.getBoundingClientRect().top + window.scrollY) + "  " + t);
  });
  return [...new Set(out)];
});
console.log(order.join("\n"));
await page.screenshot({ path: `/tmp/shots/staff_${scenario}.png`, fullPage: true });
await browser.close();
