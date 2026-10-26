import { describe, it, expect } from "vitest";
import { createHash } from "node:crypto";
import { load, mock, request } from "../../../security-tests/helpers.js";

// A driver's own phone (the store app): it belongs to a driver, not a bus,
// and the driver picks the bus before a shift. Everything after that is the
// same as on a bus's own driver tablet, bus PIN included.

const sha = (v) => createHash("sha256").update(v).digest("hex");
const TOKEN = "a".repeat(64);
const future = () => new Date(Date.now() + 86400_000).toISOString();

function setup() {
  const sdk = mock(null);
  sdk.tables.Vehicle.push({ id: "bus-a2", company_id: "a", name: "Bus A2" }, { id: "bus-off", company_id: "a", name: "Old bus", in_service: false });
  sdk.tables.Driver = [{ id: "drv1", company_id: "a", full_name: "Ana Joseph" }];
  sdk.tables.KioskDevice.push({
    id: "phone", created_date: "2026-10-26T00:00:00Z", status: "active", paired: true, kiosk_type: "driver", personal: true,
    driver_id: "drv1", driver_name: "Ana Joseph", company_id: "a", company_name: "A", vehicle_id: "", pairing_code: "PHONE1234567",
  });
  sdk.tables.DeviceCredential = [{
    id: "cred", device_id: "phone", token_hash: sha(TOKEN), company_id: "a", vehicle_id: "", kiosk_type: "driver",
    pairing_code_hash: sha("PHONE1234567"), issued_at: new Date().toISOString(), expires_at: future(),
  }];
  sdk.tables.DriverShift = [{ id: "busy", vehicle_id: "bus-a2", company_id: "a", device_id: "other-tablet", started_at: new Date().toISOString() }];
  const api = load("driverSession", sdk, ["issueGrant"]);
  const send = async (action, body = {}) => {
    const res = await api.default(request({ device_id: "phone", device_token: TOKEN, action, ...body }));
    return { status: res.status, body: await res.json() };
  };
  const phone = () => sdk.tables.KioskDevice.find((d) => d.id === "phone");
  return { sdk, api, send, phone };
}

describe("a driver's own phone", () => {
  it("checks in before it has a bus, and asks for one before anything else", async () => {
    const { send } = setup();
    const hb = await send("heartbeat");
    expect(hb.status).toBe(200);
    expect(hb.body).toMatchObject({ personal: true, vehicle: null, driver_name: "Ana Joseph", company_id: "a" });
    const other = await send("start_shift");
    expect(other.status).toBe(409);
    expect(other.body.code).toBe("BUS_REQUIRED");
  });

  it("lists only its company's buses in service, marking ones with a driver on shift", async () => {
    const { send } = setup();
    const { status, body } = await send("list_buses");
    expect(status).toBe(200);
    expect(body.buses.map((b) => b.id).sort()).toEqual(["bus-a", "bus-a2"]);
    expect(body.buses.find((b) => b.id === "bus-a2").busy).toBe(true);
    expect(body.buses.find((b) => b.id === "bus-a").busy).toBe(false);
  });

  it("can't pick a busy bus, another company's bus or one out of service", async () => {
    const { send, phone } = setup();
    expect((await send("choose_bus", { vehicle_id: "bus-a2" })).body.code).toBe("BUS_BUSY");
    expect((await send("choose_bus", { vehicle_id: "bus-b" })).status).toBe(404);
    expect((await send("choose_bus", { vehicle_id: "bus-off" })).status).toBe(409);
    expect((await send("choose_bus", { vehicle_id: "../x" })).status).toBe(400);
    expect(phone().vehicle_id).toBe("");
  });

  it("picks a bus: the phone and its credential move together and it works like that bus's tablet", async () => {
    const { sdk, send, phone } = setup();
    const chose = await send("choose_bus", { vehicle_id: "bus-a" });
    expect(chose.status).toBe(200);
    expect(chose.body.vehicle).toMatchObject({ id: "bus-a" });
    expect(phone()).toMatchObject({ vehicle_id: "bus-a", vehicle_name: "Bus A" });
    expect(sdk.tables.DeviceCredential[0].vehicle_id).toBe("bus-a");
    const hb = await send("heartbeat");
    expect(hb.status).toBe(200);
    expect(hb.body).toMatchObject({ personal: true, driver_name: "Ana Joseph", vehicle: { id: "bus-a" } });
    // Still locked until the bus PIN is entered, like a tablet.
    expect(hb.body.driver_unlocked).toBe(false);
    expect((await send("start_shift")).status).toBe(401);
  });

  it("starts a shift in the driver's name and can't change bus until it ends", async () => {
    const { sdk, api, send, phone } = setup();
    await send("choose_bus", { vehicle_id: "bus-a" });
    const grant = await api.issueGrant(sdk, phone(), "driver", "bus-a", 60000);
    const started = await send("start_shift", { driver_grant: grant, client_request_id: "start-req-0001" });
    expect(started.status).toBe(200);
    expect(started.body.shift).toMatchObject({ vehicle_id: "bus-a", device_id: "phone", driver_name: "Ana Joseph", driver_id: "drv1" });
    expect((await send("choose_bus", { vehicle_id: "bus-a2" })).body.code).toBe("SHIFT_OPEN");
    expect((await send("release_bus")).body.code).toBe("SHIFT_OPEN");
    sdk.tables.DriverShift.find((s) => s.id === started.body.shift.id).ended_at = new Date().toISOString();
    const released = await send("release_bus");
    expect(released.status).toBe(200);
    expect(phone().vehicle_id).toBe("");
    expect(sdk.tables.DeviceCredential[0].vehicle_id).toBe("");
  });

  it("won't join a shift another device opened on the same bus", async () => {
    const { sdk, api, send, phone } = setup();
    await send("choose_bus", { vehicle_id: "bus-a" });
    sdk.tables.DriverShift.push({ id: "tablet-shift", vehicle_id: "bus-a", company_id: "a", device_id: "tablet", started_at: new Date().toISOString() });
    const grant = await api.issueGrant(sdk, phone(), "driver", "bus-a", 60000);
    const res = await send("start_shift", { driver_grant: grant, client_request_id: "start-req-0002" });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("BUS_BUSY");
  });

  it("a bus's own tablet can't use the pick-a-bus actions", async () => {
    const { sdk, api } = setup();
    sdk.tables.KioskDevice[0].kiosk_type = "driver";
    const res = await api.default(request({ device_id: "tablet", action: "choose_bus", vehicle_id: "bus-a2" }));
    expect(res.status).not.toBe(200);
    expect(sdk.tables.KioskDevice[0].vehicle_id).toBe("bus-a");
  });
});

