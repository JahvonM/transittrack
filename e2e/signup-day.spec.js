import { test, expect } from "@playwright/test";
import { fleetData, mockFleet } from "./helpers/fleetFixture.js";

// Sign-up day at a hotel: two helpers, each on their own device, work from
// the same list. One shared fake server stands in for nfcCards, so what one
// helper does shows up on the other's screen on its next refresh.

function hotelServer(companyName, joinCode) {
  const people = [
    { key: "contact:ana", ref: "email:ana@test.local", name: "Ana Joseph", email: "ana@test.local", registered: true, app: "", pickup: false, pickup_name: "", card: "" },
    { key: "contact:ben", ref: "email:ben@test.local", name: "Ben Charles", email: "ben@test.local", registered: false, app: "", pickup: false, pickup_name: "", card: "" },
    { key: "contact:cal", ref: "email:cal@test.local", name: "Cal Noel", email: "cal@test.local", registered: true, app: "alerts", pickup: true, pickup_name: "Grand Anse", card: "issued", card_tail: "7C1B" },
  ];
  const claims = new Map();
  const find = (ref) => people.find((p) => p.ref === ref);
  return {
    people,
    handle(body, helper) {
      switch (body.action) {
        case "signup_state":
          return { status: 200, json: { company: { id: "a", name: companyName, join_code: joinCode }, me: helper.name,
            people: people.map((p) => { const c = claims.get(p.ref); return { ...p, helper: c ? { name: c.name, mine: c.id === helper.id } : null }; }) } };
        case "signup_claim": {
          const c = claims.get(body.person_ref);
          if (body.release) { if (c?.id === helper.id || body.take_over) claims.delete(body.person_ref); return { status: 200, json: { ok: true } }; }
          if (c && c.id !== helper.id && !body.take_over) return { status: 409, json: { ok: false, code: "taken", helper_name: c.name, error: `${c.name} is already helping.` } };
          claims.set(body.person_ref, helper);
          return { status: 200, json: { ok: true } };
        }
        case "signup_remove": {
          const i = people.findIndex(p => p.ref === body.person_ref);
          if (i < 0) return { status: 404, json: { error: "Passenger not found" } };
          people.splice(i, 1); claims.delete(body.person_ref);
          return { status: 200, json: { ok: true } };
        }
        case "signup_app": find(body.person_ref).app = body.has_app ? "ticked" : ""; return { status: 200, json: { ok: true } };
        case "signup_import":
          for (const row of body.rows) people.push({ key: `contact:${row.name}`, ref: row.email ? `email:${row.email}` : `contact:${row.name}`, name: row.name, email: row.email, registered: false, app: "", pickup: false, card: "" });
          return { status: 200, json: { ok: true, added: body.rows.length, skipped: [] } };
        case "issue": {
          const p = people.find((x) => x.key === body.person_key);
          p.card = "issued"; p.card_tail = body.uid.slice(-4);
          return { status: 200, json: { ok: true, sent_to_bus: 0 } };
        }
        default: return { status: 400, json: { error: "Unknown action" } };
      }
    },
  };
}

async function helperDevice(browser, server, helper, viewport) {
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  const data = fleetData();
  await mockFleet(page, { role: "admin", data });
  // Registered after the fleet mock, so it answers nfcCards first.
  await page.route("**/functions/nfcCards", async (route) => {
    const { status, json } = server.handle(route.request().postDataJSON(), helper);
    await route.fulfill({ status, json });
  });
  await page.goto("/admin/signup-day");
  return { context, page };
}

