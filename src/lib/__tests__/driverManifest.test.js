import { describe, it, expect } from "vitest";
import { load, mock, request } from "../../../security-tests/helpers.js";

// The driver's passenger list (driverSession): who is on board, who got off
// where, who didn't show, from taps and the driver's own marks. Several
// riders leave at different stops; each mark is recorded and audited; card
// numbers never reach the tablet.

const minAgo = (n) => new Date(Date.now() - n * 60_000).toISOString();

async function tablet() {
  const sdk = mock(null);
  sdk.tables.KioskDevice[0].kiosk_type = "driver";
  Object.assign(sdk.tables.Vehicle[0], { driver_name: "Kofi" });
  // Two riders on Bus A (and only them): Ann has an account and a card; Ben only a directory card.
  sdk.tables.CompanyMembership = sdk.tables.CompanyMembership.filter((m) => m.user_id !== "caller");
  sdk.tables.User.push({ id: "ann", role: "staff", email: "ann@test.invalid", full_name: "Ann Lee", boarding_note: "Needs a lower step" });
  sdk.tables.CompanyMembership.push({ id: "m-ann", user_id: "ann", company_id: "a", scope: "passenger", active: true, vehicle_id: "bus-a" });
  sdk.tables.Contact = [{ id: "ben", company_id: "a", type: "staff", name: "Ben Cole", vehicle_id: "bus-a", nfc_card_tag: "BENCARD1" }];
  sdk.tables.NfcCard = [{ id: "card-ann", company_id: "a", holder_source: "user", holder_id: "ann", card_uid: "ANNCARD1", is_active: true }];
  sdk.tables.StaffCheckIn = [];
  sdk.tables.RideException = [];
  sdk.tables.DriverShift = [{ id: "sh1", vehicle_id: "bus-a", started_at: minAgo(90) }];
  sdk.tables.AuditLog = [];
  const api = load("driverSession", sdk, ["issueGrant"]);
  const grant = await api.issueGrant(sdk, sdk.tables.KioskDevice[0], "driver", "bus-a", 60000);
  const send = async (body, withGrant = true) => {
    const res = await api.default(request({ device_id: "tablet", ...(withGrant ? { driver_grant: grant } : {}), ...body }));
    return { status: res.status, body: await res.json() };
  };
  const tap = (card_tag, status, ago, extra = {}) => sdk.tables.StaffCheckIn.push({ id: "t" + sdk.tables.StaffCheckIn.length, company_id: "a", vehicle_id: "bus-a", card_tag, status, boarded_at: minAgo(ago), created_date: minAgo(ago), staff_name: "x", ...extra });
  const rides = async () => Object.fromEntries((await send({ action: "heartbeat" })).body.staff.map((p) => [p.full_name, p.ride.state]));
  return { sdk, send, tap, rides };
}

describe("who is on board", () => {
  it("several riders board and get off at different stops", async () => {
    const t = await tablet();
    t.tap("ANNCARD1", "boarded", 60); t.tap("BENCARD1", "boarded", 58);
    expect(await t.rides()).toEqual({ "Ann Lee": "on_board", "Ben Cole": "on_board" });
    t.tap("BENCARD1", "off_board", 30);
    expect(await t.rides()).toEqual({ "Ann Lee": "on_board", "Ben Cole": "got_off" });
    expect((await t.send({ action: "heartbeat" })).body.occupancy).toBe(1);
    t.tap("ANNCARD1", "off_board", 10);
    expect(await t.rides()).toEqual({ "Ann Lee": "got_off", "Ben Cole": "got_off" });
  });
  it("counts by when taps happened, so a tap saved offline and sent late lands in place", async () => {
    const t = await tablet();
    // The exit (8:30) reached the server before the boarding (8:00) saved offline.
    t.tap("BENCARD1", "off_board", 30, { created_date: minAgo(29) });
    t.tap("BENCARD1", "boarded", 60, { created_date: minAgo(1) });
    const hb = (await t.send({ action: "heartbeat" })).body;
    expect(hb.occupancy).toBe(0);
    expect(hb.staff.find((p) => p.full_name === "Ben Cole").ride.state).toBe("got_off");
  });
  it("sends the boarding note but never a card number", async () => {
    const t = await tablet();
    t.tap("ANNCARD1", "boarded", 5);
    const hb = (await t.send({ action: "heartbeat" })).body;
    expect(hb.staff.find((p) => p.full_name === "Ann Lee").boarding_note).toBe("Needs a lower step");
    expect(JSON.stringify(hb.staff)).not.toMatch(/ANNCARD1|BENCARD1|_tags|_source/);
  });
  it("a locked tablet gets no passenger list", async () => {
    const t = await tablet();
    expect((await t.send({ action: "heartbeat" }, false)).body.staff).toEqual([]);
    expect((await t.send({ action: "ride_exception", ref: "ben", kind: "no_show" }, false)).status).toBe(401);
  });
});

describe("the driver's marks", () => {
  it("a no-show is recorded, audited and can be taken back", async () => {
    const t = await tablet();
    const res = await t.send({ action: "ride_exception", ref: "ben", kind: "no_show", driver_name: "Kofi", note: "Waited 2 minutes" });
    expect(res.body.ride.state).toBe("no_show");
    expect(t.sdk.tables.RideException[0]).toMatchObject({ kind: "no_show", person_ref: "ben", recorded_by: "Kofi", run_key: "shift:sh1" });
    expect(t.sdk.tables.AuditLog.at(-1).summary).toMatch(/Kofi marked Ben Cole as not at the pickup/);
    expect((await t.send({ action: "ride_exception", ref: "ben", kind: "undo_no_show", driver_name: "Kofi" })).body.ride.state).toBe("not_yet");
    expect(t.sdk.tables.RideException[0].undone_by).toBe("Kofi");
  });
  it("can't mark a no-show for someone already on board", async () => {
    const t = await tablet();
    t.tap("BENCARD1", "boarded", 5);
    expect((await t.send({ action: "ride_exception", ref: "ben", kind: "no_show" })).status).toBe(409);
  });
  it("got on / got off without a tap makes a boarding record marked for review", async () => {
    const t = await tablet();
    const on = await t.send({ action: "ride_exception", ref: "ann", kind: "got_on", driver_name: "Kofi", note: "Forgot card" });
    expect(on.body).toMatchObject({ ride: { state: "on_board", by_driver: true }, occupancy: 1 });
    expect(t.sdk.tables.StaffCheckIn[0]).toMatchObject({ status: "boarded", check_in_method: "manual", review_reason: "driver_correction", person_key: "user:ann", run_key: "shift:sh1" });
    // A second "got on" is refused, so nothing is recorded twice.
    expect((await t.send({ action: "ride_exception", ref: "ann", kind: "got_on" })).status).toBe(409);
    expect((await t.send({ action: "ride_exception", ref: "ann", kind: "got_off" })).body.ride.state).toBe("got_off");
    expect(t.sdk.tables.StaffCheckIn).toHaveLength(2);
    expect(t.sdk.tables.AuditLog.filter((a) => a.entity === "RideException")).toHaveLength(2);
  });
  it("refuses a passenger who isn't on this bus", async () => {
    const t = await tablet();
    expect((await t.send({ action: "ride_exception", ref: "someone-else", kind: "no_show" })).status).toBe(404);
    expect((await t.send({ action: "ride_exception", ref: "ben", kind: "teleported" })).status).toBe(400);
  });
});
