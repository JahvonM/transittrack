import { describe, it, expect } from "vitest";
import { createHash } from "node:crypto";
import { load, mock, request } from "../../../security-tests/helpers.js";

// A bus's own driver tablet moved to another bus. On the locked tablet:
// "Switch bus", pick the bus, enter THAT bus's PIN (the old bus's PIN isn't
// needed, so a tablet whose bus was removed isn't stuck). In Admin: Reassign
// keeps it paired and it asks for the new bus's PIN.

const sha = (v) => createHash("sha256").update(v).digest("hex");
const TOKEN = "b".repeat(64);
const future = () => new Date(Date.now() + 86400_000).toISOString();

function setup(role = null) {
  const sdk = mock(role);
  if (role === "admin") sdk.tables.User[0].role = "admin";
  sdk.tables.Vehicle.push(
    { id: "bus-a2", company_id: "a", name: "Bus A2", driver_pin: "5678", driver_name: "Ben" },
    { id: "bus-a3", company_id: "a", name: "Bus A3", driver_pin: "1111" },
    { id: "bus-a4", company_id: "a", name: "Bus A4", driver_pin: "2222" },
    { id: "bus-off", company_id: "a", name: "Old bus", in_service: false, driver_pin: "3333" },
  );
  sdk.tables.KioskDevice[0] = {
    id: "tablet", created_date: "2026-10-26T00:00:00Z", status: "active", paired: true, kiosk_type: "driver", label: "Front tablet",
    company_id: "a", company_name: "A", vehicle_id: "bus-a", vehicle_name: "Bus A", pairing_code: "PAIRDRIVER12",
  };
  sdk.tables.DeviceCredential = [{
    id: "cred", device_id: "tablet", token_hash: sha(TOKEN), company_id: "a", vehicle_id: "bus-a", kiosk_type: "driver",
    pairing_code_hash: sha("PAIRDRIVER12"), issued_at: new Date().toISOString(), expires_at: future(),
  }];
  sdk.tables.DriverShift = [{ id: "busy", vehicle_id: "bus-a3", company_id: "a", device_id: "other-tablet", started_at: new Date().toISOString() }];
  sdk.tables.AuditLog = [];
  const api = load("driverSession", sdk, ["issueGrant"]);
  const send = async (action, body = {}) => {
    const res = await api.default(request({ device_id: "tablet", device_token: TOKEN, action, ...body }));
    return { status: res.status, body: await res.json() };
  };
  const tablet = () => sdk.tables.KioskDevice.find((d) => d.id === "tablet");
  return { sdk, api, send, tablet };
}

