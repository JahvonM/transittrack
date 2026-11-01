import { test, expect } from "@playwright/test";
import { fleetData, mockFleet } from "./helpers/fleetFixture.js";

// The passenger's journey on Home (from their own taps, never GPS alone),
// how far to trust the time, journey alerts, requests with reference numbers,
// and the office inbox that answers them.

const iso = (msAgo) => new Date(Date.now() - msAgo).toISOString();
const tap = (id, status, msAgo) => ({ id, status, boarded_at: iso(msAgo), vehicle_name: "Bus 1" });

async function passenger(page, { today = [], cases = [], bus = {}, data = fleetData() } = {}) {
  data.today = today;
  data.passengerCases = cases;
  Object.assign(data.vehicles[0], bus);
  const session = await mockFleet(page, { role: "staff", data });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.setViewportSize({ width: 390, height: 844 });
  return { ...session, errors };
}
const hero = (page) => page.getByRole("region", { name: "Your next bus" });
const caseCalls = (calls) => calls.filter((c) => c.fn === "passengerCases" && c.body?.action !== "mine" && c.body?.action !== "list").map((c) => c.body);

test("boarding and exit on Home come from the passenger's own taps", async ({ page }) => {
  const data = fleetData();
  const s = await passenger(page, { today: [tap("b1", "boarded", 60_000)], data });
  await page.goto("/staff");
  await expect(hero(page).getByRole("status")).toHaveText(/Boarding confirmed/);
  await expect(hero(page).getByText("Step 4 of 8: Boarded")).toBeVisible();
  await expect(page.getByText("Boarding confirmed", { exact: true }).last()).toBeVisible(); // the alert
  // They get off: the next check shows the exit, and asks for an optional rating.
  data.today = [tap("b1", "boarded", 30 * 60_000), tap("x1", "off_board", 60_000)];
  await page.reload();
  await expect(hero(page).getByRole("status")).toHaveText(/Exit confirmed/);
  await expect(hero(page).getByText("Step 7 of 8: Got off")).toBeVisible();
  const feedback = page.getByRole("region", { name: "How was your ride?" });
  await feedback.getByRole("radio", { name: "4 of 5" }).click();
  await feedback.getByRole("button", { name: "Send", exact: true }).click();
  await expect(page.getByText("Thanks for your feedback").first()).toBeVisible();
  await expect(feedback).toHaveCount(0);
  expect(caseCalls(s.calls)).toEqual([expect.objectContaining({ action: "create", kind: "feedback", rating: 4 })]);
  expect(s.errors).toEqual([]);
});

test("a bus at the pickup is not a boarding until the passenger taps", async ({ page }) => {
  const data = fleetData();
  // The bus sits at the passenger's pickup (their saved spot), stopped.
  await passenger(page, { data, bus: { speed: 0 } });
  await page.goto("/staff");
  await expect(hero(page)).toBeVisible();
  await expect(hero(page).getByText(/Boarding confirmed|On board/)).toHaveCount(0);
});

test("an old bus position is shown as the last known position, not as live", async ({ page }) => {
  await passenger(page, { bus: { last_location_update: iso(25 * 60_000) } });
  await page.goto("/staff");
  await expect(hero(page).getByText(/^Last known position/)).toBeVisible();
  await expect(hero(page).getByText("Live estimate")).toHaveCount(0);
  await expect(hero(page).getByText(/Cancelled/i)).toHaveCount(0);
});

test("a change of bus is announced once", async ({ page }) => {
  // This phone last saw the passenger on another bus (seeded once, not on reload).
  await page.addInitScript(() => { if (!sessionStorage.getItem("seeded")) { sessionStorage.setItem("seeded", "1"); localStorage.setItem("tt_last_assignment_u-pass", JSON.stringify({ bus: "bus-old", busName: "Bus 9", pickup: "" })); } });
  await passenger(page);
  await page.goto("/staff");
  await expect(page.getByText("Your bus has changed").first()).toBeVisible();
  await page.reload();
  await expect(hero(page)).toBeVisible();
  await expect(page.getByText("Your bus has changed")).toHaveCount(0);
});

