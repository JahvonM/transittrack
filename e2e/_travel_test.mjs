// Learned travel times: Admin -> Travel times page, "Learn now", and the
// passenger home screen using the learned ETA ("Based on N real trips").
import { chromium } from "@playwright/test";
import { learnedEta, legKey, stopKey } from "../src/lib/travelTimes.js";
const base = process.argv[2] || "http://localhost:4173";
const ok = (l, v, extra = "") => console.log((v ? "PASS " : "FAIL ") + l + (extra ? `  [${extra}]` : ""));

const stops = [
  { name: "Sandals Royal", lat: 18.47, lng: -77.92, order: 0 },
  { name: "Hotel Riu", lat: 18.48, lng: -77.94, order: 1 },
  { name: "Staff Village", lat: 18.49, lng: -77.96, order: 2 },
];
const route = { id: "r1", name: "Hotel loop", company_id: "c1", stops };
const learned = {
  id: "t1", route_id: "r1", route_name: "Hotel loop", leg_samples: 16, vehicles_used: 1, learned_at: new Date().toISOString(),
  legs: {
    [legKey(stops[0], stops[1])]: { all: { n: 8, median: 600, p80: 780 }, b: {} },
    [legKey(stops[1], stops[2])]: { all: { n: 8, median: 420, p80: 500 }, b: {} },
  },
  dwells: { [stopKey(stops[1])]: { all: { n: 8, median: 45 }, b: {} } },
};
const bus = { id: "v1", name: "Bus 12", plate_number: "PE 4512", type: "bus", company_id: "c1", capacity: 30, current_lat: 18.4745, current_lng: -77.929, tracking_active: true, status: "on_trip", route_id: "r1", driver_name: "Marcus" };
const expectMin = Math.round(learnedEta({ stats: learned, stops, pos: { lat: bus.current_lat, lng: bus.current_lng }, target: 1 }).seconds / 60);

async function session(role, path, extra = {}) {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: role === "admin" ? 1440 : 390, height: role === "admin" ? 900 : 844 }, geolocation: { latitude: 18.479, longitude: -77.938 }, permissions: ["geolocation"] });
  await ctx.addInitScript(() => { localStorage.setItem("base44_access_token", "fake"); localStorage.setItem("token", "fake"); localStorage.setItem("tt_staff_pickup", "Hotel Riu"); localStorage.setItem("tt_notif_prompt_dismissed", "1"); localStorage.setItem("tt-map-engine", "basic"); });
  await ctx.route("https://api.mapbox.com/**", (r) => r.abort());
  const calls = [];
  await ctx.route("**/api/**", async (r) => {
    const url = r.request().url();
    if (url.includes("public-settings")) return r.continue();
    if (url.includes("/entities/User/me")) return r.fulfill({ json: { id: "u1", email: "a@x.com", full_name: role === "admin" ? "Ana Admin" : "Tanya Brown", role, company_id: "c1" } });
    if (url.includes("/functions/learnTravelTimes")) { calls.push("learn"); return r.fulfill({ json: { ok: true, routes: [{ route: "Hotel loop", legs: 16, pings: 900 }] } }); }
    if (url.includes("/entities/RouteTravelTimes")) return r.fulfill({ json: [learned] });
    if (url.includes("/entities/Route")) return r.fulfill({ json: [route] });
    if (url.includes("/entities/Vehicle")) return r.fulfill({ json: [bus] });
    if (url.includes("/entities/Company")) return r.fulfill({ json: [{ id: "c1", name: "Island Transit Co." }] });
    if (url.includes("/entities/")) return r.fulfill({ json: [] });
    return r.fulfill({ json: {} });
  });
  const page = await ctx.newPage();
  const errs = [];
  page.on("pageerror", (e) => errs.push(String(e).slice(0, 200)));
  await page.goto(base + path);
  return { browser, page, errs, calls, ...extra };
}

// Admin page
{
  const { browser, page, errs, calls } = await session("admin", "/admin/travel-times");
  await page.getByText("ETAs from your own buses").waitFor({ timeout: 20000 });
  ok("sidebar entry", await page.locator("aside").getByRole("button", { name: "Travel times", exact: true }).isVisible());
  ok("route learned badge", await page.getByText("Learned · 2/2 legs").isVisible());
  ok("leg times shown", await page.getByText("10 min").first().isVisible() && await page.getByText("up to 13 min").isVisible());
  ok("wait at stop shown", await page.getByText(/then waits about 45 s at Hotel Riu/).isVisible());
  await page.getByRole("button", { name: /Learn now/ }).click();
  await page.waitForTimeout(1200);
  ok("learn now calls the backend", calls.includes("learn"));
  ok("result toast", await page.getByText(/Hotel loop: 16 stop-to-stop trips/).isVisible().catch(() => false));
  await page.screenshot({ path: "/tmp/shots/travel_admin.png" });
  ok("no page errors (admin) " + JSON.stringify(errs), errs.length === 0);
  await browser.close();
}

// Passenger home
{
  const { browser, page, errs } = await session("staff", "/staff");
  await page.getByText(/real trips on this route/).waitFor({ timeout: 20000 }).catch(() => {});
  const label = await page.getByText(/real trips on this route/).innerText().catch(() => "");
  ok("ETA from real trips", /Based on 8 real trips/.test(label), label);
  const card = await page.getByRole("region", { name: "Your bus" }).innerText().catch(() => "");
  ok(`shows the learned minutes (${expectMin} min)`, new RegExp(`\\b${expectMin}\\s*min`).test(card.replace(/\n/g, " ")), card.replace(/\s+/g, " ").slice(0, 120));
  await page.screenshot({ path: "/tmp/shots/travel_staff.png" });
  ok("no page errors (passenger) " + JSON.stringify(errs), errs.length === 0);
  await browser.close();
}
