import { test, expect } from "@playwright/test";
import fs from "node:fs";
import { mockFleet } from "./helpers/fleetFixture.js";

// Office displays (/display, /display/pair) in a browser, against a fake
// officeDisplay server. Simulated: no real TV, monitor or tablet camera.
// Screenshots go to SHOTS (docs/office-displays uses them).

const SHOTS = process.env.SHOTS || "";
const TOKEN = "d".repeat(64);
test.use({ timezoneId: "America/Grenada", locale: "en-US" });

function displayServer(overrides = {}) {
  const state = {
    approved: false, blanked: false, ended: false, failing: false, layout: "fleet", rotate: false, rotate_layouts: [],
    theme: "dark", text_size: "large", density: "comfortable", cameras: [], camera_choices: 2, calls: [], ...overrides,
  };
  const feed = () => {
    const now = Date.now(), at = (ms) => new Date(now + ms).toISOString(), MIN = 60_000;
    const display = { id: "d1", name: "Office TV", kind: "paired", layout: state.layout, rotate: state.rotate, rotate_layouts: state.rotate_layouts, rotate_seconds: 60,
      theme: state.theme, text_size: state.text_size, density: state.density, blanked: state.blanked, show_driver_names: true, show_client_names: true, show_guest_names: false };
    const head = { display, access_until: at(30 * 86_400_000), generated_at: at(0), next_feed_ms: 15_000, blanked: state.blanked };
    if (state.blanked) return head;
    return {
      ...head, unavailable: [],
      companies: [{ id: "a", name: "Mc Sween's Transport", logo_url: "" }],
      vehicles: [
        { id: "v1", name: "Bus 1", plate_number: "HB 211", company_id: "a", type: "bus", status: "on_trip", in_service: true, current_lat: 12.0526, current_lng: -61.7516, last_location_update: at(-20_000), tracking_active: true, driver_name: "Kevin Charles" },
        { id: "v2", name: "Bus 2", plate_number: "HB 305", company_id: "a", type: "bus", status: "idle", in_service: true, current_lat: 12.0221, current_lng: -61.7605, last_location_update: at(-18 * MIN), tracking_active: false, driver_name: "" },
        { id: "v3", name: "Bus 3", plate_number: "HB 412", company_id: "a", type: "bus", status: "emergency", in_service: true, current_lat: 12.0389, current_lng: -61.7402, last_location_update: at(-30_000), tracking_active: true, driver_name: "Marcia Phillip" },
        { id: "v4", name: "Bus 4", plate_number: "HB 518", company_id: "a", type: "bus", status: "offline", in_service: false, current_lat: null, current_lng: null, last_location_update: null, tracking_active: false, driver_name: "" },
        { id: "v5", name: "Bus 5", plate_number: "HB 620", company_id: "a", type: "bus", status: "on_trip", in_service: true, current_lat: 12.0045, current_lng: -61.7862, last_location_update: at(-40_000), tracking_active: true, driver_name: "Andre Mitchell" },
      ],
      tablets: [
        { id: "k1", vehicle_id: "v1", kiosk_type: "bus_boarding", label: "Boarding tablet", paired: true, status: "active", last_seen: at(-MIN), helper_health: { battery: 88, charging: true } },
        { id: "k2", vehicle_id: "v1", kiosk_type: "driver", label: "Driver tablet", paired: true, status: "active", last_seen: at(-MIN), helper_health: { battery: 70, charging: true } },
        { id: "k3", vehicle_id: "v2", kiosk_type: "driver", label: "Driver tablet", paired: true, status: "active", last_seen: at(-50 * MIN), helper_health: { battery: 14, charging: false } },
      ],
      on_board: { v1: 7 },
      shifts: [{ vehicle_id: "v1", started_at: at(-3 * 3_600_000), driver_name: "Kevin Charles" }, { vehicle_id: "v2", started_at: at(-3_600_000), driver_name: "Andre Mitchell" }],
      jobs: [
        { id: "j1", kind: "Airport pickup", status: "scheduled", scheduled_time: at(-25 * MIN), vehicle_id: "v2", vehicle_name: "Bus 2", driver_name: "Andre Mitchell", pickup_name: "Maurice Bishop Airport", dropoff_name: "Spice Island Beach Resort", guests: 4, flight_number: "BW 425", pickup_confirmed: false, dropoff_confirmed: false, client_name: "Spice Island Beach Resort", guest_name: "", past_time_not_started: true },
        { id: "j2", kind: "Transfer", status: "on_the_way", scheduled_time: at(-10 * MIN), vehicle_id: "v1", vehicle_name: "Bus 1", driver_name: "Kevin Charles", pickup_name: "Coyaba Beach Resort", dropoff_name: "St. George's", guests: 12, flight_number: "", pickup_confirmed: true, dropoff_confirmed: false, client_name: "Coyaba", guest_name: "", past_time_not_started: false },
        { id: "j3", kind: "Staff run", status: "arrived", scheduled_time: at(-3 * MIN), vehicle_id: "v5", vehicle_name: "Bus 5", driver_name: "Andre Mitchell", pickup_name: "Grand Anse", dropoff_name: "True Blue", guests: null, flight_number: "", pickup_confirmed: false, dropoff_confirmed: false, client_name: "", guest_name: "", past_time_not_started: false },
        ...[30, 55, 80, 120, 150, 190, 240, 300].map((m, i) => ({ id: `n${i}`, kind: i % 2 ? "Airport drop-off" : "Tour", status: "scheduled", scheduled_time: at(m * MIN), vehicle_id: i % 3 ? "v5" : "", vehicle_name: i % 3 ? "Bus 5" : "", driver_name: "", pickup_name: i % 2 ? "Sandals Grenada" : "Calabash Hotel", dropoff_name: i % 2 ? "Maurice Bishop Airport" : "Grand Etang", guests: 2 + i, flight_number: i % 2 ? "AA 1240" : "", pickup_confirmed: false, dropoff_confirmed: false, client_name: "", guest_name: "", past_time_not_started: false })),
        { id: "j9", kind: "Transfer", status: "completed", scheduled_time: at(-4 * 3_600_000), vehicle_id: "v1", vehicle_name: "Bus 1", pickup_name: "Airport", dropoff_name: "Hotel", past_time_not_started: false },
      ],
      exceptions: [
        { kind: "no_show", label: "Not at pickup", vehicle_id: "v1", vehicle_name: "Bus 1", at: at(-25 * MIN), person: "" },
        { kind: "got_on", label: "Got on (recorded by driver)", vehicle_id: "v5", vehicle_name: "Bus 5", at: at(-50 * MIN), person: "" },
      ],
      maintenance: {
        faults: [
          { id: "f1", vehicle_id: "v3", vehicle_name: "Bus 3", title: "Rear brake light out", severity: "high", status: "open", repair_required: true },
          { id: "f2", vehicle_id: "v2", vehicle_name: "Bus 2", title: "Air conditioning weak", severity: "medium", status: "in_progress", repair_required: false },
          { id: "f3", vehicle_id: "v5", vehicle_name: "Bus 5", title: "Seat belt stiff, row 4", severity: "low", status: "open", repair_required: false },
        ],
        due: [{ id: "m1", vehicle_id: "v4", vehicle_name: "Bus 4", service_type: "Oil and filter change", status: "overdue", last_service_date: at(-120 * 86_400_000) }, { id: "m2", vehicle_id: "v1", vehicle_name: "Bus 1", service_type: "Tyre rotation", status: "due", last_service_date: at(-90 * 86_400_000) }],
        failed_inspections: [{ id: "i1", vehicle_id: "v3", vehicle_name: "Bus 3", date: at(-86_400_000), needs_service: true }],
        unavailable: [{ id: "v4", name: "Bus 4" }],
      },
      ...(state.layout === "cameras" ? { cameras: state.cameras, camera_choices: state.camera_choices } : {}),
    };
  };
  return {
    state,
    handle(body) {
      state.calls.push(body.action);
      if (body.action === "pair_start") return { status: 200, json: { code: "K7Q4MZ", poll_secret: "p".repeat(64), expires_at: new Date(Date.now() + 10 * 60_000).toISOString() } };
      if (body.action === "pair_poll") return state.approved ? { status: 200, json: { status: "paired", display_token: TOKEN } } : { status: 200, json: { status: "waiting" } };
      if (body.display_token !== TOKEN || state.ended) return { status: 401, json: { error: "This screen is no longer connected. Set it up again from Office displays.", code: "access_ended" } };
      if (state.failing) return { status: 503, json: { error: "Office displays are unavailable right now." } };
      if (body.action === "feed") return { status: 200, json: feed() };
      if (body.action === "camera_status") return { status: 200, json: { cameras: state.cameras } };
      if (body.action === "camera_end") return { status: 200, json: { ok: true } };
      return { status: 400, json: { error: "Invalid request" } };
    },
  };
}

