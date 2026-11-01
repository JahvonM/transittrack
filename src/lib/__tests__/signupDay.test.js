import { describe, it, expect } from "vitest";
import { load, mock, request } from "../../../security-tests/helpers.js";

// Sign-up day at a hotel: helpers on different devices share one list of the
// hotel's staff with four ticks each (app, signed in, pickup, card) and see
// who is helping whom. Admins can run it for any hotel; a hotel manager only
// for their own.

const call = async (sdk, body) => {
  const res = await load("nfcCards", sdk).default(request(body));
  return { status: res.status, body: await res.json() };
};

function hotel(role = "admin") {
  const sdk = mock(role);
  sdk.tables.Contact = [
    { id: "ana", type: "staff", company_id: "a", name: "Ana Joseph", email: "Ana@Test.invalid" },
    { id: "ben", type: "staff", company_id: "a", name: "Ben Charles", email: "ben@test.invalid", pickup_name: "Grand Anse", pickup_lat: 12.02, pickup_lng: -61.76 },
    { id: "cal", type: "staff", company_id: "a", name: "Cal Noel" },
    { id: "other", type: "staff", company_id: "b", name: "Other Hotel", email: "other@test.invalid" },
  ];
  // Ana has an account in hotel A and gets alerts; Ben has a card.
  sdk.tables.User.push({ id: "ana-user", role: "staff", email: "ana@test.invalid", full_name: "Ana Joseph" });
  sdk.tables.CompanyMembership.push({ id: "ana-m", user_id: "ana-user", company_id: "a", scope: "passenger", active: true });
  sdk.tables.PushToken = [{ id: "t1", token: "tok", email: "ANA@test.invalid" }];
  sdk.tables.NfcCard = [{ id: "card", holder_source: "contact", holder_id: "ben", company_id: "a", is_active: true, card_uid: "04AABBCCDD" }];
  sdk.tables.SignupHelp = [];
  return sdk;
}
const byName = (body, name) => body.people.find((p) => p.name === name);

