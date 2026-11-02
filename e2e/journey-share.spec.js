import { test, expect } from "@playwright/test";
import { fleetData, mockFleet } from "./helpers/fleetFixture.js";

// Journey sharing: the passenger makes and stops a private link on Journey, and
// the public page shows only their own ride (the bus only while on board).

test("a passenger shares their journey from the Journey screen and can stop it", async ({ page }) => {
  const data = fleetData();
  const s = await mockFleet(page, { role: "staff", data });
  await page.setViewportSize({ width: 390, height: 844 });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/journey");
  const row = page.getByRole("button", { name: /Share my journey/ });
  await expect(row).toBeVisible();
  await row.click();
  await expect(page.getByText(/Link copied|Your journey link|Journey shared/).first()).toBeVisible();
  await expect(page.getByRole("button", { name: /Sharing your journey/ })).toBeVisible();
  expect(s.calls.some((c) => c.fn === "journeyShare" && c.body?.action === "start")).toBe(true);
  await page.getByRole("button", { name: /Sharing your journey/ }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Stop sharing" }).click();
  await expect(page.getByRole("button", { name: /Share my journey/ })).toBeVisible();
  expect(s.calls.some((c) => c.fn === "journeyShare" && c.body?.action === "stop")).toBe(true);
  expect(errors).toEqual([]);
});

async function viewer(page, reply) {
  await page.route("https://api.mapbox.com/**", (r) => r.fulfill({ status: 404, body: "" }));
  await page.route("**/api/**", async (route) => {
    const url = route.request().url();
    if (url.includes("/functions/journeyShare")) return typeof reply === "function" ? reply(route) : route.fulfill({ json: reply });
    if (url.includes("/entities/") || url.includes("/functions/")) return route.fulfill({ status: 401, json: { error: "Sign in required" } });
    return route.fulfill({ json: { id: "test-app", public_settings: { authentication_required: false } } });
  });
  await page.setViewportSize({ width: 390, height: 844 });
}
const KEY = "a".repeat(64);

test("the shared page shows the passenger on board, with no sign-in", async ({ page }) => {
  await viewer(page, { state: "on_board", since: new Date(Date.now() - 600e3).toISOString(), first_name: "Jane", vehicle_name: "Bus 12", plate_number: "HA 1234", heading: "Main office", location: { lat: 12.05, lng: -61.75, updated_at: new Date().toISOString() }, location_status: "live", expires_at: new Date(Date.now() + 3600e3).toISOString() });
  await page.goto("/share#j=" + KEY);
  await expect(page.getByRole("heading", { name: "Jane is on Bus 12" })).toBeVisible();
  await expect(page.getByText("Heading to", { exact: true })).toBeVisible();
  await expect(page.getByText("Main office", { exact: true })).toBeVisible();
  await expect(page.getByText(/Bus position from/)).toBeVisible();
  await expect(page).toHaveURL(/\/share/);
  await page.screenshot({ path: "/tmp/tt-share.png" });
});

test("before boarding there's no map; after getting off it says the journey ended", async ({ page }) => {
  let state = "waiting";
  await viewer(page, (route) => route.fulfill({ json: { state, first_name: "Jane", vehicle_name: "Bus 12", heading: "Home", location: null, location_status: "not_sharing", ended_at: state === "ended" ? new Date().toISOString() : null } }));
  await page.goto("/share#j=" + KEY);
  await expect(page.getByRole("heading", { name: "Jane hasn't boarded yet" })).toBeVisible();
  await expect(page.getByText(/Bus position from/)).toHaveCount(0);
  state = "ended";
  await page.reload();
  await expect(page.getByRole("heading", { name: "Jane got off Bus 12" })).toBeVisible();
});

test("an ended or wrong link says so", async ({ page }) => {
  await viewer(page, (route) => route.fulfill({ status: 404, json: { error: "This journey link has ended or isn’t valid." } }));
  await page.goto("/share#j=" + KEY);
  await expect(page.getByRole("heading", { name: "This journey link has ended" })).toBeVisible();
  await page.goto("/share");
  await expect(page.getByRole("heading", { name: "This journey link has ended" })).toBeVisible();
});