test("My rides: ask for a time change, see its reference and status, and withdraw it", async ({ page }) => {
  const s = await passenger(page);
  await page.goto("/rides");
  const change = page.getByRole("region", { name: "Change a ride" });
  await change.getByRole("radio", { name: "Change my pickup time" }).check();
  await change.getByRole("button", { name: "Send request" }).click();
  await expect(change.getByRole("alert")).toHaveText("Choose the pickup time you would like.");
  expect(caseCalls(s.calls)).toEqual([]);
  await change.getByLabel("Pickup time you would like").fill("06:45");
  await change.getByRole("button", { name: "Send request" }).click();
  const sheet = page.getByRole("dialog");
  await expect(sheet.getByText(/Change my pickup time · TT-TEST1/)).toBeVisible();
  await expect(sheet.getByText("Sent", { exact: true })).toBeVisible();
  await sheet.getByRole("button", { name: "Withdraw" }).click();
  await page.getByRole("alertdialog").or(page.getByRole("dialog").filter({ hasText: "Withdraw this request?" })).getByRole("button", { name: "Withdraw" }).click();
  await expect(page.getByText("Request withdrawn").first()).toBeVisible();
  expect(caseCalls(s.calls).map((c) => c.action)).toEqual(["create", "withdraw"]);
  expect(caseCalls(s.calls)[0]).toMatchObject({ kind: "time_change", requested_time: "06:45" });
  await expect(page.getByRole("region", { name: "My requests" }).getByRole("button", { name: /TT-TEST1, Closed/ })).toBeVisible();
});

test("Help: report a missed pickup and read the office's reply", async ({ page }) => {
  const s = await passenger(page, { cases: [{ id: "c9", reference: "TT-REPLY9", kind: "card_issue", status: "pending", details: "Card stopped working", unread: true, source: "case", created_date: iso(3600_000), replies: [{ from: "office", name: "McSween Transport", text: "A new card is on its way", at: iso(600_000) }] }] });
  await page.goto("/help");
  await expect(page.getByRole("heading", { name: "Help", exact: true })).toBeVisible();
  const mine = page.getByRole("region", { name: /My requests/ });
  await mine.getByRole("button", { name: /TT-REPLY9, Being looked at, new reply/ }).click();
  await expect(page.getByRole("dialog").getByText("A new card is on its way")).toBeVisible();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: /^Missed pickup/ }).click();
  const form = page.getByRole("region", { name: "Missed pickup" });
  await form.getByLabel("What happened").fill("The bus left before I got to the stop");
  await form.getByRole("button", { name: "Send request" }).click();
  await expect(page.getByText(/Reference TT-TEST2/).first()).toBeVisible();
  expect(caseCalls(s.calls)).toEqual(expect.arrayContaining([expect.objectContaining({ action: "seen", id: "c9" }), expect.objectContaining({ action: "create", kind: "missed_pickup" })]));
});

test("a passenger can't open the office inbox", async ({ page }) => {
  await passenger(page);
  await page.goto("/admin/support");
  await expect(page).not.toHaveURL(/\/admin/);
});

test("the office answers a request and can't turn one down without saying why", async ({ page }) => {
  const data = fleetData();
  data.passengerCases = [{ id: "c1", reference: "TT-ABC234", kind: "time_change", status: "requested", user_name: "Rita Rider", user_email: "rider@test.invalid", company_name: "Six Senses", vehicle_name: "Bus 1", leg: "to_work", requested_date: "2026-11-03", requested_time: "06:45", office_unread: true, created_date: iso(3600_000), replies: [] }];
  const s = await mockFleet(page, { role: "admin", data });
  await page.goto("/admin/support");
  await page.getByRole("button", { name: /Change my pickup time · Rita Rider/ }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText("06:45")).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Turn down" })).toBeDisabled();
  await dialog.getByLabel("Message to the passenger").fill("Your driver will come at 6:45 on Tuesday");
  await dialog.getByRole("button", { name: "Confirm with message" }).click();
  await expect(page.getByText(/Request confirmed/).first()).toBeVisible();
  expect(caseCalls(s.calls)).toEqual([{ action: "set_status", id: "c1", status: "confirmed", note: "Your driver will come at 6:45 on Tuesday" }]);
});