describe("Switch bus on a bus's own driver tablet", () => {
  it("lists its company's buses in service without being unlocked, marking busy ones", async () => {
    const { send } = setup();
    const { status, body } = await send("list_buses");
    expect(status).toBe(200);
    expect(body.current).toBe("bus-a");
    expect(body.buses.map((b) => b.id).sort()).toEqual(["bus-a", "bus-a2", "bus-a3", "bus-a4"]);
    expect(body.buses.find((b) => b.id === "bus-a3").busy).toBe(true);
    expect(body.shift_open).toBeUndefined();
  });

  it("moves with the NEW bus's PIN only, stays paired and opens unlocked on the new bus", async () => {
    const { sdk, api, send, tablet } = setup();
    const oldGrant = await api.issueGrant(sdk, tablet(), "driver", "bus-a", 60000);
    const res = await send("switch_bus", { vehicle_id: "bus-a2", pin: "5678" });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ ok: true, vehicle: { id: "bus-a2", name: "Bus A2" }, driver_name: "Ben" });
    expect(res.body.driver_grant).toMatch(/^[a-f0-9]{64}$/);
    expect(tablet()).toMatchObject({ vehicle_id: "bus-a2", vehicle_name: "Bus A2", paired: true });
    expect(sdk.tables.DeviceCredential[0].vehicle_id).toBe("bus-a2");

    // Still paired, now on the new bus, and the new pass unlocks it.
    const beat = await send("heartbeat", { driver_grant: res.body.driver_grant });
    expect(beat.status).toBe(200);
    expect(beat.body.vehicle.id).toBe("bus-a2");
    expect(beat.body.driver_unlocked).toBe(true);
    expect((await send("messages", { driver_grant: res.body.driver_grant })).status).toBe(200);
    // The old bus's pass doesn't work any more.
    expect((await send("messages", { driver_grant: oldGrant })).body.code).toBe("DRIVER_PIN_REQUIRED");
    // The office can see who moved it, without the PIN.
    expect(sdk.tables.AuditLog.at(-1).summary).toBe('Driver tablet "Front tablet" switched from Bus A to Bus A2 with that bus\'s PIN');
    expect(JSON.stringify(sdk.tables.AuditLog)).not.toContain("5678");
  });

  it("refuses a wrong PIN, another company's bus, a bus out of service, a busy bus, and the same bus", async () => {
    const { send, tablet, sdk } = setup();
    const wrong = await send("switch_bus", { vehicle_id: "bus-a2", pin: "1234" });
    expect(wrong.status).toBe(403);
    expect(wrong.body.error).toBe("Incorrect PIN for Bus A2");
    expect((await send("switch_bus", { vehicle_id: "bus-b", pin: "0000" })).status).toBe(404);
    expect((await send("switch_bus", { vehicle_id: "bus-off", pin: "3333" })).status).toBe(409);
    expect((await send("switch_bus", { vehicle_id: "bus-a3", pin: "1111" })).body.code).toBe("BUS_BUSY");
    expect((await send("switch_bus", { vehicle_id: "bus-a", pin: "1234" })).body.code).toBe("SAME_BUS");
    expect((await send("switch_bus", { vehicle_id: "../x", pin: "1234" })).status).toBe(400);
    expect(tablet().vehicle_id).toBe("bus-a");
    expect(sdk.tables.DeviceCredential[0].vehicle_id).toBe("bus-a");
  });

  it("can't leave a bus while its driver is on shift on this tablet", async () => {
    const { sdk, send, tablet } = setup();
    sdk.tables.DriverShift.push({ id: "mine", vehicle_id: "bus-a", company_id: "a", device_id: "tablet", started_at: new Date().toISOString() });
    expect((await send("list_buses")).body.shift_open).toBe("End the shift on Bus A before switching bus");
    const res = await send("switch_bus", { vehicle_id: "bus-a2", pin: "5678" });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("SHIFT_OPEN");
    expect(tablet().vehicle_id).toBe("bus-a");
  });

  it("a tablet whose bus was removed says so, and switches without the old bus's PIN", async () => {
    const { sdk, send, tablet } = setup();
    sdk.tables.Vehicle = sdk.tables.Vehicle.filter((v) => v.id !== "bus-a");
    // A shift left open on the removed bus doesn't keep the tablet stuck.
    sdk.tables.DriverShift.push({ id: "left", vehicle_id: "bus-a", company_id: "a", device_id: "tablet", started_at: new Date().toISOString() });
    const beat = await send("heartbeat");
    expect(beat.status).toBe(404);
    expect(beat.body.code).toBe("BUS_GONE");
    const pin = await send("verify_pin", { pin: "1234" });
    expect(pin.status).toBe(403);
    expect(pin.body.code).toBe("BUS_GONE");
    expect((await send("list_buses")).body.shift_open).toBeUndefined();
    const res = await send("switch_bus", { vehicle_id: "bus-a2", pin: "5678" });
    expect(res.status).toBe(200);
    expect(tablet().vehicle_id).toBe("bus-a2");
    expect(sdk.tables.AuditLog.at(-1).summary).toContain("switched from Bus A to Bus A2");
    expect((await send("heartbeat", { driver_grant: res.body.driver_grant })).body.driver_unlocked).toBe(true);
  });

  it("allows 10 tries per tablet in 15 minutes across all buses, on top of each bus's own 5", async () => {
    const { send } = setup();
    const statuses = [];
    for (const [bus, n] of [["bus-a2", 4], ["bus-a4", 4]]) for (let i = 0; i < n; i++) statuses.push((await send("switch_bus", { vehicle_id: bus, pin: "9999" })).status);
    expect(statuses.every((s) => s === 403)).toBe(true);
    expect((await send("switch_bus", { vehicle_id: "bus-a2", pin: "9999" })).status).toBe(403); // 9
    // The bus's own limit (5 wrong in 15 minutes) is shared with its own tablet.
    expect((await send("switch_bus", { vehicle_id: "bus-a2", pin: "5678" })).status).toBe(429); // 10
    const over = await send("switch_bus", { vehicle_id: "bus-a4", pin: "2222" });
    expect(over.status).toBe(429);
    expect(over.body.error).toBe("Too many tries on this tablet. Wait 15 minutes and try again.");
  });

  it("a tablet paired before credentials existed is told to pair again, without using a try", async () => {
    const { sdk, api } = setup();
    sdk.tables.DeviceCredential = [];
    sdk.tables.KioskDevice[0].created_date = "2026-10-01T00:00:00Z";
    const res = await api.default(request({ device_id: "tablet", action: "switch_bus", vehicle_id: "bus-a2", pin: "5678" }));
    expect(res.status).toBe(401);
    expect((await res.json()).code).toBe("DEVICE_ACCESS_REQUIRED");
    expect(sdk.tables.KioskDevice[0].vehicle_id).toBe("bus-a");
    expect(sdk.atomicCalls || []).toHaveLength(0);
  });

  it("a driver's own phone can't use it (it picks a bus with Change bus)", async () => {
    const { sdk, send, tablet } = setup();
    Object.assign(sdk.tables.KioskDevice[0], { personal: true, driver_id: "drv1" });
    const res = await send("switch_bus", { vehicle_id: "bus-a2", pin: "5678" });
    expect(res.status).not.toBe(200);
    expect(tablet().vehicle_id).toBe("bus-a");
  });
});

