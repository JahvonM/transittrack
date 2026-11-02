import { test, expect } from "@playwright/test";
import { fleetData, mockFleet } from "./helpers/fleetFixture.js";

// Account emails on screen: the sign-up day setup email (adding someone,
// importing a list, sending it again), joining with the personal setup link,
// and the sign-in page after a password reset.

const INVITE = "ab".repeat(32);

function hotelServer() {
  const people = [
    { key: "contact:ben", ref: "email:ben@test.local", name: "Ben Charles", email: "ben@test.local", registered: false, app: "", pickup: false, pickup_name: "", card: "" },
  ];
  const calls = [];
  const handle = (body) => {
    calls.push(body);
    switch (body.action) {
      case "signup_state":
        return { company: { id: "a", name: "Coyaba", join_code: "JOIN12345678" }, me: "Admin", people: people.map((p) => ({ ...p, helper: null })) };
      case "signup_claim": case "signup_app": return { ok: true };
      case "signup_add": {
        const ref = `email:${body.email}`;
        people.push({ key: `contact:${body.name}`, ref, name: body.name, email: body.email, registered: false, app: "", pickup: false, pickup_name: "", card: "",
          ...(body.send_invite ? { invite_sent_at: new Date().toISOString(), invite_sent_by: "Admin" } : {}) });
        return { ok: true, person_ref: ref, name: body.name, invite: body.send_invite ? "sent" : undefined };
      }
      case "signup_import":
        for (const row of body.rows) people.push({ key: `contact:${row.name}`, ref: row.email ? `email:${row.email}` : `contact:${row.name}`, name: row.name, email: row.email, registered: false, app: "", pickup: false, pickup_name: "", card: "" });
        return { ok: true, added: body.rows.length, skipped: [], invite_refs: body.rows.filter((r) => r.email).map((r) => `email:${r.email}`) };
      case "signup_invite": {
        const refs = body.person_refs || [body.person_ref];
        const results = refs.map((ref) => {
          const p = people.find((x) => x.ref === ref);
          if (p?.invite_sent_at) return { ref, name: p.name, status: "just_sent" };
          if (p) Object.assign(p, { invite_sent_at: new Date().toISOString(), invite_sent_by: "Admin" });
          return { ref, name: p?.name || "", status: p ? "sent" : "not_on_list" };
        });
        return { ok: true, sent: results.filter((r) => r.status === "sent").length, results };
      }
      default: return { error: "Unknown action" };
    }
  };
  return { people, calls, handle };
}

async function signupDay(page) {
  const server = hotelServer();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await mockFleet(page, { role: "admin", data: fleetData() });
  await page.route("**/functions/nfcCards", async (route) => route.fulfill({ json: server.handle(route.request().postDataJSON()) }));
  await page.setViewportSize({ width: 1280, height: 860 });
  await page.goto("/admin/signup-day");
  await expect(page.getByText("Ben Charles")).toBeVisible();
  return { server, errors };
}