describe("adding a driver's own phone in Admin", () => {
  const admin = () => {
    const sdk = mock("admin");
    sdk.tables.User[0].role = "admin";
    sdk.tables.Driver = [{ id: "drv1", company_id: "a", full_name: "Ana Joseph" }, { id: "drv-b", company_id: "b", full_name: "Ben" }];
    const api = load("entityAccess", sdk);
    const call = async (body) => { const res = await api.default(request(body)); return { status: res.status, body: await res.json() }; };
    return { sdk, call };
  };

  it("creates it for a driver with no bus, a pairing code, and the driver's name", async () => {
    const { call } = admin();
    const res = await call({ entity: "KioskDevice", operation: "create", data: { kiosk_type: "driver", personal: true, driver_id: "drv1", company_id: "a", label: "Ana's phone", driver_name: "Someone else" } });
    expect(res.status).toBe(200);
    const row = res.body.result;
    expect(row).toMatchObject({ personal: true, driver_id: "drv1", driver_name: "Ana Joseph", vehicle_id: "", paired: false });
    expect(row.pairing_code).toMatch(/^[A-Z0-9]{12}$/);
  });

  it("refuses a bus, another company's driver, or turning a tablet into one", async () => {
    const { call } = admin();
    expect((await call({ entity: "KioskDevice", operation: "create", data: { kiosk_type: "driver", personal: true, company_id: "a" } })).status).toBe(400);
    expect((await call({ entity: "KioskDevice", operation: "create", data: { kiosk_type: "bus_boarding", personal: true, driver_id: "drv1", company_id: "a", vehicle_id: "bus-a" } })).status).toBe(400);
    expect((await call({ entity: "KioskDevice", operation: "create", data: { kiosk_type: "driver", personal: true, driver_id: "drv-b", company_id: "a" } })).status).toBeGreaterThanOrEqual(400);
    const made = await call({ entity: "KioskDevice", operation: "create", data: { kiosk_type: "driver", personal: true, driver_id: "drv1", company_id: "a" } });
    expect((await call({ entity: "KioskDevice", operation: "update", id: made.body.result.id, data: { vehicle_id: "bus-a" } })).status).toBe(400);
    expect((await call({ entity: "KioskDevice", operation: "update", id: "tablet", data: { personal: true } })).status).toBe(400);
  });
});

describe("a new code for a driver's own phone", () => {
  const issue = async (device) => {
    const sdk = mock("admin");
    sdk.tables.KioskDevice.push(device);
    const api = load("manageAccessCodes", sdk, []);
    const res = await api.default(request({ action: "issue_pairing", device_id: device.id, replace_existing: true }));
    return { status: res.status, body: await res.json() };
  };

  it("works before the phone has picked a bus", async () => {
    const { status, body } = await issue({ id: "phone2", status: "active", paired: true, kiosk_type: "driver", personal: true, driver_id: "drv1", company_id: "a", vehicle_id: "" });
    expect(status).toBe(200);
    expect(body.code).toMatch(/^[A-Z0-9]{12}$/);
  });

  it("still needs a bus for a bus's own driver tablet", async () => {
    const { status } = await issue({ id: "tab2", status: "active", paired: true, kiosk_type: "driver", company_id: "a", vehicle_id: "" });
    expect(status).toBe(400);
  });
});

describe("how long a driver's phone code lasts", () => {
  it("is 7 days for a driver's own phone and 15 minutes for a tablet", async () => {
    const sdk = mock("admin");
    sdk.tables.KioskDevice.push(
      { id: "p3", status: "active", paired: false, kiosk_type: "driver", personal: true, driver_id: "drv1", company_id: "a", vehicle_id: "" },
      { id: "t3", status: "active", paired: false, kiosk_type: "driver", company_id: "a", vehicle_id: "bus-a" },
    );
    const api = load("manageAccessCodes", sdk, []);
    const issue = async (id) => (await (await api.default(request({ action: "issue_pairing", device_id: id }))).json()).expires_at;
    const left = (iso) => Date.parse(iso) - Date.now();
    expect(left(await issue("p3"))).toBeGreaterThan(6.9 * 86400_000);
    expect(left(await issue("t3"))).toBeLessThanOrEqual(15 * 60_000);
  });
});
