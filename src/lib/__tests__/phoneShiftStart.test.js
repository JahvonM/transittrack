import { describe, it, expect } from "vitest";
import { load, mock, request } from "../../../security-tests/helpers.js";

// Step 2: the locked bus tablet shows a short code, a driver claims it from
// the phone app, the shift starts and the tablet gets its driver pass.
function setup({ role = "staff", access = true, assigned = true, company = "a" } = {}) {
  const sdk = mock(role);
  sdk.tables.KioskDevice[0].kiosk_type = "driver";
  Object.assign(sdk.tables.Vehicle[0], { driver_email: assigned ? "caller@test.invalid" : "someone@test.invalid", driver_name: "Dana Driver" });
  sdk.tables.Driver = [{ id: "drv", full_name: "Dana Driver", email: "caller@test.invalid", company_id: company, phone_app_access: access }];
  sdk.tables.DriverShift = [];
  sdk.tables.StaffCheckIn = [{ id: "c1", company_id: "a", vehicle_id: "bus-a", staff_name: "Jane", card_tag: "T1", status: "boarded", created_date: "2026-10-07T05:00:00Z" }];
  sdk.tables.Inspection = []; sdk.tables.InspectionResult = []; sdk.tables.Fault = [];
  const uploads = [];
  sdk.asServiceRole.integrations.Core.UploadFile = async ({ file }) => { uploads.push(file); return { file_url: `https://files.test/${file.name}` }; };
  const tablet = load("driverSession", sdk, ["validGrant"]);
  const phone = load("driverPhone", sdk);
  const call = async (api, body) => { const r = await api.default(request(body)); return { status: r.status, body: await r.json() }; };
  return {
    sdk, uploads, tablet,
    fromTablet: (body) => call(tablet, { device_id: "tablet", ...body }),
    fromPhone: (body) => call(phone, body),
  };
}

describe("start the shift from the phone", () => {
  it("unlocks the tablet for the driver who claimed its code", async () => {
    const t = setup();
    const shown = await t.fromTablet({ action: "phone_unlock_code" });
    expect(shown.status).toBe(200);
    expect(shown.body.code).toMatch(/^[A-HJKMNP-Z2-9]{6}$/);
    expect(JSON.stringify(t.sdk.tables.PhoneUnlock)).not.toContain(shown.body.code);
    expect((await t.fromTablet({ action: "phone_unlock_status", unlock_id: shown.body.unlock_id })).body.status).toBe("pending");

    const typed = shown.body.code.slice(0, 3).toLowerCase() + "-" + shown.body.code.slice(3);
    const claim = await t.fromPhone({ action: "claim_bus", code: typed });
    expect(claim.status).toBe(200);
    expect(t.sdk.tables.DriverShift).toEqual([expect.objectContaining({ vehicle_id: "bus-a", driver_email: "caller@test.invalid", started_with: "phone" })]);
    expect(t.sdk.tables.StaffCheckIn.at(-1)).toMatchObject({ staff_name: "Jane", status: "off_board" });

    const unlocked = await t.fromTablet({ action: "phone_unlock_status", unlock_id: shown.body.unlock_id });
    expect(unlocked.body).toMatchObject({ status: "unlocked", driver_name: "Dana Driver" });
    const device = t.sdk.tables.KioskDevice[0];
    expect(await t.tablet.validGrant(t.sdk, device, unlocked.body.driver_grant, "driver", "bus-a")).toBe(true);
    // The pass then opens the tablet's driver-only actions.
    expect((await t.fromTablet({ action: "my_documents", driver_grant: unlocked.body.driver_grant })).body.code).not.toBe("DRIVER_PIN_REQUIRED");
  });

  it("accepts the QR's link as well as the typed code", async () => {
    const t = setup();
    const { body } = await t.fromTablet({ action: "phone_unlock_code" });
    expect((await t.fromPhone({ action: "claim_bus", code: `https://app.test/driver-phone/start?code=${body.code}` })).status).toBe(200);
  });

  it("refuses expired, reused and made-up codes", async () => {
    const t = setup();
    const { body } = await t.fromTablet({ action: "phone_unlock_code" });
    t.sdk.tables.PhoneUnlock[0].expires_at = new Date(Date.now() - 1000).toISOString();
    expect((await t.fromPhone({ action: "claim_bus", code: body.code })).status).toBe(404);
    expect((await t.fromTablet({ action: "phone_unlock_status", unlock_id: body.unlock_id })).body.status).toBe("expired");
    expect((await t.fromPhone({ action: "claim_bus", code: "ZZZZZZ" })).status).toBe(404);
    expect((await t.fromPhone({ action: "claim_bus", code: "hello" })).status).toBe(400);
    const again = await t.fromTablet({ action: "phone_unlock_code" });
    expect((await t.fromPhone({ action: "claim_bus", code: again.body.code })).status).toBe(200);
    expect((await t.fromPhone({ action: "claim_bus", code: again.body.code })).status).toBe(404);
    expect(t.sdk.tables.DriverShift).toHaveLength(1);
  });

  it("stops guessing after ten wrong codes", async () => {
    const t = setup();
    for (let i = 0; i < 10; i++) await t.fromPhone({ action: "claim_bus", code: "ZZZZZZ" });
    const { body } = await t.fromTablet({ action: "phone_unlock_code" });
    expect((await t.fromPhone({ action: "claim_bus", code: body.code })).status).toBe(429);
  });

  it("refuses people who are not phone drivers, other companies and unassigned buses", async () => {
    for (const [opts, status] of [[{ access: false }, 403], [{ company: "b" }, 404], [{ assigned: false }, 403], [{ role: null }, 401]]) {
      const t = setup(opts);
      const { body } = await t.fromTablet({ action: "phone_unlock_code" });
      expect((await t.fromPhone({ action: "claim_bus", code: body.code })).status).toBe(status);
      expect((await t.fromTablet({ action: "phone_unlock_status", unlock_id: body.unlock_id })).body.status).toBe("pending");
      expect(t.sdk.tables.DriverShift).toHaveLength(0);
    }
  });

  it("won't take over another driver's open shift, but resumes the driver's own", async () => {
    const t = setup();
    t.sdk.tables.DriverShift = [{ id: "s0", company_id: "a", vehicle_id: "bus-a", driver_email: "other@test.invalid", driver_name: "Other", started_at: "2026-10-07T05:00:00Z" }];
    let { body } = await t.fromTablet({ action: "phone_unlock_code" });
    expect((await t.fromPhone({ action: "claim_bus", code: body.code })).status).toBe(409);
    t.sdk.tables.DriverShift[0].driver_email = "CALLER@test.invalid";
    ({ body } = await t.fromTablet({ action: "phone_unlock_code" }));
    const claim = await t.fromPhone({ action: "claim_bus", code: body.code });
    expect(claim.body.resumed).toBe(true);
    expect(t.sdk.tables.DriverShift).toHaveLength(1);
  });

  it("a status check only answers the tablet that showed the code", async () => {
    const t = setup();
    const { body } = await t.fromTablet({ action: "phone_unlock_code" });
    t.sdk.tables.PhoneUnlock[0].device_id = "another-tablet";
    expect((await t.fromTablet({ action: "phone_unlock_status", unlock_id: body.unlock_id })).status).toBe(404);
  });

  it("is not readable through the app's data access", async () => {
    const t = setup({ role: "admin" });
    await t.fromTablet({ action: "phone_unlock_code" });
    const res = await load("entityAccess", t.sdk).default(request({ entity: "PhoneUnlock", operation: "list" }));
    expect(res.status).toBe(403);
  });
});

