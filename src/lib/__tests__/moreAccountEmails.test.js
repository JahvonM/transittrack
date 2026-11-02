import { describe, it, expect } from "vitest";
import { load, mock, request } from "../../../security-tests/helpers.js";
import { deviceLabel } from "@/lib/signInDevice";

// Five more emails to the person themselves: office access given, bus or
// pickup changed by the office, card ending soon, driver app account (in
// driverAccountFixes.test.js) and a new sign-in on a new phone or browser.

const call = (name, sdk) => async (body) => { const r = await load(name, sdk).default(request(body)); return { status: r.status, body: await r.json() }; };
const DAY = 86_400_000;

describe("office access given", () => {
  function office(role = "admin") {
    const sdk = mock(role);
    sdk.tables.User.push({ id: "kim", role: "staff", email: "kim@test.invalid", full_name: "Kim Lee" });
    sdk.tables.AccessRole = [{ id: "r1", name: "Dispatcher", active: true, sections: ["fleet"] }];
    sdk.tables.RoleAssignment = [];
    return { sdk, roles: call("accessRoles", sdk) };
  }
  const kim = (sdk) => sdk.tables.User.find((u) => u.id === "kim");

  it("tells someone made a mechanic, or a company manager of their company", async () => {
    const { sdk, roles } = office();
    expect((await roles({ action: "set_user_role", user_id: "kim", role: "mechanic" })).body).toEqual({ ok: true, emailed: true });
    expect(kim(sdk).role).toBe("mechanic");
    expect((await roles({ action: "set_user_role", user_id: "kim", role: "company", company_id: "a" })).body.emailed).toBe(true);
    expect(kim(sdk)).toMatchObject({ role: "company", company_id: "a" });
    expect(sdk.emails.map((e) => [e.to, e.subject])).toEqual([
      ["kim@test.invalid", "Your McSween Transport access has changed"],
      ["kim@test.invalid", "Your McSween Transport access has changed"],
    ]);
    expect(sdk.emails[0].body).toContain("You now have mechanic access");
    expect(sdk.emails[1].body).toContain("You can now manage A");
  });

  it("says nothing when the role doesn't give office access or doesn't change", async () => {
    const { sdk, roles } = office();
    await roles({ action: "set_user_role", user_id: "kim", role: "staff" });
    await roles({ action: "set_user_role", user_id: "kim", role: "driver" });
    kim(sdk).role = "admin";
    await roles({ action: "set_user_role", user_id: "kim", role: "admin" });
    expect(sdk.emails).toEqual([]);
  });

  it("is for admins only and checks what it's given", async () => {
    const { sdk, roles } = office("company");
    expect((await roles({ action: "set_user_role", user_id: "kim", role: "admin" })).status).toBe(403);
    expect(kim(sdk).role).toBe("staff");
    const admin = office();
    expect((await admin.roles({ action: "set_user_role", user_id: "kim", role: "owner" })).status).toBe(400);
    expect((await admin.roles({ action: "set_user_role", user_id: "nobody", role: "mechanic" })).status).toBe(404);
    expect((await admin.roles({ action: "set_user_role", user_id: "kim", role: "company", company_id: "zzz" })).status).toBe(404);
    expect(kim(admin.sdk).role).toBe("staff");
  });

  it("tells someone given a custom role, by its name, and is held back when switched off", async () => {
    const { sdk, roles } = office();
    expect((await roles({ action: "assign", user_id: "kim", role_id: "r1" })).status).toBe(200);
    expect(sdk.emails).toHaveLength(1);
    expect(sdk.emails[0].body).toContain("been given the Dispatcher role");
    const off = office();
    off.sdk.tables.NotificationSetting = [{ id: "s", key: "access_given", enabled: false }];
    expect((await off.roles({ action: "set_user_role", user_id: "kim", role: "admin" })).body).toEqual({ ok: true, emailed: false });
    expect(off.sdk.emails).toEqual([]);
    expect(kim(off.sdk).role).toBe("admin");
  });
});

