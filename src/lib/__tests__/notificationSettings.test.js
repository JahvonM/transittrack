import { describe, it, expect } from "vitest";
import fs from "node:fs";
import ts from "typescript";
import { inlineShared, load, mock, request } from "../../../security-tests/helpers.js";

// Admin → Notifications: the shared check every email and phone alert passes
// through, and the admin function behind the tab.
function policy() {
  const source = inlineShared("import { NOTIFICATION_TYPES, notificationPolicy, pushWithPolicy, emailWithPolicy } from '../../shared/notificationPolicy.ts';")
    + "\nexport { NOTIFICATION_TYPES, notificationPolicy, pushWithPolicy, emailWithPolicy };";
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const exports = {};
  new Function("exports", js)(exports);
  return exports;
}
const P = policy();
function setup() {
  const sdk = mock("admin");
  sdk.tables.PushToken = [
    { id: "t1", token: "tok-ann", email: "ann@test.invalid" },
    { id: "t2", token: "tok-bob", email: "bob@test.invalid" },
    { id: "t3", token: "tok-shared", email: "bob@test.invalid" },
    { id: "t4", token: "tok-shared", email: "cat@test.invalid" },
    { id: "t5", token: "tok-tablet", device_id: "tablet", role: "driver" },
  ];
  sdk.tables.NotificationSetting = [];
  sdk.tables.NotificationLog = [];
  return sdk;
}
const allTokens = ["tok-ann", "tok-bob", "tok-shared", "tok-tablet"];
const sender = () => { const calls = []; return { calls, send: async (list) => { calls.push(list); return { sent: list.length }; } }; };

