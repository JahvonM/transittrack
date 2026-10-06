import { describe, it, expect } from "vitest";
import { load, mock, request } from "../../../security-tests/helpers.js";

// Driver tablet stop fixes: the server only ever uses its own fresh GPS fix
// for the bus, never coordinates from the tablet.
async function driver({ fixAgeMs = 10_000, lat = 12.0201, lng = -61.7601 } = {}) {
  const sdk = mock(null);
  sdk.tables.KioskDevice[0].kiosk_type = "driver";
  sdk.tables.DeviceCredential[0].kiosk_type = "driver";
  Object.assign(sdk.tables.Vehicle[0], { route_id: "route-a", current_lat: lat, current_lng: lng, last_location_update: new Date(Date.now() - fixAgeMs).toISOString() });
  sdk.tables.Route = [{ id: "route-a", company_id: "a", name: "Coastal", stops: [
    { name: "Town", lat: 12.05, lng: -61.75, order: 0 },
    { name: "True Blue", lat: 12.02, lng: -61.76, order: 1 },
    { name: "Grand Anse", lat: 12.0, lng: -61.78, order: 2 },
  ] }];
  sdk.tables.Workplace = [{ id: "w", company_id: "a", name: "Head office", lat: 11.99, lng: -61.79 }, { id: "wb", company_id: "b", name: "Other co", lat: 1, lng: 1 }];
  const api = load("driverSession", sdk, ["issueGrant"]);
  const grant = await api.issueGrant(sdk, sdk.tables.KioskDevice[0], "driver", "bus-a", 60000);
  const send = (body) => api.default(request({ device_id: "tablet", driver_grant: grant, ...body }));
  return { sdk, send };
}

describe("driver stop edits", () => {
  it("moves the nearby stop to the bus's own GPS fix and logs it", async () => {
    const { sdk, send } = await driver();
    const res = await send({ action: "move_stop", stop_name: "True Blue", lat: 1, lng: 1 });
    expect(res.status).toBe(200);
    const stop = sdk.tables.Route[0].stops.find((s) => s.name === "True Blue");
    expect(stop).toMatchObject({ lat: 12.0201, lng: -61.7601 });
    expect(sdk.tables.AuditLog.at(-1)).toMatchObject({ entity: "Route", record_id: "route-a", actor_role: "driver" });
  });

  it("refuses to move a stop the bus isn't near", async () => {
    const { sdk, send } = await driver();
    const res = await send({ action: "move_stop", stop_name: "Town" });
    expect(res.status).toBe(400);
    expect(sdk.tables.Route[0].stops[0]).toMatchObject({ lat: 12.05, lng: -61.75 });
  });

  it("refuses without a fresh GPS fix", async () => {
    const { sdk, send } = await driver({ fixAgeMs: 10 * 60_000 });
    expect((await send({ action: "move_stop", stop_name: "True Blue" })).status).toBe(409);
    expect(sdk.tables.Route[0].stops[1]).toMatchObject({ lat: 12.02, lng: -61.76 });
  });

  it("adds a new stop in route order where it adds the least distance", async () => {
    const { sdk, send } = await driver({ lat: 12.01, lng: -61.77 });
    const res = await send({ action: "add_stop", name: "Morne Jaloux junction" });
    expect(res.status).toBe(200);
    expect(sdk.tables.Route[0].stops.map((s) => [s.name, s.order])).toEqual([["Town", 0], ["True Blue", 1], ["Morne Jaloux junction", 2], ["Grand Anse", 3]]);
  });

  it("won't add a duplicate next to an existing stop", async () => {
    const { send } = await driver();
    const res = await send({ action: "add_stop", name: "Second True Blue" });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/Move that stop instead/);
  });

  it("refuses edits without the driver PIN grant", async () => {
    const { sdk } = await driver();
    const api = load("driverSession", sdk, []);
    const res = await api.default(request({ device_id: "tablet", action: "add_stop", name: "Sneaky" }));
    expect(res.status).toBe(401);
    expect(sdk.tables.Route[0].stops).toHaveLength(3);
  });

  it("sends only this company's workplace with the tablet session", async () => {
    const { send } = await driver();
    const body = await (await send({ action: "heartbeat" })).json();
    expect(body.workplace).toEqual({ name: "Head office", lat: 11.99, lng: -61.79 });
  });
});