describe("end shift, walk-around and hours from the phone", () => {
  it("ends the driver's own open shift", async () => {
    const t = setup();
    t.sdk.tables.DriverShift = [{ id: "s1", company_id: "a", vehicle_id: "bus-a", vehicle_name: "Bus A", driver_email: "caller@test.invalid", started_at: new Date(Date.now() - 90 * 60000).toISOString() }];
    const res = await t.fromPhone({ action: "end_shift" });
    expect(res.status).toBe(200);
    expect(t.sdk.tables.DriverShift[0]).toMatchObject({ ended_with: "phone", duration_minutes: 90 });
    expect((await t.fromPhone({ action: "end_shift" })).status).toBe(404);
  });

  it("never ends someone else's shift", async () => {
    const t = setup();
    t.sdk.tables.DriverShift = [{ id: "s1", company_id: "a", vehicle_id: "bus-a", driver_email: "other@test.invalid", started_at: new Date().toISOString() }];
    expect((await t.fromPhone({ action: "end_shift" })).status).toBe(404);
    expect(t.sdk.tables.DriverShift[0].ended_at).toBeUndefined();
  });

  const all = (over = {}) => ["tyres", "lights", "mirrors", "windscreen", "body", "leaks", "doors", "interior", "safety_kit"].map((id) => ({ id, condition: "GOOD", ...(over[id] || {}) }));
  it("saves a walk-around and turns problems into faults with their photo", async () => {
    const t = setup();
    const res = await t.fromPhone({ action: "walkaround", items: all({ mirrors: { condition: "FAILED", notes: "Left mirror cracked", photo_data: btoa("jpeg") } }) });
    expect(res.body.inspection).toMatchObject({ status: "failed", problems: 1 });
    expect(t.sdk.tables.Inspection[0]).toMatchObject({ trigger: "driver_phone", driver_email: "caller@test.invalid", status: "failed" });
    expect(t.sdk.tables.InspectionResult).toHaveLength(9);
    expect(t.sdk.tables.Fault).toEqual([expect.objectContaining({ title: "Mirrors", severity: "medium", photo_url: expect.stringMatching(/^https:\/\/files\.test\/walkaround-/) })]);
    expect(t.uploads).toHaveLength(1);
  });

  it("needs every item, and a note or photo for each problem", async () => {
    const t = setup();
    expect((await t.fromPhone({ action: "walkaround", items: all().slice(1) })).status).toBe(400);
    expect((await t.fromPhone({ action: "walkaround", items: all({ tyres: { condition: "FAILED" } }) })).status).toBe(400);
    expect(t.sdk.tables.Inspection).toHaveLength(0);
    expect(t.uploads).toHaveLength(0);
  });

  it("lists only the driver's own shifts for hours", async () => {
    const t = setup();
    const at = new Date(Date.now() - 86400000).toISOString();
    t.sdk.tables.DriverShift = [
      { id: "s1", company_id: "a", vehicle_name: "Bus A", driver_email: "Caller@test.invalid", started_at: at, ended_at: new Date(Date.parse(at) + 3600e3).toISOString(), duration_minutes: 60 },
      { id: "s2", company_id: "a", vehicle_name: "Bus A", driver_email: "other@test.invalid", started_at: at, duration_minutes: 99 },
    ];
    const res = await t.fromPhone({ action: "hours" });
    expect(res.body.shifts.map((s) => [s.id, s.minutes])).toEqual([["s1", 60]]);
  });
});