describe("sign-up day", () => {
  it("lists only the hotel's staff with their four ticks and the hotel's join code", async () => {
    const sdk = hotel();
    const { status, body } = await call(sdk, { action: "signup_state", company_id: "a" });
    expect(status).toBe(200);
    expect(body.company).toMatchObject({ id: "a", name: "A", join_code: "JOIN12345678" });
    expect(body.people.map((p) => p.name).sort()).toEqual(["Ana Joseph", "Ben Charles", "Cal Noel"]);
    expect(byName(body, "Ana Joseph")).toMatchObject({ ref: "email:ana@test.invalid", registered: true, app: "alerts", pickup: false, card: "" });
    expect(byName(body, "Ben Charles")).toMatchObject({ registered: false, app: "", pickup: true, pickup_name: "Grand Anse", card: "issued", card_tail: "CCDD" });
    expect(byName(body, "Cal Noel").ref).toBe("contact:cal");
    // Card numbers stay on the server; only the last four show.
    expect(JSON.stringify(body)).not.toContain("04AABBCCDD");
  });

  it("shows who is helping whom, and stops a second helper taking the same person unless they take over", async () => {
    const sdk = hotel();
    expect((await call(sdk, { action: "signup_claim", company_id: "a", person_ref: "email:ben@test.invalid" })).body.ok).toBe(true);
    let state = (await call(sdk, { action: "signup_state", company_id: "a" })).body;
    expect(byName(state, "Ben Charles").helper).toMatchObject({ name: "Caller", mine: true });

    // Another helper's device.
    sdk.tables.User[0] = { ...sdk.tables.User[0], id: "kerry", full_name: "Kerry" };
    const taken = await call(sdk, { action: "signup_claim", company_id: "a", person_ref: "email:ben@test.invalid" });
    expect(taken.status).toBe(409);
    expect(taken.body).toMatchObject({ code: "taken", helper_name: "Caller" });
    state = (await call(sdk, { action: "signup_state", company_id: "a" })).body;
    expect(byName(state, "Ben Charles").helper).toMatchObject({ name: "Caller", mine: false });
    // Letting go of someone else's person needs a take-over too.
    await call(sdk, { action: "signup_claim", company_id: "a", person_ref: "email:ben@test.invalid", release: true });
    expect(byName((await call(sdk, { action: "signup_state", company_id: "a" })).body, "Ben Charles").helper.name).toBe("Caller");
    expect((await call(sdk, { action: "signup_claim", company_id: "a", person_ref: "email:ben@test.invalid", take_over: true })).body.ok).toBe(true);
    expect(byName((await call(sdk, { action: "signup_state", company_id: "a" })).body, "Ben Charles").helper).toMatchObject({ name: "Kerry", mine: true });
  });

  it("lets an old claim lapse so a helper who walked away doesn't block anyone", async () => {
    const sdk = hotel();
    sdk.tables.SignupHelp = [{ id: "h", company_id: "a", person_ref: "contact:cal", helper_id: "gone", helper_name: "Gone", claimed_at: new Date(Date.now() - 21 * 60_000).toISOString() }];
    expect(byName((await call(sdk, { action: "signup_state", company_id: "a" })).body, "Cal Noel").helper).toBe(null);
    expect((await call(sdk, { action: "signup_claim", company_id: "a", person_ref: "contact:cal" })).body.ok).toBe(true);
  });

  it("ticks and unticks \"has the app\"", async () => {
    const sdk = hotel();
    await call(sdk, { action: "signup_app", company_id: "a", person_ref: "contact:cal", has_app: true });
    expect(byName((await call(sdk, { action: "signup_state", company_id: "a" })).body, "Cal Noel").app).toBe("ticked");
    await call(sdk, { action: "signup_app", company_id: "a", person_ref: "contact:cal", has_app: false });
    expect(byName((await call(sdk, { action: "signup_state", company_id: "a" })).body, "Cal Noel").app).toBe("");
  });

  it("adds someone on the spot, and finds them instead of adding them twice", async () => {
    const sdk = hotel();
    const added = await call(sdk, { action: "signup_add", company_id: "a", name: "Dee Pierre", email: "Dee@Test.invalid", phone: "473 555 0101" });
    expect(added.body).toMatchObject({ ok: true, person_ref: "email:dee@test.invalid" });
    expect(sdk.tables.Contact.find((c) => c.name === "Dee Pierre")).toMatchObject({ type: "staff", company_id: "a", email: "dee@test.invalid" });
    const again = await call(sdk, { action: "signup_add", company_id: "a", name: "Dee P", email: "dee@test.invalid" });
    expect(again.body).toMatchObject({ ok: true, existing: true, name: "Dee Pierre" });
    expect((await call(sdk, { action: "signup_add", company_id: "a", name: "X", email: "not-an-email" })).status).toBe(400);
  });

  it("imports the hotel's staff list, skipping people already on it and rows it can't use", async () => {
    const sdk = hotel();
    const { body } = await call(sdk, { action: "signup_import", company_id: "a", rows: [
      { name: "Eve Mark", email: "eve@test.invalid", employee_id: "H-12" },
      { name: "Ben Again", email: "BEN@test.invalid" },
      { name: "Cal Noel" },
      { name: "", email: "nobody@test.invalid" },
      { name: "Bad Email", email: "bad@" },
      { name: "Eve Twice", email: "eve@test.invalid" },
    ] });
    expect(body).toMatchObject({ ok: true, added: 1 });
    expect(body.skipped.map((s) => s.reason)).toEqual(["Already on the list", "Already on the list", "No name", "Email looks wrong", "Already on the list"]);
    expect(sdk.tables.Contact.filter((c) => c.company_id === "a")).toHaveLength(4);
  });

  it("keeps a hotel manager to their own hotel", async () => {
    const sdk = hotel("company");
    const own = await call(sdk, { action: "signup_state" });
    expect(own.status).toBe(200);
    expect(own.body.company.id).toBe("a");
    const writes = sdk.writes.length;
    for (const body of [
      { action: "signup_state", company_id: "b" },
      { action: "signup_add", company_id: "b", name: "Sneaky" },
      { action: "signup_import", company_id: "b", rows: [{ name: "Sneaky" }] },
      { action: "signup_claim", company_id: "b", person_ref: "email:other@test.invalid" },
    ]) expect((await call(sdk, body)).status).toBe(403);
    // Someone from another hotel can't be claimed through your own hotel either.
    expect((await call(sdk, { action: "signup_claim", person_ref: "email:other@test.invalid" })).status).toBe(404);
    expect(sdk.writes).toHaveLength(writes);
  });

  it.each([null, "staff", "passenger", "driver", "mechanic"])("refuses %s accounts", async (role) => {
    const sdk = hotel(role);
    expect((await call(sdk, { action: "signup_state", company_id: "a" })).status).toBe(403);
    expect((await call(sdk, { action: "signup_add", company_id: "a", name: "X" })).status).toBe(403);
    expect(sdk.writes).toEqual([]);
  });
});