test("My rides lists what's coming up and what was cancelled", async ({ page }) => {
  const day = (n) => new Date(Date.now() + n * 86_400_000).toLocaleDateString("en-CA", { timeZone: "America/Grenada" });
  const s = await passenger(page, { cases: [
    { id: "c1", reference: "TT-AAAAAA", kind: "time_change", status: "confirmed", requested_date: day(1), requested_time: "07:15", replies: [], source: "case", created_date: new Date().toISOString() },
    { id: "c2", reference: "TT-BBBBBB", kind: "cancel_ride", status: "pending", requested_date: day(2), replies: [], source: "case", created_date: new Date().toISOString() },
    { id: "c3", reference: "TT-CCCCCC", kind: "cancel_ride", status: "confirmed", requested_date: day(3), replies: [], source: "case", created_date: new Date().toISOString() },
  ] });
  await page.goto("/rides");
  const coming = page.getByRole("region", { name: "Coming up" });
  await expect(coming.getByText("New time 07:15")).toBeVisible();
  await expect(coming.getByText(/TT-AAAAAA/)).toBeVisible();
  await expect(coming.getByText("Confirmed", { exact: true })).toBeVisible();
  const cancelled = page.getByRole("region", { name: "Cancelled" });
  await expect(cancelled.getByRole("listitem")).toHaveCount(2);
  await expect(cancelled.getByRole("listitem").first()).toContainText("Ride cancelled at your request");
  await expect(cancelled.getByRole("listitem").filter({ hasText: "TT-BBBBBB" })).toContainText("Waiting");
  expect(s.errors).toEqual([]);
});

test("My rides says nothing is booked when there's nothing coming up", async ({ page }) => {
  await passenger(page);
  await page.goto("/rides");
  await expect(page.getByRole("region", { name: "Coming up" }).getByText(/Nothing booked or changed/)).toBeVisible();
  await expect(page.getByRole("region", { name: "Cancelled" })).toHaveCount(0);
});

test("Regular days off: ask for them, see them once approved, and stop them", async ({ page }) => {
  const data = fleetData();
  const s = await passenger(page, { data });
  await page.goto("/rides");
  await expect(page.getByRole("region", { name: "Regular days off" })).toContainText("None.");
  const change = page.getByRole("region", { name: "Change a ride" });
  await change.getByRole("radio", { name: "Days I don’t ride" }).check();
  await change.getByRole("checkbox", { name: "Fri" }).check();
  await change.getByLabel("Which way").selectOption("to_home");
  await change.getByRole("button", { name: "Send request" }).click();
  await expect(page.getByText(/Reference TT-TEST1/).first()).toBeVisible();
  const sent = caseCalls(s.calls).find((b) => b.action === "create");
  expect(sent).toMatchObject({ kind: "regular_days", days: [5], direction: "to_home" });

  // Once the office approves it, My rides shows it and it can be stopped.
  data.ridePattern = { days: [5], direction: "to_home", from: "2026-11-02", until: "", reference: "TT-TEST1", case_id: "case-1" };
  await page.reload();
  const regular = page.getByRole("region", { name: "Regular days off" });
  await expect(regular).toContainText("Not riding on Fridays (home only) from 2026-11-02");
  await regular.getByRole("button", { name: "Ride on these days again" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Ride again" }).click();
  await expect(regular).toContainText("None.");
  expect(caseCalls(s.calls).some((b) => b.action === "end_pattern")).toBe(true);
  expect(s.errors).toEqual([]);
});
