import { describe, it, expect } from "vitest";
import { load, mock, request } from "../../../security-tests/helpers.js";

// iPhone Home Screen app: signed in in Safari, opened from the Home Screen
// signed in too, with a one-time code that only a passenger login gets.
const SECRETS = { SUPABASE_URL: "https://example.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "sb_secret_synthetic-test-key-never-real" };
function setup(role = "staff") {
  const sdk = mock(role);
  sdk.tables.VerificationGrant = [];
  sdk.testSecrets = SECRETS;
  sdk.sent = [];
  sdk.atomicFetch = async (url, init) => {
    sdk.sent.push({ url: String(url), body: JSON.parse(init.body) });
    return Response.json({ hashed_token: "hashed-sign-in" });
  };
  return sdk;
}
const call = async (sdk, body) => {
  const res = await load("homeScreenSignIn", sdk).default(request(body));
  return { status: res.status, body: await res.json() };
};

describe("signing in the iPhone Home Screen app", () => {
  it("gives a signed-in passenger a code that signs the Home Screen app in once", async () => {
    const sdk = setup();
    const issued = await call(sdk, { action: "issue" });
    expect(issued.body.code).toMatch(/^[a-f0-9]{64}$/);
    // Kept only as a hash.
    expect(JSON.stringify(sdk.tables.VerificationGrant)).not.toContain(issued.body.code);
    const first = await call(sdk, { action: "redeem", code: issued.body.code });
    expect(first).toMatchObject({ status: 200, body: { token_hash: "hashed-sign-in" } });
    expect(sdk.sent).toEqual([{ url: "https://example.supabase.co/auth/v1/admin/generate_link", body: { type: "magiclink", email: "caller@test.invalid" } }]);
    expect((await call(sdk, { action: "redeem", code: issued.body.code })).status).toBe(410);
  });

  it("keeps one code per person: a new one replaces the last", async () => {
    const sdk = setup();
    const old = (await call(sdk, { action: "issue" })).body.code;
    const fresh = (await call(sdk, { action: "issue" })).body.code;
    expect((await call(sdk, { action: "redeem", code: old })).status).toBe(410);
    expect((await call(sdk, { action: "redeem", code: fresh })).status).toBe(200);
  });

  it("refuses an expired code", async () => {
    const sdk = setup();
    const { code } = (await call(sdk, { action: "issue" })).body;
    sdk.tables.VerificationGrant[0].expires_at = new Date(Date.now() - 1000).toISOString();
    expect((await call(sdk, { action: "redeem", code })).status).toBe(410);
    expect(sdk.sent).toHaveLength(0);
  });

  it.each(["admin", "company", "driver", "mechanic"])("never gives a %s login a code", async (role) => {
    const sdk = setup(role);
    expect((await call(sdk, { action: "issue" })).body.code).toBeNull();
    expect(sdk.tables.VerificationGrant).toHaveLength(0);
  });

  it("refuses a code whose account became something other than a passenger", async () => {
    const sdk = setup();
    const { code } = (await call(sdk, { action: "issue" })).body;
    sdk.tables.User[0].role = "admin";
    expect((await call(sdk, { action: "redeem", code })).status).toBe(410);
    expect(sdk.sent).toHaveLength(0);
  });

  it("refuses made-up codes, and asks a signed-out caller to sign in", async () => {
    const sdk = setup();
    expect((await call(sdk, { action: "redeem", code: "a".repeat(64) })).status).toBe(410);
    expect((await call(sdk, { action: "redeem", code: "not-a-code" })).status).toBe(410);
    expect((await call(setup(null), { action: "issue" })).status).toBe(401);
  });
});