describe("bus or pickup changed by the office", () => {
  const point = (name, lat) => ({ pickup_name: name, pickup_lat: lat, pickup_lng: -61.748 });
  function directory() {
    const sdk = mock("admin");
    sdk.tables.Contact = [{ id: "pat-card", type: "staff", company_id: "a", name: "Pat Roy", email: "Pat@Test.invalid", vehicle_id: "bus-a" }];
    sdk.tables.Vehicle.push({ id: "bus-c", company_id: "a", name: "Bus C" });
    return { sdk, office: call("nfcCards", sdk) };
  }
  it("tells a passenger moved to another bus, or taken off one", async () => {
    const { sdk, office } = directory();
    expect((await office({ action: "set_bus", person_key: "contact:pat-card", vehicle_id: "bus-c" })).status).toBe(200);
    expect((await office({ action: "set_bus", person_key: "contact:pat-card", vehicle_id: "bus-c" })).status).toBe(200);
    expect((await office({ action: "set_bus", person_key: "contact:pat-card", vehicle_id: "" })).status).toBe(200);
    expect(sdk.emails.map((e) => [e.to, e.subject])).toEqual([
      ["pat@test.invalid", "You now ride Bus C"],
      ["pat@test.invalid", "You have been taken off your bus"],
    ]);
    expect(sdk.emails[0].body).toContain("(you were on Bus A)");
    expect(sdk.emails[1].body).toContain("took you off Bus C");
  });
  it("tells them when a pickup spot they already had is moved, not when it's first set", async () => {
    const { sdk, office } = directory();
    await office({ action: "set_pickup", person_key: "contact:pat-card", ...point("Belmont junction", 12.049) });
    expect(sdk.emails).toEqual([]);
    await office({ action: "set_pickup", person_key: "contact:pat-card", ...point("Belmont junction", 12.049) });
    expect(sdk.emails).toEqual([]);
    await office({ action: "set_pickup", person_key: "contact:pat-card", ...point("Grand Anse roundabout", 12.031) });
    expect(sdk.emails.map((e) => e.subject)).toEqual(["Your pickup spot has changed"]);
    expect(sdk.emails[0].body).toContain("Grand Anse roundabout");
  });
});

describe("card ending soon", () => {
  const day = (offset) => new Date(Date.now() + offset * DAY).toLocaleDateString("en-CA", { timeZone: "America/Grenada" });
  function fleet() {
    const sdk = mock("admin");
    Object.assign(sdk.tables, { MaintenanceSchedule: [], MaintenanceSettings: [], JobRun: [] });
    sdk.tables.Contact[0].email = "rider@test.invalid";
    sdk.tables.NfcCard = [
      { id: "soon", company_id: "a", holder_source: "contact", holder_id: "rider", holder_name: "Rita", card_uid: "04AABBCCDD", is_active: true, expiry_date: day(10) },
      { id: "later", company_id: "a", holder_source: "contact", holder_id: "rider", holder_name: "Rita", card_uid: "04EEEEEEEE", is_active: true, expiry_date: day(40) },
      { id: "stopped", company_id: "a", holder_source: "contact", holder_id: "rider", holder_name: "Rita", card_uid: "04FFFFFFFF", is_active: false, expiry_date: day(5) },
      { id: "gone", company_id: "a", holder_source: "contact", holder_id: "rider", holder_name: "Rita", card_uid: "04DDDDDDDD", is_active: true, expiry_date: day(-2) },
    ];
    return { sdk, run: call("maintenanceAlerts", sdk) };
  }
  it("emails the holder once, 14 days or less before the end date, from the daily job", async () => {
    const { sdk, run } = fleet();
    const first = await run({});
    expect(first.status).toBe(200);
    expect(first.body.cards).toEqual({ due: 1, sent: 1 });
    expect(sdk.emails.map((e) => [e.to, e.subject])).toEqual([["rider@test.invalid", "Your bus card ends soon"]]);
    expect(sdk.emails[0].body).toContain("card ending CCDD");
    expect(sdk.emails[0].body).not.toContain("04AABBCCDD");
    expect(sdk.tables.NfcCard.find((c) => c.id === "soon").expiry_notice_for).toBe(day(10));
    // The next morning: nothing new.
    expect((await run({})).body.cards).toEqual({ due: 0, sent: 0 });
    expect(sdk.emails).toHaveLength(1);
    // Renewed with a new end date: told again when that one comes close.
    sdk.tables.NfcCard.find((c) => c.id === "soon").expiry_date = day(12);
    expect((await run({})).body.cards.sent).toBe(1);
  });
  it("is held back when switched off, and the maintenance reminders still run", async () => {
    const { sdk, run } = fleet();
    sdk.tables.NotificationSetting = [{ id: "s", key: "card_expiring", enabled: false }];
    const res = await run({});
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ alerted: false, cards: { due: 1, sent: 0 } });
    expect(sdk.emails).toEqual([]);
  });
});