test("sign-up day: adding someone with an email sends their setup email, and it can be sent again", async ({ page }) => {
  const { server, errors } = await signupDay(page);
  await page.getByRole("button", { name: "Add person" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Name").fill("Dee Ross");
  await expect(dialog.getByText("Email them how to set up the app")).toHaveCount(0);
  await dialog.getByLabel("Email").fill("dee@test.local");
  const box = dialog.getByRole("checkbox", { name: /Email them how to set up the app/ });
  await expect(box).toBeChecked();
  await dialog.getByRole("button", { name: "Add person" }).click();
  await expect(page.getByText("Setup email sent to Dee.").first()).toBeVisible();
  expect(server.calls.find((c) => c.action === "signup_add")).toMatchObject({ name: "Dee Ross", email: "dee@test.local", send_invite: true });
  // Their page says when it went out, and sending again is held back for a moment.
  const sheet = page.getByRole("dialog", { name: "Dee Ross" });
  await expect(sheet.getByText(/Setup email sent at .* by Admin\./)).toBeVisible();
  await page.screenshot({ path: "/tmp/tt-setup-email-sheet.png" });
  await sheet.getByRole("button", { name: "Send the setup email again" }).click();
  await expect(sheet.getByText("A setup email went to Dee a moment ago. Give it a couple of minutes.")).toBeVisible();
  expect(errors).toEqual([]);
});

test("sign-up day: unticked, nobody is emailed; a person's page can send it", async ({ page }) => {
  const { server } = await signupDay(page);
  await page.getByRole("button", { name: "Add person" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Name").fill("Eve Lane");
  await dialog.getByLabel("Email").fill("eve@test.local");
  await dialog.getByRole("checkbox", { name: /Email them how to set up the app/ }).click();
  await dialog.getByRole("button", { name: "Add person" }).click();
  expect(server.calls.find((c) => c.action === "signup_add").send_invite).toBe(false);
  const sheet = page.getByRole("dialog", { name: "Eve Lane" });
  await sheet.getByRole("button", { name: "Email the setup link" }).click();
  await expect(sheet.getByText("Setup email sent to Eve.")).toBeVisible();
});

test("sign-up day: an imported list gets its setup emails in turns", async ({ page }) => {
  const { server } = await signupDay(page);
  await page.getByRole("button", { name: "Import list" }).click();
  const dialog = page.getByRole("dialog");
  const rows = Array.from({ length: 23 }, (_, i) => `Person ${i + 1}, p${i + 1}@test.local`).concat(["No Email Person"]);
  await dialog.getByLabel("Staff list").fill(["Name, Email", ...rows].join("\n"));
  await expect(dialog.getByText("23 people on this list.", { exact: false })).toBeVisible();
  await dialog.getByRole("button", { name: /Add 24 to the list/ }).click();
  await expect(dialog.getByText("Setup emails sent to 23 of 23.")).toBeVisible();
  const batches = server.calls.filter((c) => c.action === "signup_invite").map((c) => c.person_refs.length);
  expect(batches).toEqual([20, 3]);
});

test("a setup link: signed out it asks to sign in with that address; signed in it joins with the link, not a code", async ({ page }) => {
  await mockFleet(page, { role: "staff", signedIn: false });
  await page.goto(`/join#invite=${INVITE}`);
  await expect(page.getByText("Setup link received. You won't need a company code.")).toBeVisible();
  expect(new URL(page.url()).hash).toBe("");
  await page.getByRole("link", { name: "I already have an account" }).click();
  await expect(page.getByText("Setup link received.", { exact: false })).toBeVisible();
  await expect(page.getByText("with the email address it was sent to", { exact: false })).toBeVisible();
});

test("a setup link for someone else says so and leaves the code box", async ({ page }) => {
  const sent = [];
  await mockFleet(page, { role: "staff" });
  await page.route("**/functions/companyAccess", async (route) => {
    const body = route.request().postDataJSON();
    sent.push(body);
    if (body.action === "verify") return route.fulfill({ status: 403, json: { error: "This setup link was sent to a different email address. Sign in with that address, or type your company code.", code: "INVITE_OTHER_EMAIL" } });
    return route.fallback();
  });
  await page.goto(`/join#invite=${INVITE}`);
  await expect(page.getByText("This setup link was sent to a different email address.", { exact: false })).toBeVisible();
  await expect(page.getByLabel("Company code")).toBeVisible();
  const verify = sent.find((b) => b.action === "verify");
  expect(verify).toEqual({ action: "verify", invite: INVITE });
});

test("after a password reset the sign-in page says the password changed", async ({ page }) => {
  await mockFleet(page, { role: "staff", signedIn: false });
  await page.goto("/login?reset=1");
  await expect(page.getByRole("status").filter({ hasText: "Password changed. Sign in with your new password." })).toBeVisible();
});