test("two helpers on different devices share one live sign-up list", async ({ browser }) => {
  test.setTimeout(90_000);
  const data = fleetData();
  const server = hotelServer(data.company.name, data.company.access_code);
  const laptop = await helperDevice(browser, server, { id: "kerry", name: "Kerry" }, { width: 1280, height: 800 });
  const phone = await helperDevice(browser, server, { id: "jahvon", name: "Jahvon" }, { width: 390, height: 844 });

  for (const { page } of [laptop, phone]) {
    await expect(page.getByText("1 of 3 all set")).toBeVisible({ timeout: 15000 });
    await expect(page.getByRole("button", { name: /Ben Charles/ })).toBeVisible();
  }
  expect(await phone.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await laptop.page.screenshot({ path: "/tmp/tt-signup-laptop.png" });
  await phone.page.screenshot({ path: "/tmp/tt-signup-phone.png" });

  // Kerry opens Ben on the laptop: that marks Ben as Kerry's.
  await laptop.page.getByRole("button", { name: /Ben Charles/ }).click();
  const sheet = laptop.page.getByRole("dialog", { name: "Ben Charles" });
  await expect(sheet.getByText("You're helping Ben.")).toBeVisible();
  await expect(sheet.getByAltText(/QR code to join/)).toBeVisible();
  await laptop.page.screenshot({ path: "/tmp/tt-signup-person.png" });

  // Jahvon's phone shows it on its next refresh, and Ben is no longer in To do.
  await expect(phone.page.getByRole("button", { name: /Ben Charles/ })).toHaveCount(0, { timeout: 8000 });
  await phone.page.getByRole("button", { name: /^Everyone/ }).click();
  await expect(phone.page.getByRole("button", { name: /Ben Charles.*Kerry is helping/ })).toBeVisible();
  await phone.page.getByRole("button", { name: /Ben Charles/ }).click();
  const phoneSheet = phone.page.getByRole("dialog", { name: "Ben Charles" });
  await expect(phoneSheet.getByText("is helping Ben.")).toBeVisible();
  await expect(phoneSheet.getByRole("button", { name: "Take over" })).toBeVisible();
  await phone.page.screenshot({ path: "/tmp/tt-signup-phone-person.png" });
  await phone.page.keyboard.press("Escape");

  // Kerry ticks the app and types Ben's card number (no reader on this laptop).
  await sheet.getByRole("switch", { name: "Ben has the app" }).click();
  await sheet.getByRole("button", { name: "Give card" }).click();
  await sheet.getByLabel("Card number").fill("04:A2:1B:7C");
  await sheet.getByRole("button", { name: "Save" }).click();
  await expect(sheet.getByText("Card saved for Ben.")).toBeVisible();
  expect(server.people.find((p) => p.name === "Ben Charles")).toMatchObject({ app: "ticked", card: "issued", card_tail: "1B7C" });
  await sheet.getByRole("button", { name: "Set pickup spot" }).click();
  await expect(laptop.page.getByRole("dialog", { name: "Pickup spot for Ben Charles" })).toBeVisible();
  await laptop.page.keyboard.press("Escape");

  // Jahvon imports the rest of the hotel's list from a spreadsheet on the phone.
  await phone.page.getByRole("button", { name: "Import list" }).click();
  const dialog = phone.page.getByRole("dialog", { name: /staff list/ });
  await dialog.getByLabel("Staff list").fill("Name\tEmail\nDee Pierre\tdee@test.local\nEli Mark\teli@test.local\n");
  await expect(dialog.getByText("2 people found")).toBeVisible();
  await dialog.getByRole("button", { name: "Add 2 to the list" }).click();
  await expect(dialog.getByText("Added 2 people.")).toBeVisible();
  await dialog.getByRole("button", { name: "Done" }).click();
  await expect(laptop.page.getByText("1 of 5 all set")).toBeVisible({ timeout: 8000 });

  // The QR for the table.
  await laptop.page.keyboard.press("Escape");
  await laptop.page.getByRole("button", { name: "Table QR" }).click();
  await expect(laptop.page.getByRole("dialog", { name: "Table QR code" }).getByAltText(/QR code to join/)).toBeVisible();

  await laptop.context.close();
  await phone.context.close();
});


test("helpers can remove a mistaken sign-up entry after confirmation", async ({ browser }) => {
  const server = hotelServer("Hotel A", "JOIN12345678");
  const { context, page } = await helperDevice(browser, server, { id: "helper", name: "Helper" }, { width: 1280, height: 800 });
  await page.getByRole("button", { name: /Ben Charles/ }).click();
  const sheet = page.getByRole("dialog", { name: "Ben Charles" });
  await expect(sheet.getByRole("button", { name: "Remove passenger" })).toBeEnabled();
  await sheet.getByRole("button", { name: "Remove passenger" }).click();
  const confirmation = page.getByRole("alertdialog");
  await confirmation.getByRole("button", { name: "Remove passenger", exact: true }).click();
  await expect(sheet).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Ben Charles/ })).toHaveCount(0);
  expect(server.people.some(p => p.name === "Ben Charles")).toBe(false);
  await context.close();
});

test("passenger directory assigns a company with confirmation", async ({ page }) => {
  const data = fleetData();
  await mockFleet(page, { role: "admin", data });
  let assignment;
  const person = { key: "contact:walk-in", source: "contact", id: "walk-in", name: "Walk In", directory_type: "passenger", company_id: "" };
  await page.route("**/functions/nfcCards", route => {
    const body = route.request().postDataJSON();
    if (body.action === "set_company") {
      assignment = body; person.company_id = body.company_id;
      return route.fulfill({ json: { ok: true } });
    }
    return route.fulfill({ json: { people: [person], vehicles: [] } });
  });
  await page.goto("/admin/directory");
  await page.getByRole("combobox", { name: "Company for Walk In", exact: true }).click();
  await page.getByRole("option", { name: data.company.name, exact: true }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Assign company", exact: true }).click();
  await expect(page.getByRole("combobox", { name: "Company for Walk In", exact: true })).toContainText(data.company.name);
  expect(assignment).toMatchObject({ action: "set_company", person_key: "contact:walk-in", company_id: data.company.id });
});