describe("new sign-in on a new phone or browser", () => {
  function account({ ageDays = 30 } = {}) {
    const sdk = mock("staff");
    sdk.tables.User[0].created_date = new Date(Date.now() - ageDays * DAY).toISOString();
    sdk.tables.SignInDevice = [];
    return { sdk, signIn: (device_id, device) => call("accountEmails", sdk)({ action: "signed_in", device_id, device }) };
  }
  const A = "a".repeat(32), B = "b".repeat(32), C = "c".repeat(32);
  const settledIn = (sdk) => { for (const r of sdk.tables.SignInDevice) r.first_seen_at = new Date(Date.now() - 3 * DAY).toISOString(); };

  it("says nothing for the first device, then emails about a new kind of phone or browser", async () => {
    const { sdk, signIn } = account();
    expect((await signIn(A, "Safari on an iPhone")).body).toMatchObject({ known: false, alerted: false });
    expect((await signIn(A, "Safari on an iPhone")).body).toMatchObject({ known: true });
    settledIn(sdk);
    expect((await signIn(B, "Chrome on a Windows computer")).body).toMatchObject({ known: false, alerted: true });
    expect(sdk.emails.map((e) => [e.to, e.subject])).toEqual([["caller@test.invalid", "New sign-in to your McSween Transport account"]]);
    expect(sdk.emails[0].body).toContain("Chrome on a Windows computer");
    expect(sdk.emails[0].body).toContain("https://app.mcsweenstransport.com/forgot-password");
    // The same kind of phone again (browser data cleared): no email.
    expect((await signIn(C, "Safari on an iPhone")).body.alerted).toBe(false);
    expect(sdk.emails).toHaveLength(1);
    // Only a hash of the browser's id is kept.
    expect(JSON.stringify(sdk.tables.SignInDevice)).not.toContain(A);
  });
  it("is quiet on a new account's first day, at most three a day, and checks the id", async () => {
    const fresh = account({ ageDays: 0 });
    await fresh.signIn(A, "Safari on an iPhone");
    expect((await fresh.signIn(B, "the app on an iPhone")).body.alerted).toBe(false);
    expect(fresh.sdk.emails).toEqual([]);

    const { sdk, signIn } = account();
    await signIn(A, "Safari on an iPhone");
    settledIn(sdk);
    for (const [i, kind] of ["Chrome on a Mac", "Firefox on a Mac", "Edge on a Windows computer", "Opera on a Linux computer"].entries()) await signIn(String(i).repeat(32), kind);
    expect(sdk.emails).toHaveLength(3);
    expect((await signIn("short", "x")).status).toBe(400);
    expect((await call("accountEmails", mock(null))({ action: "signed_in", device_id: A })).status).toBe(401);
  });
  it("is held back when switched off", async () => {
    const { sdk, signIn } = account();
    sdk.tables.NotificationSetting = [{ id: "s", key: "new_sign_in", enabled: false }];
    await signIn(A, "Safari on an iPhone");
    settledIn(sdk);
    expect((await signIn(B, "Chrome on a Mac")).body.alerted).toBe(false);
    expect(sdk.emails).toEqual([]);
  });
  it("describes the phone or browser in plain words", () => {
    expect(deviceLabel("Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1")).toBe("Safari on an iPhone");
    expect(deviceLabel("Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148", true)).toBe("the app on an iPhone");
    expect(deviceLabel("Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Mobile Safari/537.36")).toBe("Chrome on an Android phone");
    expect(deviceLabel("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36 Edg/129.0")).toBe("Edge on a Windows computer");
    expect(deviceLabel("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15")).toBe("Safari on a Mac");
  });
});
