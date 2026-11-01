import fs from "node:fs";
import { test, expect } from "@playwright/test";
import { mockFleet } from "./helpers/fleetFixture.js";

// Every address in the app, opened as each kind of account against a small
// realistic fleet. A page passes when it shows no crash screen, throws no
// uncaught error, and doesn't land on "page not found" (unless it should).
// Console errors are written to a report for the audit, not failed on: some
// are expected (a map without a key, a request the test answers with 404).

const ADMIN_SECTIONS = ["overview", "trips", "fleet-workspace", "fleet", "vehicles", "drivers", "health", "kiosks", "shifts", "cards", "card-designs", "vehicle-logs", "driving-reports", "route-analytics", "fleet-analytics", "route-planner", "route-explorer", "plan-pickups", "travel-times", "service", "faults", "parts", "schedule", "calendar", "templates", "inspection-history", "service-history", "incident-reports", "safety-standards", "directory", "signup-day", "checkins", "billing", "messaging", "lost-items", "ads", "ride-history", "passenger-bookings", "support", "users", "companies", "notifications", "app-errors", "audit", "data", "profile"];
const MOVED_TO_ADMIN = ["route-analytics", "fleet-analytics", "vehicle-logs", "driving-reports", "route-planner", "ride-history", "incident-reports", "support", "location-timeline"];

// [path, where it should end up (RegExp) or null to stay]
const ROUTES = {
  public: [["/", null], ["/login", null], ["/register", null], ["/forgot-password", null], ["/reset-password", null], ["/book-taxi", null], ["/track", null], ["/share", null], ["/site", null], ["/site/book", null], ["/site/track", null], ["/privacy", null], ["/terms", null], ["/join", null], ["/reviewer-sandbox", null], ["/tablet", null], ["/kiosk", null], ["/driver", null], ["/staff", /\/login/], ["/admin", /\/login/]],
  admin: [
    ...ADMIN_SECTIONS.map((s) => [`/admin/${s}`, null]),
    ...MOVED_TO_ADMIN.map((s) => [`/${s}`, new RegExp(`/admin/${s}$`)]),
    ["/company", null], ["/manager", null], ["/manager/analytics", null], ["/manager/replay", null], ["/vehicle-registry", null], ["/vehicle/bus-a", null],
    ["/notifications", null], ["/incident-report", null], ["/service-history", null], ["/safety-standards", null], ["/staff-directory", null],
    ["/route-explorer", null], ["/buses", null], ["/passenger-bookings", null], ["/account", null], ["/run-inspection", null], ["/passenger", /\/staff$/],
  ],
  company: [["/vehicle-registry", /\/company$/], ["/passenger-bookings", /\/company$/], ["/service-history", /\/company$/], ["/company", null], ["/company/jobs", null], ["/company/vehicles", null], ["/company/routes", null], ["/company/profile", null], ["/company/ads", /\/company$/], ["/manager", null], ["/manager/analytics", null], ["/manager/replay", null], ["/staff-directory", null], ["/account", null], ["/notifications", null], ["/admin", /\/$|\/company$/], ["/mechanic", /\/$|\/company$/]],
  mechanic: [["/mechanic", null], ["/run-inspection", null], ["/account", null], ["/vehicle/bus-a", null], ["/service-history", null], ["/admin", /\/$|\/mechanic$/], ["/company", /\/$|\/mechanic$/]],
  staff: [["/staff", null], ["/journey", null], ["/rides", null], ["/help", null], ["/my-card", null], ["/more", null],
    ["/passenger-bookings", /\/staff$/], ["/service-history", /\/staff$/], ["/incident-report", /\/staff$/], ["/driver-schedule", /\/staff$/], ["/driver-profile", /\/staff$/], ["/notifications", null], ["/account", null], ["/route-explorer", null], ["/buses", null], ["/safety-standards", null], ["/admin", /\/$|\/staff$/], ["/company", /\/$|\/staff$/], ["/manager", /\/$|\/staff$/], ["/mechanic", /\/$|\/staff$/], ["/vehicle-registry", /\/staff$/]],
  driver: [["/driver-phone", null], ["/driver-phone/messages", null], ["/driver-phone/report", null], ["/driver-phone/me", null], ["/driver-schedule", null], ["/driver-profile", null], ["/driver-password", /\/driver-phone$/]],
};

// One JSON line per page when ROUTE_SMOKE_REPORT names a file (parallel-safe).
const record = (entry) => { if (process.env.ROUTE_SMOKE_REPORT) fs.appendFileSync(process.env.ROUTE_SMOKE_REPORT, JSON.stringify(entry) + "\n"); };

for (const [role, routes] of Object.entries(ROUTES)) {
  for (const [path, expected] of routes) {
    test(`${role} ${path}`, async ({ page }) => {
      const errors = [], consoleErrors = [];
      page.on("pageerror", (e) => errors.push(String(e?.message || e).slice(0, 300)));
      page.on("console", (m) => { if (m.type() === "error") consoleErrors.push(m.text().slice(0, 200)); });
      await mockFleet(page, { role: role === "public" ? "staff" : role, signedIn: role !== "public" });
      await page.setViewportSize(role === "staff" || role === "driver" ? { width: 390, height: 844 } : { width: 1366, height: 900 });
      await page.goto(path);
      await page.waitForTimeout(1800);
      const url = new URL(page.url()).pathname;
      const crashed = await page.getByRole("heading", { name: "Something went wrong" }).count();
      const notFound = await page.getByText(/page not found|doesn't exist|404/i).count();
      record({ role, path, url, errors, consoleErrors: [...new Set(consoleErrors)].slice(0, 8), crashed: !!crashed, notFound: !!notFound });
      expect(errors, "uncaught errors").toEqual([]);
      expect(crashed, "crash screen").toBe(0);
      if (expected) expect(url).toMatch(expected);
      else {
        expect(url, "stayed on the page").toBe(path);
        expect(notFound, "page not found").toBe(0);
      }
    });
  }
}

test("an unknown address shows the not-found page with a way back", async ({ page }) => {
  await mockFleet(page, { role: "staff" });
  await page.goto("/no-such-page");
  await expect(page.getByText(/not found|doesn't exist|404/i).first()).toBeVisible();
  await expect(page.getByRole("link").or(page.getByRole("button")).first()).toBeVisible();
});
