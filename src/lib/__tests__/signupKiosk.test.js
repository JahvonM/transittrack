import { describe, it, expect } from "vitest";
import { createHash } from "node:crypto";
import { load, mock, request } from "../../../security-tests/helpers.js";

// Sign-up day iPads: connected by QR from the admin's PC, staff sign up on
// them, the admin sees typing live and decides what they show.
const sha = (v) => createHash("sha256").update(v).digest("hex");
const TOKEN = "a".repeat(64);
const SECRETS = { SUPABASE_URL: "https://example.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "sb_secret_synthetic-test-key-never-real", TT_DURABLE_WRITES_ENABLED: "true", TT_ATOMIC_STORE_URL: "https://example.supabase.co", TT_ATOMIC_SERVICE_ROLE_KEY: "sb_secret_synthetic-test-key-never-real" };

function setup(role = "admin") {
  const sdk = mock(role);
  sdk.testSecrets = SECRETS;
  sdk.sent = [];
  // Supabase admin API: making a sign-in also makes its app account (the database does that).
  sdk.atomicFetch = async (url, init) => {
    const body = init?.body ? JSON.parse(init.body) : {};
    sdk.sent.push({ url: String(url), body });
    if (String(url).endsWith("/auth/v1/admin/users")) {
      if (sdk.tables.User.some((u) => u.email === body.email)) return Response.json({ msg: "exists" }, { status: 422 });
      sdk.tables.User.push({ id: "new-" + sdk.tables.User.length, email: body.email, role: "user", auth_user_id: "auth-new" });
      return Response.json({ id: "auth-new" });
    }
    if (String(url).endsWith("/auth/v1/admin/generate_link")) return Response.json({ hashed_token: "hashed-sign-in" });
    if (String(url).includes("rpc/tt_reserve_attempt")) return Response.json(true);
    throw new Error("unexpected " + url);
  };
  Object.assign(sdk.tables, { KioskDevice: [], DeviceCredential: [], VerificationGrant: [], AuditLog: [], CompanyMembership: sdk.tables.CompanyMembership || [] });
  return sdk;
}
const call = async (sdk, body) => { const r = await load("signupKiosk", sdk).default(request(body)); return { status: r.status, body: await r.json() }; };
// An iPad that scanned the admin's QR (pairKioskDevice made its key).
function pairedIpad(sdk, id = "ipad-1", company = "a") {
  sdk.tables.KioskDevice.push({ id, kiosk_type: "signup", label: "Sign-up iPad 1", company_id: company, status: "active", paired: true, pairing_code: "PAIRCODE1234" });
  sdk.tables.DeviceCredential.push({ id: "cred-" + id, device_id: id, kiosk_type: "signup", company_id: company, vehicle_id: "", token_hash: sha(TOKEN), pairing_code_hash: sha("PAIRCODE1234"), expires_at: "2099-01-01T00:00:00Z", issued_at: "2026-11-01T00:00:00Z" });
  return { device_id: id, device_token: TOKEN };
}

describe("connecting a sign-up iPad", () => {
  it("an admin makes a 15-minute pairing code for the hotel's iPad", async () => {
    const sdk = setup();
    const res = await call(sdk, { action: "pair_start", company_id: "a" });
    expect(res.status).toBe(200);
    expect(res.body.pairing_code).toMatch(/^[A-Z0-9]{12}$/);
    expect(sdk.tables.KioskDevice[0]).toMatchObject({ kiosk_type: "signup", company_id: "a", paired: false, label: "Sign-up iPad 1" });
    expect(Date.parse(res.body.expires_at) - Date.now()).toBeLessThanOrEqual(15 * 60_000);
  });
  it.each(["staff", "driver", "mechanic"])("a %s cannot", async (role) => {
    expect((await call(setup(role), { action: "pair_start", company_id: "a" })).status).toBe(403);
  });
  it("an iPad without its key gets nothing", async () => {
    const sdk = setup();
    pairedIpad(sdk);
    expect((await call(sdk, { action: "state", device_id: "ipad-1", device_token: "b".repeat(64) })).status).toBe(401);
    expect((await call(sdk, { action: "register", device_id: "ipad-1", device_token: "nope", name: "X", email: "x@test.invalid" })).status).toBe(401);
  });
});

describe("the admin decides what the iPads show", () => {
  it("shows the company code only while the admin puts it on screen", async () => {
    const sdk = setup();
    const ipad = pairedIpad(sdk);
    expect((await call(sdk, { action: "state", ...ipad })).body.screen.company_code).toBeUndefined();
    expect((await call(sdk, { action: "screen", device_id: "ipad-1", screen: { kind: "company_code" } })).status).toBe(200);
    expect((await call(sdk, { action: "state", ...ipad })).body.screen).toMatchObject({ kind: "company_code", company_code: "JOIN12345678" });
    await call(sdk, { action: "screen", device_id: "ipad-1", screen: { kind: "message", text: "Please see the desk" } });
    expect((await call(sdk, { action: "state", ...ipad })).body.screen).toMatchObject({ kind: "message", text: "Please see the desk" });
    expect((await call(sdk, { action: "screen", device_id: "ipad-1", screen: { kind: "javascript" } })).status).toBe(400);
  });
  it("sees what is typed, live", async () => {
    const sdk = setup();
    const ipad = pairedIpad(sdk);
    await call(sdk, { action: "live", ...ipad, step: "details", draft: { name: "Ana Jo", email: "ana@" } });
    const list = await call(sdk, { action: "list", company_id: "a" });
    expect(list.body.kiosks[0]).toMatchObject({ id: "ipad-1", online: true, live: { step: "details", draft: { name: "Ana Jo", email: "ana@" } } });
  });
  it("can disconnect an iPad", async () => {
    const sdk = setup();
    const ipad = pairedIpad(sdk);
    await call(sdk, { action: "remove", device_id: "ipad-1" });
    expect((await call(sdk, { action: "state", ...ipad })).status).toBe(401);
  });
});

describe("signing up on the iPad", () => {
  it("adds them to the hotel's list, makes their account, joins the company and gives both codes", async () => {
    const sdk = setup();
    const ipad = pairedIpad(sdk);
    const res = await call(sdk, { action: "register", ...ipad, name: "Ana Joseph", email: "Ana@Test.invalid", phone: "555" });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ person_ref: "email:ana@test.invalid", company_code: "JOIN12345678" });
    expect(res.body.sign_in_code).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}$/);
    expect(sdk.tables.Contact.find((c) => c.email === "ana@test.invalid")).toMatchObject({ name: "Ana Joseph", company_id: "a", type: "staff" });
    const account = sdk.tables.User.find((u) => u.email === "ana@test.invalid");
    expect(account).toMatchObject({ role: "staff", full_name: "Ana Joseph" });
    expect(sdk.tables.CompanyMembership).toContainEqual(expect.objectContaining({ user_id: account.id, company_id: "a", scope: "passenger", active: true }));
    // The code is kept only as a hash.
    expect(JSON.stringify(sdk.tables.VerificationGrant)).not.toContain(res.body.sign_in_code.replace("-", ""));

    // Their pickup spot goes on their list entry and their new account.
    expect((await call(sdk, { action: "pickup", ...ipad, person_ref: res.body.person_ref, pickup_name: "Coast stop", pickup_lat: 17.3, pickup_lng: -62.79 })).status).toBe(200);
    expect(account).toMatchObject({ pickup_name: "Coast stop", pickup_lat: 17.3 });

    // On their phone: the code signs them in, once.
    const redeem = await call(sdk, { action: "redeem", code: res.body.sign_in_code.toLowerCase().replace("-", " ") });
    expect(redeem).toMatchObject({ status: 200, body: { token_hash: "hashed-sign-in" } });
    expect(sdk.sent.at(-1)).toMatchObject({ body: { type: "magiclink", email: "ana@test.invalid" } });
    expect((await call(sdk, { action: "redeem", code: res.body.sign_in_code })).status).toBe(404);
  });

  it("never gives a code for an email that already has an account", async () => {
    const sdk = setup();
    const ipad = pairedIpad(sdk);
    const res = await call(sdk, { action: "register", ...ipad, name: "Someone", email: "caller@test.invalid" });
    expect(res.body).toMatchObject({ existing: true });
    expect(res.body.sign_in_code).toBeUndefined();
    expect(sdk.tables.VerificationGrant).toHaveLength(0);
    expect(sdk.tables.User.find((u) => u.email === "caller@test.invalid").full_name).not.toBe("Someone");
  });

  it("refuses made-up and expired codes", async () => {
    const sdk = setup();
    const ipad = pairedIpad(sdk);
    const { sign_in_code } = (await call(sdk, { action: "register", ...ipad, name: "Ben", email: "ben@test.invalid" })).body;
    expect((await call(sdk, { action: "redeem", code: "ZZZZ-ZZZZ" })).status).toBe(404);
    sdk.tables.VerificationGrant[0].expires_at = "2020-01-01T00:00:00Z";
    expect((await call(sdk, { action: "redeem", code: sign_in_code })).status).toBe(410);
  });

  it("asks for a name and a real email", async () => {
    const sdk = setup();
    const ipad = pairedIpad(sdk);
    expect((await call(sdk, { action: "register", ...ipad, name: "", email: "a@test.invalid" })).status).toBe(400);
    expect((await call(sdk, { action: "register", ...ipad, name: "A", email: "not-an-email" })).status).toBe(400);
  });
});
