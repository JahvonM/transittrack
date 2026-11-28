import { test, expect } from "@playwright/test";

// A sign-up day iPad: connects from the QR link, staff sign up on it, the
// admin's live view gets what they type, and the admin chooses what it shows.
const PAIR = "ABCDEFGHJK12";
const TOKEN = "f".repeat(64);

async function ipad(page) {
  const s = { calls: [], screen: { kind: "none" }, registered: null };
  await page.route("https://api.mapbox.com/**", (r) => r.fulfill({ status: 404, body: "" }));
  await page.route("**/api/**", async (route) => {
    const url = route.request().url();
    let body = {};
    try { body = route.request().postDataJSON() || {}; } catch { /* not JSON */ }
    if (url.includes("/functions/v1/pairKioskDevice")) {
      s.calls.push({ pair: body });
      return route.fulfill({ json: body.pairing_code === PAIR ? { device_id: "ipad-1", device_token: TOKEN, kiosk_type: "signup" } : { error: "Invalid" } });
    }
    if (url.includes("/functions/v1/signupKiosk")) {
      s.calls.push(body);
      if (body.device_id !== "ipad-1" || body.device_token !== TOKEN) return route.fulfill({ status: 401, json: { error: "Not connected", code: "NOT_PAIRED" } });
      if (body.action === "state") return route.fulfill({ json: { hotel: { name: "Hotel A" }, screen: s.screen } });
      if (body.action === "live") return route.fulfill({ json: { ok: true } });
      if (body.action === "register") { s.registered = body; return route.fulfill({ json: { ok: true, person_ref: "email:ana@test.invalid", sign_in_code: "K7QM-4P2X", company_code: "JOIN12345678" } }); }
      if (body.action === "pickup") return route.fulfill({ json: { ok: true } });
    }
    if (url.includes("/functions/v1/")) return route.fulfill({ json: {} });
    return route.fulfill({ json: { id: "test-app", public_settings: { authentication_required: false } } });
  });
  return s;
}

test("an iPad connects from the QR, and staff sign up with both codes shown", async ({ page }) => {
  await page.setViewportSize({ width: 820, height: 1180 }); // iPad
  const s = await ipad(page);
  await page.goto(`/kiosk/signup#pair=${PAIR}`);
  await expect(page.getByRole("button", { name: /Get your staff bus/ })).toBeVisible();
  expect(s.calls.find((c) => c.pair)?.pair).toMatchObject({ pairing_code: PAIR });
  // The pairing code leaves the address bar.
  expect(new URL(page.url()).hash).toBe("");
  await expect(page.getByText("Hotel A · Staff transport sign-up")).toBeVisible();

  await page.getByRole("button", { name: /Get your staff bus/ }).click();
  await page.getByLabel("Full name").fill("Ana Joseph");
  await page.getByLabel("Email address").fill("ana@test.invalid");
  // What they type reaches the admin's live view.
  await expect.poll(() => s.calls.filter((c) => c.action === "live").at(-1)?.draft).toMatchObject({ name: "Ana Joseph", email: "ana@test.invalid" });
  expect(s.calls.filter((c) => c.action === "live").at(-1).step).toBe("details");
  await page.getByRole("button", { name: "Next", exact: true }).click();

  await expect(page.getByText("K7QM-4P2X")).toBeVisible();
  await expect(page.getByText("JOIN12345678")).toBeVisible();
  expect(s.registered).toMatchObject({ name: "Ana Joseph", email: "ana@test.invalid" });
  await page.getByRole("button", { name: /your pickup spot/ }).click();
  await expect(page.getByRole("heading", { name: "Where should the bus pick you up?" })).toBeVisible();
  await page.getByRole("button", { name: "Skip for now" }).click();
  await expect(page.getByRole("heading", { name: "You're signed up, Ana" })).toBeVisible();
  await expect(page.getByRole("img", { name: /QR code to join Hotel A/ })).toBeVisible();
  await page.getByRole("button", { name: "Finish" }).click();
  await expect(page.getByRole("button", { name: /Get your staff bus/ })).toBeVisible();
});

test("the admin puts the company code or a message on the iPad", async ({ page }) => {
  const s = await ipad(page);
  await page.goto(`/kiosk/signup#pair=${PAIR}`);
  await expect(page.getByRole("button", { name: /Get your staff bus/ })).toBeVisible();
  s.screen = { kind: "company_code", company_code: "JOIN12345678", at: "1" };
  await expect(page.getByRole("dialog", { name: "Message from the sign-up desk" })).toContainText("JOIN12345678");
  s.screen = { kind: "message", text: "Please see the desk", at: "2" };
  await expect(page.getByRole("dialog")).toContainText("Please see the desk");
  s.screen = { kind: "none", at: "3" };
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("an iPad that was disconnected asks to be connected again", async ({ page }) => {
  await ipad(page);
  await page.addInitScript(() => localStorage.setItem("tt_signup_kiosk", JSON.stringify({ device_id: "ipad-old", device_token: "e".repeat(64) })));
  await page.goto("/kiosk/signup");
  await expect(page.getByRole("heading", { name: "Connect this iPad" })).toBeVisible();
});

test("on the phone, the code from the iPad signs them in", async ({ page }) => {
  const seen = { redeem: null, verify: null };
  await page.route("**/api/**", async (route) => {
    const url = route.request().url();
    let body = {};
    try { body = route.request().postDataJSON() || {}; } catch { /* not JSON */ }
    if (url.includes("/functions/v1/signupKiosk") && body.action === "redeem") {
      seen.redeem = body;
      return route.fulfill({ json: { token_hash: "hashed-sign-in" } });
    }
    if (url.includes("/auth/v1/verify")) {
      seen.verify = body;
      return route.fulfill({ json: { access_token: "a.b.c", refresh_token: "refresh-token-x", token_type: "bearer", expires_in: 3600, expires_at: 4102444800, user: { id: "u1", email: "ana@test.invalid" } } });
    }
    if (url.includes("/auth/v1/settings")) return route.fulfill({ json: { external: {} } });
    if (url.includes("/functions/v1/")) return route.fulfill({ status: 401, json: { error: "Not signed in" } });
    return route.fulfill({ json: { id: "test-app", public_settings: "public_without_login" } });
  });
  await page.goto("/login");
  await page.getByRole("button", { name: "I have a code from the sign-up iPad" }).click();
  const box = page.getByLabel("Code from the sign-up iPad");
  await box.fill("k7qm-4p2x");
  await expect(box).toHaveValue("K7QM-4P2X");
  await page.getByRole("button", { name: "Sign in with this code" }).click();
  await expect.poll(() => seen.verify).toMatchObject({ token_hash: "hashed-sign-in", type: "magiclink" });
  expect(seen.redeem).toMatchObject({ action: "redeem", code: "K7QM-4P2X" });
});