describe("the bus a tablet leaves stops showing as live", () => {
  const busA = (sdk) => sdk.tables.Vehicle.find((v) => v.id === "bus-a");
  const sharing = (sdk) => { Object.assign(busA(sdk), { tracking_active: true, current_lat: 12.05, current_lng: -61.75, last_location_update: new Date().toISOString() }); };

  it("after Switch bus on the tablet; the new bus is left as it was", async () => {
    const { sdk, send } = setup();
    sharing(sdk);
    expect((await send("switch_bus", { vehicle_id: "bus-a2", pin: "5678" })).status).toBe(200);
    expect(busA(sdk).tracking_active).toBe(false);
    expect(sdk.tables.Vehicle.find((v) => v.id === "bus-a2").tracking_active).toBeUndefined();
  });

  it("not when the office locked sharing on, a phone is its backup GPS, another tablet is on it, or another device has a shift on it", async () => {
    const cases = [
      (sdk) => { busA(sdk).remote_tracking_lock = true; },
      (sdk) => { busA(sdk).backup_gps_driver_email = "driver@test.invalid"; },
      (sdk) => { sdk.tables.KioskDevice.push({ id: "spare", kiosk_type: "driver", status: "active", paired: true, company_id: "a", vehicle_id: "bus-a" }); },
      (sdk) => { sdk.tables.DriverShift.push({ id: "phone-shift", vehicle_id: "bus-a", company_id: "a", device_id: "a-phone", started_at: new Date().toISOString() }); },
    ];
    for (const arrange of cases) {
      const { sdk, send } = setup();
      sharing(sdk);
      arrange(sdk);
      expect((await send("switch_bus", { vehicle_id: "bus-a2", pin: "5678" })).status).toBe(200);
      expect(busA(sdk).tracking_active).toBe(true);
    }
  });

  it("an unpaired or revoked tablet record left on the bus doesn't keep it live", async () => {
    const { sdk, send } = setup();
    sharing(sdk);
    sdk.tables.KioskDevice.push({ id: "old", kiosk_type: "driver", status: "revoked", paired: false, company_id: "a", vehicle_id: "bus-a" });
    expect((await send("switch_bus", { vehicle_id: "bus-a2", pin: "5678" })).status).toBe(200);
    expect(busA(sdk).tracking_active).toBe(false);
  });

  it("after Reassign in Admin, and after making the tablet another kind of tablet", async () => {
    for (const data of [{ vehicle_id: "bus-a2", vehicle_name: "Bus A2" }, { kiosk_type: "bus_boarding" }]) {
      const { sdk } = setup("admin");
      sharing(sdk);
      const res = await load("entityAccess", sdk).default(request({ entity: "KioskDevice", operation: "update", id: "tablet", data }));
      expect(res.status).toBe(200);
      expect(busA(sdk).tracking_active).toBe(false);
    }
  });

  it("not when Admin only renames the tablet", async () => {
    const { sdk } = setup("admin");
    sharing(sdk);
    expect((await load("entityAccess", sdk).default(request({ entity: "KioskDevice", operation: "update", id: "tablet", data: { label: "Front tablet 2" } }))).status).toBe(200);
    expect(busA(sdk).tracking_active).toBe(true);
  });

  it("after a driver's own phone changes bus", async () => {
    const { sdk, send } = setup();
    sharing(sdk);
    Object.assign(sdk.tables.KioskDevice[0], { personal: true, driver_id: "drv1", driver_name: "Ana" });
    expect((await send("choose_bus", { vehicle_id: "bus-a2" })).status).toBe(200);
    expect(busA(sdk).tracking_active).toBe(false);
  });
});

describe("Reassign in Admin", () => {
  it("keeps a driver tablet paired on the new bus; it then needs the new bus's PIN", async () => {
    const { sdk, api, send, tablet } = setup("admin");
    const oldGrant = await api.issueGrant(sdk, tablet(), "driver", "bus-a", 60000);
    const res = await load("entityAccess", sdk).default(request({ entity: "KioskDevice", operation: "update", id: "tablet", data: { vehicle_id: "bus-a2", vehicle_name: "Bus A2" } }));
    expect(res.status).toBe(200);
    expect(sdk.tables.DeviceCredential[0].vehicle_id).toBe("bus-a2");
    const beat = await send("heartbeat", { driver_grant: oldGrant });
    expect(beat.status).toBe(200);
    expect(beat.body.vehicle.id).toBe("bus-a2");
    expect(beat.body.driver_unlocked).toBe(false);
    expect((await send("verify_pin", { pin: "1234" })).status).toBe(403);
    expect((await send("verify_pin", { pin: "5678" })).body.ok).toBe(true);
  });
});
