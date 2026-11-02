import { describe, it, expect } from "vitest";
import { load, mock, request } from "../../../security-tests/helpers.js";
import { cardEmail, caseUpdateEmail, deliverableEmail, passwordChangedEmail, signupInviteEmail, welcomeEmail } from "../../../base44/shared/accountEmails.ts";

// Emails to a person about their own account: what they say, who they can
// reach, and the sign-up day setup link that only works for its own address.

const call = (name, sdk) => async (body) => { const r = await load(name, sdk).default(request(body)); return { status: r.status, body: await r.json() }; };

describe("the emails themselves", () => {
  it("never go to a driver's internal sign-in or a malformed address", () => {
    expect(deliverableEmail(" Ana@Example.com ")).toBe("ana@example.com");
    expect(deliverableEmail("driver.kofi@login.mcsweenstransport.com")).toBe("");
    expect(deliverableEmail("not an email")).toBe("");
    expect(deliverableEmail("")).toBe("");
  });
  it("greet by first name, escape what people typed, and never carry a password or a full card number", () => {
    const welcome = welcomeEmail({ name: "<b>Jane</b> Roberts", role: "staff" });
    expect(welcome.body).toContain("Hi Jane,");
    expect(welcome.body).not.toContain("<b>Jane");
    expect(welcome.body).toContain("Add to Home Screen");
    const staff = welcomeEmail({ name: "Office", role: "admin" });
    expect(staff.body).not.toContain("Add to Home Screen");

    const office = passwordChangedEmail({ name: "Kofi", how: "office", at: Date.parse("2026-11-02T16:05:00Z") });
    expect(office.subject).toBe("Your McSween Transport password was changed");
    expect(office.body).toContain("Ask the office for your temporary password");
    expect(office.body).toMatch(/Monday 2 November.*12:05/);

    const card = cardEmail({ name: "Ben", event: "lost", uid: "04:AA:BB:CC:DD" });
    expect(card.subject).toBe("Your bus card was stopped");
    expect(card.body).toContain("card ending CCDD");
    expect(card.body).not.toContain("04AABBCCDD");
    expect(card.body).not.toContain("04:AA:BB:CC:DD");
    expect(cardEmail({ event: "teleported" })).toBeNull();

    const reply = caseUpdateEmail({ name: "Ana", title: "Reply about TT-7K3Q2M", text: "We can pick you up at 6:45." });
    expect(reply.body).toContain("We can pick you up at 6:45.");
    expect(reply.body).toContain("https://app.mcsweenstransport.com/help");

    const invite = signupInviteEmail({ name: "Dee", hotel: "Coyaba", url: "https://app.mcsweenstransport.com/join#invite=abc", days: 14 });
    expect(invite.subject).toBe("Set up your bus app for Coyaba");
    expect(invite.body).toContain("only works with this email address");
    expect(invite.body).toContain("14 days");
  });
});

