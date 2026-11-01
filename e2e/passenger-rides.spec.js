import { test, expect } from "@playwright/test";
import { mockFleet } from "./helpers/fleetFixture.js";

// The passenger's four sections (Home, My rides, My pass, More) and the
// personal rides screen that replaced the link to the admin bookings page.

const iso = (msAgo) => new Date(Date.now() - msAgo).toISOString();

async function passenger(page, events = []) {
  const session = await mockFleet(page, { role: "staff" });
  await page.route("**/functions/passengerAccount", (r) => {
    const body = r.request().postDataJSON();
    if (body?.action === "rides") return r.fulfill({ json: { events } });
    return r.fulfill({ json: { card: { issued: true, active: true, status: "Active" }, history: [] } });
  });
  await page.setViewportSize({ width: 390, height: 844 });
  return session;
}

test("My rides shows today's regular rides and completed rides, newest first", async ({ page }) => {
  await passenger(page, [
    { id: "1", status: "boarded", boarded_at: iso(26 * 3600_000), vehicle_name: "Bus 1" },
    { id: "2", status: "off_board", boarded_at: iso(25.5 * 3600_000), vehicle_name: "Bus 1" },
    // A repeated tap is the same ride.
    { id: "3", status: "boarded", boarded_at: iso(3 * 3600_000), vehicle_name: "Bus 1" },
    { id: "4", status: "boarded", boarded_at: iso(3 * 3600_000 - 30_000), vehicle_name: "Bus 1" },
    { id: "5", status: "off_board", boarded_at: iso(2.5 * 3600_000), vehicle_name: "Bus 1" },
  ]);
  await page.goto("/staff");
  const nav = page.getByRole("navigation", { name: "Passenger sections" });
  for (const name of ["Home", "My rides", "My pass", "More"]) await expect(nav.getByRole("button", { name, exact: true })).toBeVisible();
  await nav.getByRole("button", { name: "My rides", exact: true }).click();
  await expect(page).toHaveURL(/\/rides$/);
  await expect(page.getByRole("heading", { name: "My rides", level: 1 })).toBeVisible();
  const today = page.getByRole("region", { name: "Today" });
  await expect(today.getByText("To work", { exact: false }).first()).toBeVisible();
  await expect(today.getByText("Scheduled").first()).toBeVisible();
  const done = page.getByRole("region", { name: "Completed" });
  await expect(done.getByRole("listitem")).toHaveCount(2);
  await expect(done.getByRole("listitem").first()).toContainText("Completed");
  // Not travelling today is recorded for both rides, and stays visible.
  await today.getByRole("button", { name: /Skip today/ }).click();
  await expect(page.getByText("Skipping today's pickup").first()).toBeVisible();
  await expect(today.getByText("Not travelling", { exact: true })).toHaveCount(2);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test("My rides explains an empty history and a failed load with a retry", async ({ page }) => {
  await passenger(page, []);
  await page.goto("/rides");
  await expect(page.getByText(/No rides in the last 60 days/)).toBeVisible();
  let fail = true;
  await page.route("**/functions/passengerAccount", (r) => (fail ? r.fulfill({ status: 503, json: { error: "Could not load your card details." } }) : r.fulfill({ json: { events: [] } })));
  await page.goto("/rides");
  await expect(page.getByRole("alert")).toBeVisible();
  fail = false;
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(page.getByText(/No rides in the last 60 days/)).toBeVisible();
});

test("a passenger can't reach admin booking or vehicle tools", async ({ page }) => {
  await passenger(page);
  await page.goto("/more");
  await page.getByText("More tools", { exact: true }).click();
  await expect(page.getByRole("link", { name: /Booked rides/ })).toHaveCount(0);
  for (const path of ["/passenger-bookings", "/vehicle-registry", "/service-history"]) {
    await page.goto(path);
    await expect(page).toHaveURL(/\/staff$/);
    await expect(page.getByRole("combobox", { name: "Assign vehicle" })).toHaveCount(0);
  }
});

test("My pass keeps the QR pass and card controls, with the history moved to My rides", async ({ page }) => {
  await passenger(page);
  await page.goto("/my-card");
  await expect(page.getByRole("heading", { name: "My pass", level: 1 })).toBeVisible();
  await expect(page.getByRole("button", { name: "Report lost card" })).toBeEnabled();
  await page.getByRole("link", { name: /My rides/ }).click();
  await expect(page).toHaveURL(/\/rides$/);
});