async function open(page, server, { path = "/display", stored = true, bridge = false } = {}) {
  await mockFleet(page, { signedIn: false });
  await page.route("**/functions/officeDisplay", async (route) => {
    const { status, json } = server.handle(route.request().postDataJSON());
    await route.fulfill({ status, json });
  });
  if (stored) await page.addInitScript((t) => localStorage.setItem("tt-office-display-v1", JSON.stringify({ token: t, at: Date.now() })), TOKEN);
  if (bridge) await page.addInitScript((t) => { window.transittrackDisplay = { credential: async () => t }; }, TOKEN);
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(path);
  return errors;
}

// Nothing cut off: every row the lists show sits wholly inside its list, and
// the page itself never scrolls.
async function fits(page) {
  return page.evaluate(() => {
    const doc = document.documentElement;
    if (doc.scrollHeight > innerHeight + 1 || doc.scrollWidth > innerWidth + 1) return "page scrolls";
    const root = document.querySelector(".tt-display-root");
    if (root.scrollHeight > root.clientHeight + 1) return "display overflows";
    for (const ul of root.querySelectorAll("ul")) {
      const box = ul.getBoundingClientRect();
      for (const li of ul.children) {
        if (li.classList.contains("invisible")) continue;
        const r = li.getBoundingClientRect();
        if (r.bottom > box.bottom + 1 || r.right > box.right + 1) return `row cut off: ${li.textContent.slice(0, 40)}`;
      }
    }
    for (const section of root.querySelectorAll("section")) {
      const r = section.getBoundingClientRect();
      if (r.bottom > innerHeight + 1 || r.right > innerWidth + 1) return `panel off screen: ${section.getAttribute("aria-label")}`;
    }
    return "ok";
  });
}
const shot = (page, name) => (SHOTS ? page.screenshot({ path: `${SHOTS}/${name}.png` }) : null);
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });

test("a TV pairs with a code, then shows the fleet overview", async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  const server = displayServer();
  const errors = await open(page, server, { path: "/display/pair", stored: false });
  await expect(page.getByText("K7Q4MZ")).toBeVisible();
  await expect(page.getByText("Admin → Office displays")).toBeVisible();
  await shot(page, "pair-code");
  server.state.approved = true;
  await expect(page.getByRole("heading", { name: "Buses" })).toBeVisible({ timeout: 15_000 });
  await expect(page).toHaveURL(/\/display$/);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("tt-office-display-v1")).token)).toBe(TOKEN);
  await expect(page.getByText("Fleet overview")).toBeVisible();
  await expect(page.getByText("Bus 3: SOS from the driver")).toBeVisible();
  await expect(page.getByText("7 on board")).toBeVisible();
  await expect(page.getByText("1 job is past its time and not started")).toBeVisible();
  expect(errors).toEqual([]);
});

for (const view of [{ width: 1920, height: 1080, name: "1080p" }, { width: 3840, height: 2160, name: "4k" }, { width: 1280, height: 720, name: "1080p-150pct" }]) {
  test(`all four layouts fit a ${view.name} screen without scrolling or cut-off rows`, async ({ page }) => {
    await page.setViewportSize({ width: view.width, height: view.height });
    for (const layout of ["fleet", "dispatch", "maintenance", "cameras"]) {
      const server = displayServer({ layout });
      const errors = await open(page, server);
      await expect(page.getByRole("heading", { name: { fleet: "Buses", dispatch: "Under way", maintenance: "Open faults", cameras: "No camera view running" }[layout] })).toBeVisible();
      await page.waitForTimeout(300);
      expect(await fits(page), layout).toBe("ok");
      expect(errors, layout).toEqual([]);
      if (view.name !== "1080p-150pct") await shot(page, `${layout}-${view.name}`);
      await page.unrouteAll({ behavior: "ignoreErrors" });
    }
  });
}

test("dispatch board states facts and keeps personal details out", async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await open(page, displayServer({ layout: "dispatch" }));
  await expect(page.getByRole("heading", { name: "Past time, not started" })).toBeVisible();
  await expect(page.getByText("25 min past")).toBeVisible();
  await expect(page.getByText("Picked up, heading to drop-off")).toBeVisible();
  await expect(page.getByText("No bus assigned").first()).toBeVisible();
  await expect(page.getByText(/more not shown/)).toBeVisible();
  await expect(page.locator("body")).not.toContainText(/\bETA\b|minutes late|occupancy/i);
});

