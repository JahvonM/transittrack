import { describe, it, expect } from "vitest";
import { load, mock, request } from "../../../security-tests/helpers.js";

// Step 3: when a bus tablet fails, dispatch switches the bus's GPS to the
// driver's phone for that shift. Positions go through the tablet's own code.
function setup({ backup = "caller@test.invalid", shiftEmail = "caller@test.invalid" } = {}) {
  const sdk = mock("staff");
  Object.assign(sdk.tables.Vehicle[0], { driver_email: "caller@test.invalid", driver_name: "Dana", route_id: "route-a", backup_gps_driver_email: backup, tracking_active: false });
  sdk.tables.Driver = [{ id: "drv", full_name: "Dana Driver", email: "caller@test.invalid", company_id: "a", phone_app_access: true }];
  sdk.tables.Route = [{ id: "route-a", company_id: "a", name: "Coastal", stops: [{ name: "Town", lat: 12.05, lng: -61.75, order: 0 }, { name: "Grand Anse", lat: 12.0, lng: -61.78, order: 1 }] }];
  sdk.tables.DriverShift = shiftEmail ? [{ id: "s1", company_id: "a", vehicle_id: "bus-a", driver_email: shiftEmail, started_at: new Date(Date.now() - 3600e3).toISOString() }] : [];
  sdk.tables.StaffCheckIn = [];
  const phone = load("driverPhone", sdk);
  const send = async (body) => { const r = await phone.default(request(body)); return { status: r.status, body: await r.json() }; };
  return { sdk, send };
}
const fix = (over = {}) => ({ action: "backup_location", lat: 12.0501, lng: -61.7501, speed: 3, recorded_at: new Date().toISOString(), ...over });

describe("backup GPS from the driver's phone", () => {
  it("moves the bus and raises the same stop alerts as the tablet while switched on", async () => {
    const { sdk, send } = setup();
    const res = await send(fix());
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(sdk.tables.Vehicle[0]).toMatchObject({ current_lat: 12.0501, current_lng: -61.7501, tracking_active: true, near_stop_id: "Town" });
    expect(sdk.tables.Broadcast.at(-1)).toMatchObject({ title: "Bus A arrived" });
    expect(sdk.tables.LocationPing).toHaveLength(1);
  });

  it("is refused when switched off, for another driver, or with no open shift", async () => {
    for (const opts of [{ backup: "" }, { backup: "someone@test.invalid" }, { shiftEmail: "" }, { shiftEmail: "other@test.invalid" }]) {
      const { sdk, send } = setup(opts);
      expect((await send(fix())).status).toBe(409);
      expect(sdk.tables.Vehicle[0].current_lat).toBeUndefined();
    }
  });

  it("rejects impossible positions exactly like the tablet", async () => {
    const { send } = setup();
    expect((await send(fix({ lat: 95 }))).status).toBe(400);
    expect((await send(fix({ speed: 500 }))).status).toBe(400);
  });

  it("shows on Today, and switches off when the driver ends the shift", async () => {
    const { sdk, send } = setup();
    expect((await send({ action: "today" })).body.backup_gps).toBe(true);
    await send({ action: "end_shift" });
    expect(sdk.tables.Vehicle[0].backup_gps_driver_email).toBe("");
    expect((await send(fix())).status).toBe(409);
  });

  it("only staff who manage the bus can switch it on", async () => {
    const passenger = mock("staff");
    const r1 = await load("entityAccess", passenger).default(request({ entity: "Vehicle", operation: "update", id: "bus-a", data: { backup_gps_driver_email: "x@test.invalid" } }));
    expect(r1.status).toBe(403);
    const admin = mock("admin");
    const r2 = await load("entityAccess", admin).default(request({ entity: "Vehicle", operation: "update", id: "bus-a", data: { backup_gps_driver_email: "x@test.invalid" } }));
    expect(r2.status).toBe(200);
  });
});