describe("notification policy", () => {
  it("sends to everyone and logs it when nothing has been changed", async () => {
    const sdk = setup();
    const s = sender();
    await P.pushWithPolicy(sdk, "chat_message", allTokens, { title: "Bus 1 · Driver" }, s.send);
    expect(s.calls[0]).toEqual(allTokens);
    expect(sdk.tables.NotificationLog).toHaveLength(1);
    expect(sdk.tables.NotificationLog[0]).toMatchObject({ key: "chat_message", channel: "push", status: "sent", sent: 4, skipped: 0 });
    expect(sdk.tables.NotificationLog[0].recipients.sort()).toEqual(["ann@test.invalid", "bob@test.invalid", "bus tablet", "cat@test.invalid"]);
  });

  it("holds back people who were unticked, but keeps a shared device for the others and bus tablets", async () => {
    const sdk = setup();
    sdk.tables.NotificationSetting.push({ id: "s", key: "chat_message", enabled: true, blocked_emails: ["bob@test.invalid", "ANN@test.invalid "] });
    const s = sender();
    await P.pushWithPolicy(sdk, "chat_message", allTokens, { title: "x" }, s.send);
    expect(s.calls[0]).toEqual(["tok-shared", "tok-tablet"]);
    expect(sdk.tables.NotificationLog[0]).toMatchObject({ status: "sent", sent: 2, skipped: 2 });
    expect(sdk.tables.NotificationLog[0].recipients).not.toContain("bob@test.invalid");
  });

  it("sends nothing when a kind is switched off, and says so in the log", async () => {
    const sdk = setup();
    sdk.tables.NotificationSetting.push({ id: "s", key: "stop_ahead", enabled: false, blocked_emails: [] });
    const s = sender();
    await P.pushWithPolicy(sdk, "stop_ahead", ["tok-ann"], { title: "x" }, s.send);
    expect(s.calls).toHaveLength(0);
    expect(sdk.tables.NotificationLog[0]).toMatchObject({ status: "off", sent: 0, skipped: 1 });
  });

  it("never silences SOS: switching it off is ignored and an empty list falls back to everyone", async () => {
    const sdk = setup();
    sdk.tables.NotificationSetting.push({ id: "s", key: "sos", enabled: false, blocked_emails: ["ann@test.invalid", "bob@test.invalid"] });
    const s = sender();
    await P.pushWithPolicy(sdk, "sos", ["tok-ann", "tok-bob"], { title: "SOS" }, s.send);
    expect(s.calls[0]).toEqual(["tok-ann", "tok-bob"]);
    sdk.tables.NotificationSetting[0].blocked_emails = ["ann@test.invalid"];
    await P.pushWithPolicy(sdk, "sos", ["tok-ann", "tok-bob"], { title: "SOS" }, s.send);
    expect(s.calls[1]).toEqual(["tok-bob"]);
  });

  it("sends as before when the settings can't be read", async () => {
    const sdk = setup();
    const entities = sdk.asServiceRole.entities;
    sdk.asServiceRole.entities = new Proxy(entities, { get: (t, name) => (name === "NotificationSetting" ? { filter: async () => { throw new Error("down"); } } : t[name]) });
    const s = sender();
    await P.pushWithPolicy(sdk, "chat_message", ["tok-ann"], { title: "x" }, s.send);
    expect(s.calls[0]).toEqual(["tok-ann"]);
  });

  it("counts devices that didn't accept a push as failed", async () => {
    const sdk = setup();
    await P.pushWithPolicy(sdk, "driver_request", ["tok-ann", "tok-bob"], { title: "x" }, async () => ({ sent: 1 }));
    expect(sdk.tables.NotificationLog[0]).toMatchObject({ status: "partial", sent: 1, failed: 1 });
    await P.pushWithPolicy(sdk, "driver_request", ["tok-ann"], { title: "x" }, async () => ({ sent: 0, error: "Phone alerts are not set up" }));
    expect(sdk.tables.NotificationLog[1]).toMatchObject({ status: "failed", failed: 1, error: "Phone alerts are not set up" });
  });

  it("emails only allowed people, records failures, and logs nothing when nobody was due one", async () => {
    const sdk = setup();
    sdk.tables.NotificationSetting.push({ id: "s", key: "weekly_report", enabled: true, blocked_emails: ["bob@test.invalid"] });
    const sent = [];
    const result = await P.emailWithPolicy(sdk, "weekly_report",
      [{ email: "ann@test.invalid" }, { email: "Bob@test.invalid" }, { email: "cat@test.invalid" }, { email: "ann@test.invalid" }],
      async (r) => { if (r.email.startsWith("cat")) throw new Error("bounced"); sent.push(r.email); }, { title: "Weekly" });
    expect(sent).toEqual(["ann@test.invalid"]);
    expect(result).toMatchObject({ sent: 1, failed: 1, skipped: 1 });
    expect(sdk.tables.NotificationLog[0]).toMatchObject({ channel: "email", status: "partial", recipients: ["ann@test.invalid", "cat@test.invalid"] });
    await P.emailWithPolicy(sdk, "weekly_report", [], async () => {});
    expect(sdk.tables.NotificationLog).toHaveLength(1);
  });

  it("every function that sends an email or a phone alert goes through the policy", () => {
    const root = new URL("../../../base44/functions/", import.meta.url);
    const offenders = [];
    for (const name of fs.readdirSync(root)) {
      const file = new URL(`${name}/entry.ts`, root);
      if (!fs.existsSync(file)) continue;
      const source = fs.readFileSync(file, "utf8");
      const sends = /integrations\.Core\.SendEmail\(|[^.]sendPushToTokens\(serviceAccountJson/.test(source);
      if (!sends) continue;
      const calls = source.split("\n").filter((l) => /integrations\.Core\.SendEmail\(|sendPushToTokens\(/.test(l) && !/async function sendPushToTokens/.test(l));
      const unguarded = calls.filter((l) => !/=> base44\.asServiceRole\.integrations\.Core\.SendEmail|\(list\) => sendPushToTokens|return base44\.asServiceRole\.integrations\.Core\.SendEmail/.test(l));
      if (unguarded.length || !/notificationPolicy\.ts/.test(source)) offenders.push(name);
    }
    expect(offenders).toEqual([]);
  });
});

function adminSetup(role = "admin") {
  const sdk = mock(role);
  sdk.tables.User.push(
    { id: "a2", role: "admin", email: "boss@test.invalid", full_name: "Boss" },
    { id: "m1", role: "company", email: "manager@test.invalid", full_name: "Manny" },
    { id: "k1", role: "mechanic", email: "mech@test.invalid", full_name: "Mo" },
    { id: "p1", role: "passenger", email: "pat@test.invalid", full_name: "Pat" },
    { id: "p2", role: "passenger", email: "nomember@test.invalid", full_name: "No Member" },
  );
  sdk.tables.CompanyMembership.push(
    { id: "mm", user_id: "m1", company_id: "a", scope: "manager", active: true },
    { id: "pm", user_id: "p1", company_id: "a", scope: "passenger", active: true },
  );
  sdk.tables.Driver = [{ id: "d1", full_name: "Dee", email: "dee@test.invalid", company_id: "a", phone_app_access: true }];
  sdk.tables.NotificationSetting = [];
  sdk.tables.NotificationLog = [];
  sdk.tables.AuditLog = [];
  sdk.asServiceRole.integrations.Core.SendEmail = async (data) => { sdk.emails.push(data); return {}; };
  const call = async (body) => { const r = await load("notificationSettings", sdk).default(request(body)); return { status: r.status, body: await r.json() }; };
  return { sdk, call };
}

describe("notificationSettings function", () => {
  it("is for administrators only", async () => {
    for (const role of ["company", "mechanic", "staff", "passenger"]) {
      const { call } = adminSetup(role);
      expect((await call({ action: "overview" })).status).toBe(403);
    }
  });

  it("lists every kind and the people each can reach", async () => {
    const { call } = adminSetup();
    const { status, body } = await call({ action: "overview" });
    expect(status).toBe(200);
    expect(body.types.map((t) => t.key)).toContain("weekly_report");
    expect(body.people.admin.map((p) => p.email).sort()).toEqual(["boss@test.invalid", "caller@test.invalid"]);
    expect(body.people.company).toEqual([{ email: "manager@test.invalid", name: "Manny", company: "A", company_id: "a", opted_out: [] }]);
    expect(body.people.mechanic.map((p) => p.email)).toEqual(["mech@test.invalid"]);
    // Only passengers with an approved company membership.
    expect(body.people.passenger.map((p) => p.email)).toEqual(["pat@test.invalid"]);
    expect(body.people.driver.map((p) => p.email)).toEqual(["dee@test.invalid"]);
  });

  it("saves choices, records them in Change history, and keeps SOS reaching someone", async () => {
    const { sdk, call } = adminSetup();
    expect((await call({ action: "save", key: "nope", enabled: true, blocked_emails: [] })).status).toBe(400);
    expect((await call({ action: "save", key: "sos", enabled: false, blocked_emails: [] })).status).toBe(400);
    expect((await call({ action: "save", key: "sos", enabled: true, blocked_emails: ["caller@test.invalid", "boss@test.invalid"] })).status).toBe(400);
    const ok = await call({ action: "save", key: "crash_alert", enabled: true, blocked_emails: ["Boss@test.invalid", "not-an-email"] });
    expect(ok.status).toBe(200);
    expect(sdk.tables.NotificationSetting).toEqual([expect.objectContaining({ key: "crash_alert", enabled: true, blocked_emails: ["boss@test.invalid"] })]);
    await call({ action: "save", key: "crash_alert", enabled: false, blocked_emails: [] });
    expect(sdk.tables.NotificationSetting).toHaveLength(1);
    expect(sdk.tables.NotificationSetting[0].enabled).toBe(false);
    expect(sdk.tables.AuditLog.map((r) => r.summary)).toEqual(["Crash alert (email): on, 1 person left out", "Crash alert (email): off"]);
  });

  it("sends a test email to the admin and shows it in the recent list", async () => {
    const { sdk, call } = adminSetup();
    const res = await call({ action: "test", channel: "email" });
    expect(res).toEqual({ status: 200, body: { ok: true, to: "caller@test.invalid" } });
    expect(sdk.emails.map((e) => e.to)).toEqual(["caller@test.invalid"]);
    const recent = await call({ action: "recent" });
    expect(recent.body.recent[0]).toMatchObject({ key: "test", channel: "email", status: "sent" });
    expect((await call({ action: "test", channel: "push" })).status).toBe(409); // no device signed up
  });
});

describe("senders honour the settings", () => {
  it("the weekly report skips an admin who was unticked", async () => {
    const { sdk } = adminSetup();
    sdk.tables.NotificationSetting.push({ id: "s", key: "weekly_report", enabled: true, blocked_emails: ["boss@test.invalid"] });
    const res = await load("weeklyReport", sdk).default(request({}));
    expect(res.status).toBe(200);
    expect(sdk.emails.map((e) => e.to)).toEqual(["caller@test.invalid"]);
    expect(sdk.tables.NotificationLog[0]).toMatchObject({ key: "weekly_report", sent: 1, skipped: 1 });
  });

  it("a crash alert sends its message in the email body", async () => {
    const { sdk } = adminSetup();
    sdk.tables.ClientError = [];
    await load("reportClientError", sdk).default(request({ message: "Boom" }));
    expect(sdk.emails.length).toBe(2);
    expect(sdk.emails[0].body).toContain("Boom");
  });
});

describe("company switches and passengers' own choices", () => {
  it("a kind switched off for one company sends nothing about that company's buses, but still for others", async () => {
    const sdk = setup();
    sdk.tables.NotificationSetting.push({ id: "s", key: "chat_message", enabled: true, blocked_emails: [], blocked_company_ids: ["a"] });
    const s = sender();
    await P.pushWithPolicy(sdk, "chat_message", ["tok-ann"], { title: "x" }, s.send, { companyId: "a" });
    expect(s.calls).toHaveLength(0);
    expect(sdk.tables.NotificationLog[0]).toMatchObject({ status: "off", company_id: "a" });
    await P.pushWithPolicy(sdk, "chat_message", ["tok-ann"], { title: "x" }, s.send, { companyId: "b" });
    expect(s.calls).toEqual([["tok-ann"]]);
    // SOS ignores company switches; kinds that aren't per company ignore them too.
    sdk.tables.NotificationSetting.push({ id: "t", key: "sos", enabled: true, blocked_emails: [], blocked_company_ids: ["a"] });
    await P.pushWithPolicy(sdk, "sos", ["tok-ann"], { title: "SOS" }, s.send, { companyId: "a" });
    expect(s.calls).toHaveLength(2);
  });

  it("passengers who turned a kind off don't get it; a shared phone still does for the other person", async () => {
    const sdk = setup();
    sdk.tables.User.push(
      { id: "u-bob", role: "passenger", email: "bob@test.invalid", notification_opt_out: ["chat_message"] },
      { id: "u-ann", role: "passenger", email: "ann@test.invalid", notification_opt_out: ["weekly_report"] },
    );
    const s = sender();
    await P.pushWithPolicy(sdk, "chat_message", allTokens, { title: "x" }, s.send);
    expect(s.calls[0]).toEqual(["tok-ann", "tok-shared", "tok-tablet"]);
    // Opting out only works for kinds passengers are allowed to choose.
    const sent = [];
    await P.emailWithPolicy(sdk, "weekly_report", [{ email: "ann@test.invalid" }], async (r) => { sent.push(r.email); });
    expect(sent).toEqual(["ann@test.invalid"]);
    sdk.tables.User.find((u) => u.id === "u-ann").notification_opt_out = ["bus_approaching_email"];
    const r = await P.emailWithPolicy(sdk, "bus_approaching_email", [{ email: "ann@test.invalid" }], async (x) => { sent.push(x.email); });
    expect(r).toMatchObject({ sent: 0, skipped: 1 });
  });

  it("the pickup email isn't sent when its company is switched off", async () => {
    const { sdk } = adminSetup();
    sdk.tables.Vehicle[0].driver_email = "";
    sdk.tables.NotificationSetting.push({ id: "s", key: "bus_approaching_email", enabled: true, blocked_emails: [], blocked_company_ids: ["a"] });
    const res = await load("notifyStaffPickup", sdk).default(request({ to_email: "pat@test.invalid", vehicle_id: "bus-a" }));
    expect(res.status).toBe(200);
    expect(sdk.emails).toEqual([]);
  });

  it("admins see companies and who turned things off; unknown companies are dropped on save", async () => {
    const { sdk, call } = adminSetup();
    sdk.tables.User.find((u) => u.id === "p1").notification_opt_out = ["chat_message", "nonsense"];
    const { body } = await call({ action: "overview" });
    expect(body.companies).toEqual([{ id: "a", name: "A" }, { id: "b", name: "B" }]);
    expect(body.people.passenger[0]).toMatchObject({ email: "pat@test.invalid", company_id: "a", opted_out: ["chat_message"] });
    await call({ action: "save", key: "chat_message", enabled: true, blocked_emails: [], blocked_company_ids: ["b", "ghost"] });
    expect(sdk.tables.NotificationSetting[0].blocked_company_ids).toEqual(["b"]);
    // Company switches only apply to kinds about one company's buses.
    await call({ action: "save", key: "weekly_report", enabled: true, blocked_emails: [], blocked_company_ids: ["a"] });
    expect(sdk.tables.NotificationSetting[1].blocked_company_ids).toEqual([]);
    expect((await call({ action: "save", key: "chat_message", enabled: true, blocked_emails: [], blocked_company_ids: "a" })).status).toBe(400);
  });
});

describe("myNotifications (passenger's own choices)", () => {
  const mine = async (sdk, body) => { const r = await load("myNotifications", sdk).default(request(body)); return { status: r.status, body: await r.json() }; };
  it("is for passengers only", async () => {
    for (const role of ["admin", "company", "mechanic", "driver"]) expect((await mine(mock(role), { action: "get" })).status).toBe(403);
  });
  it("lists the kinds a passenger can choose and saves turning one off", async () => {
    const sdk = mock("passenger");
    sdk.tables.NotificationSetting = [];
    const got = await mine(sdk, { action: "get" });
    expect(got.body.choices.map((c) => [c.key, c.on, c.available])).toEqual([
      ["chat_message", true, true], ["bus_approaching_push", true, true], ["bus_approaching_email", true, true],
    ]);
    const off = await mine(sdk, { action: "set", key: "chat_message", on: false });
    expect(off.body.choices[0]).toMatchObject({ key: "chat_message", on: false });
    expect(sdk.tables.User[0].notification_opt_out).toEqual(["chat_message"]);
    await mine(sdk, { action: "set", key: "chat_message", on: true });
    expect(sdk.tables.User[0].notification_opt_out).toEqual([]);
    expect((await mine(sdk, { action: "set", key: "sos", on: false })).status).toBe(400);
    expect((await mine(sdk, { action: "set", key: "weekly_report", on: false })).status).toBe(400);
  });
  it("shows a kind as unavailable when the admin switched it off for them, their company or everyone", async () => {
    const sdk = mock("passenger");
    sdk.tables.NotificationSetting = [
      { id: "1", key: "chat_message", enabled: true, blocked_emails: [], blocked_company_ids: ["a"] },
      { id: "2", key: "bus_approaching_push", enabled: true, blocked_emails: ["caller@test.invalid"] },
      { id: "3", key: "bus_approaching_email", enabled: false, blocked_emails: [] },
    ];
    const got = await mine(sdk, { action: "get" });
    expect(got.body.choices.map((c) => c.available)).toEqual([false, false, false]);
  });
});