test("rotation steps through approved layouts and can be paused", async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await open(page, displayServer({ rotate: true, rotate_layouts: ["fleet", "dispatch", "maintenance"] }));
  await expect(page.getByText("Fleet overview")).toBeVisible();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByText("Dispatch board")).toBeVisible();
  await page.keyboard.press(" ");
  await expect(page.getByRole("button", { name: "Resume rotation" })).toBeVisible();
  await page.getByRole("button", { name: "Resume rotation" }).click();
  await expect(page.getByRole("button", { name: "Pause rotation" })).toBeVisible();
});

test("says when it stops updating, hides old content after 15 minutes, and recovers", async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.clock.install();
  // The dispatch board (no map) keeps this about the connection, not map tiles.
  const server = displayServer({ layout: "dispatch" });
  await open(page, server);
  await expect(page.getByRole("heading", { name: "Under way" })).toBeVisible();
  server.state.failing = true;
  await page.clock.fastForward("01:30");
  await expect(page.getByText(/Not updating\. Showing the last update from/)).toBeVisible();
  await shot(page, "not-updating");
  await page.clock.fastForward("15:00");
  await expect(page.getByRole("heading", { name: "Connection lost" })).toBeVisible();
  await expect(page.locator("body")).not.toContainText("Coyaba");
  server.state.failing = false;
  await page.clock.fastForward("01:05");
  await expect(page.getByRole("heading", { name: "Under way" })).toBeVisible();
  await expect(page.getByText(/Updated/)).toBeVisible();
});

test("clears the screen and forgets its credential when access ends", async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  const server = displayServer();
  await open(page, server);
  await expect(page.getByRole("heading", { name: "Buses" })).toBeVisible();
  server.state.ended = true;
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(page.getByRole("heading", { name: "This screen is no longer connected" })).toBeVisible();
  await expect(page.locator("body")).not.toContainText("Bus 1");
  expect(await page.evaluate(() => localStorage.getItem("tt-office-display-v1"))).toBeNull();
  await expect(page.getByRole("button", { name: "Pair this screen again" })).toBeVisible();
});

test("a blanked screen shows nothing from the fleet", async ({ page }) => {
  await open(page, displayServer({ blanked: true }));
  await expect(page.getByText("Paused from Office displays")).toBeVisible();
  await expect(page.locator("body")).not.toContainText("Bus 1");
});

test("camera panels wait, end at the end time, and never start a view themselves", async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  const soon = new Date(Date.now() + 10 * 60_000).toISOString();
  const server = displayServer({ layout: "cameras", cameras: [
    { session_id: "s1", device_id: "k2", state: "requested", expires_at: soon, offer_ready: false, answered: false },
    { session_id: "s2", device_id: "k3", state: "expired", expires_at: new Date(Date.now() - 1000).toISOString(), offer_ready: false, answered: false },
  ] });
  await open(page, server);
  await expect(page.getByText("Waiting for the tablet to check in…")).toBeVisible();
  await expect(page.locator("figure").filter({ hasText: "Viewing session ended" })).toHaveCount(1);
  await expect(page.getByText(/Ends .* · 10 min/)).toBeVisible();
  await shot(page, "cameras-waiting");
  server.state.cameras = server.state.cameras.map((c) => ({ ...c, state: "expired" }));
  await expect(page.locator("figure").filter({ hasText: "Viewing session ended" })).toHaveCount(2, { timeout: 10_000 });
  expect(server.state.calls).not.toContain("camera_viewer");
  expect(server.state.calls).not.toContain("camera_start");
});

test("a Windows display window uses the app's bridge, not stored sign-ins", async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await open(page, displayServer(), { stored: false, bridge: true });
  await expect(page.getByRole("heading", { name: "Buses" })).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem("tt-office-display-v1"))).toBeNull();
  expect(await page.evaluate(() => typeof window.__ttDisplayClose)).toBe("function");
});

test("light theme and extra-large text", async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await open(page, displayServer({ theme: "light", text_size: "xlarge", layout: "maintenance" }));
  await expect(page.getByRole("heading", { name: "Open faults" })).toBeVisible();
  await expect(page.locator(".tt-display-root")).toHaveClass(/\blight\b/);
  expect(await page.evaluate(() => parseFloat(document.documentElement.style.fontSize))).toBeGreaterThan(24);
  expect(await fits(page)).toBe("ok");
  await shot(page, "maintenance-light-xlarge");
});

test("a screen with no credential offers pairing", async ({ page }) => {
  await open(page, displayServer(), { stored: false });
  await expect(page.getByRole("heading", { name: "This screen isn't set up yet" })).toBeVisible();
  await page.getByRole("button", { name: "Pair this screen" }).click();
  await expect(page.getByText("K7Q4MZ")).toBeVisible();
});