function hotel(role = "admin") {
  const sdk = mock(role);
  sdk.tables.Contact = [
    { id: "ana", type: "staff", company_id: "a", name: "Ana Joseph", email: "ana@test.invalid" },
    { id: "cal", type: "staff", company_id: "a", name: "Cal Noel" },
  ];
  // Ana already has an account in hotel A.
  sdk.tables.User.push({ id: "ana-user", role: "staff", email: "ana@test.invalid", full_name: "Ana Joseph" });
  sdk.tables.CompanyMembership.push({ id: "ana-m", user_id: "ana-user", company_id: "a", scope: "passenger", active: true });
  sdk.tables.SignupHelp = [];
  sdk.tables.VerificationGrant = [];
  sdk.tables.AuditLog = [];
  return sdk;
}
const tokenIn = (email) => email.body.match(/#invite=([a-f0-9]{64})/)?.[1];
const ago = (sdk, ms) => { for (const h of sdk.tables.SignupHelp) if (h.invite_sent_at) h.invite_sent_at = new Date(Date.parse(h.invite_sent_at) - ms).toISOString(); };

describe("sign-up day setup email", () => {
  it("goes to someone added with an email address, with a personal link and never the company code", async () => {
    const sdk = hotel();
    const office = call("nfcCards", sdk);
    const added = await office({ action: "signup_add", company_id: "a", name: "Dee Ross", email: "Dee@Test.invalid", send_invite: true });
    expect(added.body).toMatchObject({ ok: true, person_ref: "email:dee@test.invalid", invite: "sent" });
    expect(sdk.emails).toHaveLength(1);
    const [email] = sdk.emails;
    expect(email).toMatchObject({ to: "dee@test.invalid", subject: "Set up your bus app for A", from_name: "McSween Transport" });
    expect(email.body).toContain("Hi Dee,");
    expect(email.body).toMatch(/https:\/\/app\.mcsweenstransport\.com\/join#invite=[a-f0-9]{64}/);
    expect(email.body).not.toContain("JOIN12345678");
    // Only a hash of the link's key is kept.
    const [grant] = sdk.tables.VerificationGrant;
    expect(grant).toMatchObject({ purpose: "signup_invite", subject: "email:dee@test.invalid", company_id: "a" });
    expect(grant.token_hash).toMatch(/^[a-f0-9]{64}$/);
    expect(grant.token_hash).not.toBe(tokenIn(email));
    // The helpers' screen shows when it went out and who sent it.
    const state = await office({ action: "signup_state", company_id: "a" });
    expect(state.body.people.find((p) => p.name === "Dee Ross")).toMatchObject({ invite_sent_by: "Caller" });
    expect(state.body.people.find((p) => p.name === "Dee Ross").invite_sent_at).toBeTruthy();
    expect(sdk.tables.NotificationLog.find((l) => l.key === "signup_invite")).toMatchObject({ status: "sent", company_id: "a" });
  });

  it("is only sent when asked, and not to people who signed in already, have no email, or just got one", async () => {
    const sdk = hotel();
    const office = call("nfcCards", sdk);
    await office({ action: "signup_add", company_id: "a", name: "Eve Lane", email: "eve@test.invalid" });
    expect(sdk.emails).toEqual([]);
    const res = await office({ action: "signup_invite", company_id: "a", person_refs: ["email:ana@test.invalid", "contact:cal", "email:eve@test.invalid", "email:nobody@test.invalid"] });
    expect(res.body.results.map((r) => r.status)).toEqual(["signed_in", "no_email", "sent", "not_on_list"]);
    expect(sdk.emails.map((e) => e.to)).toEqual(["eve@test.invalid"]);
    // Again straight away: held back for a couple of minutes.
    expect((await office({ action: "signup_invite", company_id: "a", person_ref: "email:eve@test.invalid" })).body.results[0].status).toBe("just_sent");
    // Later: a new link, and the first one stops working.
    ago(sdk, 3 * 60_000);
    expect((await office({ action: "signup_invite", company_id: "a", person_ref: "email:eve@test.invalid" })).body.sent).toBe(1);
    const grants = sdk.tables.VerificationGrant;
    expect(grants).toHaveLength(2);
    expect(Date.parse(grants[0].expires_at)).toBeLessThanOrEqual(Date.now());
    expect(Date.parse(grants[1].expires_at)).toBeGreaterThan(Date.now() + 13 * 86400_000);
  });

  it("is held back when switched off, needs the hotel's join code, and stays within the caller's own hotel", async () => {
    const off = hotel();
    off.tables.NotificationSetting = [{ id: "s", key: "signup_invite", enabled: false }];
    const res = await call("nfcCards", off)({ action: "signup_add", company_id: "a", name: "Dee Ross", email: "dee@test.invalid", send_invite: true });
    expect(res.body.invite).toBe("off");
    expect(off.emails).toEqual([]);

    const noCode = hotel();
    noCode.tables.Company[0].access_code = "";
    const refused = await call("nfcCards", noCode)({ action: "signup_add", company_id: "a", name: "Dee Ross", email: "dee@test.invalid", send_invite: true });
    expect(refused.status).toBe(409);
    expect(refused.body.code).toBe("no_join_code");
    expect(noCode.tables.Contact.find((c) => c.name === "Dee Ross")).toBeUndefined();

    // A hotel manager of B can't email A's staff.
    const manager = hotel("company");
    manager.tables.CompanyMembership[0] = { id: "membership", user_id: "caller", company_id: "b", scope: "manager", active: true };
    const other = await call("nfcCards", manager)({ action: "signup_invite", company_id: "a", person_ref: "email:ana@test.invalid" });
    expect(other.status).toBe(403);
    expect(manager.emails).toEqual([]);
  });

  it("hands back who to email after an import, for the page to send in turns", async () => {
    const sdk = hotel();
    const res = await call("nfcCards", sdk)({ action: "signup_import", company_id: "a", rows: [{ name: "Fay Hill", email: "fay@test.invalid" }, { name: "Gus Ray" }, { name: "Ana Joseph", email: "ana@test.invalid" }] });
    expect(res.body).toMatchObject({ added: 2, invite_refs: ["email:fay@test.invalid"] });
    expect(sdk.emails).toEqual([]);
    expect((await call("nfcCards", sdk)({ action: "signup_invite", company_id: "a", person_refs: Array.from({ length: 21 }, (_, i) => `email:p${i}@test.invalid`) })).status).toBe(400);
  });
});

describe("joining with the setup link", () => {
  async function invited() {
    const sdk = hotel();
    await call("nfcCards", sdk)({ action: "signup_add", company_id: "a", name: "Dee Ross", email: "dee@test.invalid", send_invite: true });
    const token = tokenIn(sdk.emails[0]);
    // Dee signs in on her phone.
    sdk.tables.User[0] = { id: "dee-user", role: "staff", email: "Dee@test.invalid", full_name: "Dee Ross" };
    sdk.tables.CompanyMembership = sdk.tables.CompanyMembership.filter((m) => m.user_id !== "caller");
    return { sdk, token, verify: (body) => call("companyAccess", sdk)({ action: "verify", ...body }) };
  }

  it("joins the hotel that sent it, for the address it was sent to", async () => {
    const { sdk, token, verify } = await invited();
    const res = await verify({ invite: token });
    expect(res.status).toBe(200);
    expect(res.body.company).toMatchObject({ id: "a" });
    expect(res.body.grant).toMatch(/^[a-f0-9]{64}$/);
    const member = sdk.tables.CompanyMembership.find((m) => m.user_id === "dee-user" && m.active);
    expect(member).toMatchObject({ company_id: "a", scope: "passenger" });
    expect(member.code_hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("does nothing for anyone else, an old link, or a made-up one", async () => {
    const { sdk, token, verify } = await invited();
    sdk.tables.User[0] = { ...sdk.tables.User[0], email: "forwarded@test.invalid" };
    const other = await verify({ invite: token });
    expect(other.status).toBe(403);
    expect(other.body.code).toBe("INVITE_OTHER_EMAIL");
    expect(sdk.tables.CompanyMembership.some((m) => m.user_id === "dee-user")).toBe(false);

    sdk.tables.User[0] = { ...sdk.tables.User[0], email: "dee@test.invalid" };
    sdk.tables.VerificationGrant[0].expires_at = new Date(Date.now() - 1000).toISOString();
    expect((await verify({ invite: token })).body.code).toBe("INVITE_EXPIRED");
    expect((await verify({ invite: "f".repeat(64) })).body.code).toBe("INVITE_INVALID");
    expect((await verify({ invite: "<script>" })).body.code).toBe("INVITE_INVALID");
    expect(sdk.tables.CompanyMembership.some((m) => m.user_id === "dee-user")).toBe(false);
  });

  it("stops working if the hotel's code is changed", async () => {
    const { sdk, token, verify } = await invited();
    sdk.tables.Company[0].access_code = "";
    expect((await verify({ invite: token })).body.code).toBe("INVITE_INVALID");
  });
});

describe("card emails", () => {
  function cards() {
    const sdk = mock("admin");
    sdk.tables.Contact[0] = { ...sdk.tables.Contact[0], email: "rider@test.invalid", nfc_card_tag: "04AABBCCDD" };
    sdk.tables.NfcCard = [{ id: "c1", company_id: "a", holder_source: "contact", holder_id: "rider", holder_name: "Caller", card_uid: "04AABBCCDD", is_active: true, status: "active" }];
    sdk.tables.AuditLog = [];
    return { sdk, office: call("nfcCards", sdk) };
  }
  it("tell the holder when their card is stopped or switched back on, showing only its last four", async () => {
    const { sdk, office } = cards();
    expect((await office({ action: "revoke", card_id: "c1", status: "suspended" })).status).toBe(200);
    expect((await office({ action: "reactivate", card_id: "c1" })).status).toBe(200);
    expect((await office({ action: "revoke", card_id: "c1", status: "lost" })).status).toBe(200);
    expect(sdk.emails.map((e) => [e.to, e.subject])).toEqual([
      ["rider@test.invalid", "Your bus card is paused"],
      ["rider@test.invalid", "Your bus card works again"],
      ["rider@test.invalid", "Your bus card was stopped"],
    ]);
    for (const e of sdk.emails) { expect(e.body).toContain("card ending CCDD"); expect(e.body).not.toContain("04AABBCCDD"); }
  });
  it("are held back when switched off, and a failed email never undoes the card change", async () => {
    const off = cards();
    off.sdk.tables.NotificationSetting = [{ id: "s", key: "card_update", enabled: false }];
    await off.office({ action: "revoke", card_id: "c1", status: "lost" });
    expect(off.sdk.emails).toEqual([]);
    const broken = cards();
    broken.sdk.asServiceRole.integrations.Core.SendEmail = async () => { throw new Error("mail down"); };
    const res = await broken.office({ action: "revoke", card_id: "c1", status: "lost" });
    expect(res.status).toBe(200);
    expect(broken.sdk.tables.NfcCard[0]).toMatchObject({ is_active: false, status: "lost" });
  });
});

describe("password changed with a reset link", () => {
  const send = (sdk, body) => call("accountEmails", sdk)(body);
  it("emails the signed-in account's own address once, never one from the request", async () => {
    expect((await send(mock(null), { action: "password_changed", changed_at: new Date().toISOString() })).status).toBe(401);
    const sdk = mock("staff");
    const res = await send(sdk, { action: "password_changed", changed_at: new Date().toISOString(), email: "evil@test.invalid", to: "evil@test.invalid" });
    expect(res.body).toEqual({ ok: true, sent: true });
    expect(sdk.emails.map((e) => e.to)).toEqual(["caller@test.invalid"]);
    expect(sdk.emails[0].body).toContain("changed with a reset link");
    // At most one an hour.
    expect((await send(sdk, { action: "password_changed", changed_at: new Date().toISOString() })).body.sent).toBe(false);
    expect(sdk.emails).toHaveLength(1);
  });
  it("ignores an old or made-up time, and is held back when switched off", async () => {
    const old = mock("staff");
    expect((await send(old, { action: "password_changed", changed_at: "2026-01-01T00:00:00Z" })).body.sent).toBe(false);
    expect((await send(old, { action: "password_changed", changed_at: "soon" })).body.sent).toBe(false);
    expect(old.emails).toEqual([]);
    const off = mock("staff");
    off.tables.NotificationSetting = [{ id: "p", key: "password_changed", enabled: false }];
    expect((await send(off, { action: "password_changed", changed_at: new Date().toISOString() })).body.sent).toBe(false);
    expect(off.emails).toEqual([]);
    expect((await send(mock("staff"), { action: "something_else" })).status).toBe(400);
  });
});

describe("the office answers a passenger's request", () => {
  function office() {
    const sdk = mock("admin");
    sdk.tables.User.push({ id: "rider-user", role: "staff", email: "rider@test.invalid", full_name: "Rita Mark" });
    sdk.tables.PassengerCase = [{ id: "c1", reference: "TT-7K3Q2M", kind: "time_change", status: "requested", user_id: "rider-user", user_email: "rider@test.invalid", company_id: "a", replies: [] }];
    sdk.tables.AuditLog = [];
    return { sdk, send: call("passengerCases", sdk) };
  }
  it("emails the passenger the whole reply and status changes", async () => {
    const { sdk, send } = office();
    const long = "Your driver can come at 6:45 from Monday. ".repeat(6).trim();
    expect((await send({ action: "reply", id: "c1", text: long })).status).toBe(200);
    expect((await send({ action: "set_status", id: "c1", status: "confirmed", note: "See you Monday." })).status).toBe(200);
    expect(sdk.emails.map((e) => [e.to, e.subject])).toEqual([
      ["rider@test.invalid", "Reply about TT-7K3Q2M"],
      ["rider@test.invalid", "TT-7K3Q2M: Confirmed"],
    ]);
    expect(sdk.emails[0].body).toContain("Hi Rita,");
    expect(sdk.emails[0].body).toContain(long);
    expect(sdk.emails[1].body).toContain("See you Monday.");
  });
  it("not when the passenger turned these emails off", async () => {
    const { sdk, send } = office();
    sdk.tables.User.find((u) => u.id === "rider-user").notification_opt_out = ["case_update_email"];
    await send({ action: "reply", id: "c1", text: "Checking with your driver." });
    expect(sdk.emails).toEqual([]);
    expect(sdk.tables.PassengerCase[0].replies).toHaveLength(1);
  });
});
