import { describe, it, expect } from "vitest";
import { load, mock, request } from "../../../security-tests/helpers.js";

// The driver tablet checks in every few seconds. Most check-ins are "light":
// they skip the parts that rarely change (passenger list, road stops,
// inspection forms, company details), which the tablet keeps from the last
// full check-in. Reading everything every time went over Base44's request
// limit, and the tablets showed "Offline" whenever a check-in was refused.

const ROAD = [{ lat: 12.05, lng: -61.75 }, { lat: 12.0, lng: -61.78 }];
const SLOW = ["has_driver_pin", "company_name", "company_logo_url", "route", "workplace", "emergency_contacts", "inspection_templates", "recent_inspections"];
// (DriverPinCredential is still read once: the unlock pass is checked every time.)
const SLOW_TABLES = ["Route", "InspectionTemplate", "Inspection", "Workplace", "Contact"];

async function tablet() {
  const sdk = mock(null);
  sdk.tables.KioskDevice[0].kiosk_type = "driver";
  Object.assign(sdk.tables.Vehicle[0], { route_id: "route-a", driver_name: "Kofi" });
  sdk.tables.Route = [{ id: "route-a", company_id: "a", name: "Coastal", path: ROAD, stops: [{ name: "Town", lat: 12.05, lng: -61.75, order: 0 }] }];
  sdk.tables.User.push({ id: "ann", role: "staff", email: "ann@test.invalid", full_name: "Ann Lee", pickup_route_id: "route-a", pickup_lat: 12.03, pickup_lng: -61.762 });
  sdk.tables.CompanyMembership.push({ id: "m-ann", user_id: "ann", company_id: "a", scope: "passenger", active: true, vehicle_id: "bus-a" });
  // Only this bus's company's messages reach its tablet.
  sdk.tables.GroupMessage = [
    { id: "g1", vehicle_id: "bus-a", company_id: "a", text: "Morning", created_date: new Date().toISOString() },
    { id: "g2", vehicle_id: "bus-a", company_id: "b", text: "Another company", created_date: new Date().toISOString() },
  ];
  const api = load("driverSession", sdk, ["issueGrant"]);
  const grant = await api.issueGrant(sdk, sdk.tables.KioskDevice[0], "driver", "bus-a", 60000);
  const send = async (body, withGrant = true) => {
    sdk.reads.length = 0;
    const res = await api.default(request({ device_id: "tablet", action: "heartbeat", ...(withGrant ? { driver_grant: grant } : {}), ...body }));
    return { status: res.status, body: await res.json(), reads: [...sdk.reads] };
  };
  return { send };
}

describe("light driver check-ins", () => {
  it("a full check-in still sends everything", async () => {
    const { send } = await tablet();
    const { status, body } = await send({});
    expect(status).toBe(200);
    for (const key of SLOW) expect(body).toHaveProperty(key);
    expect(body.light).toBeUndefined();
    expect(body.road_stops.stops.length).toBeGreaterThan(0);
    expect(body.staff.length).toBeGreaterThan(0);
  });

  it("a light check-in skips the slow-changing reads and leaves those parts out", async () => {
    const { send } = await tablet();
    const full = await send({});
    const light = await send({ light: true });
    expect(light.status).toBe(200);
    expect(light.body.light).toBe(true);
    for (const key of [...SLOW, "staff", "road_stops"]) expect(light.body).not.toHaveProperty(key);
    // What changes quickly still comes every time.
    expect(light.body.vehicle).toMatchObject({ id: "bus-a" });
    expect(light.body.group_messages.map((m) => m.text)).toEqual(["Morning"]);
    expect(light.body).toHaveProperty("open_shift");
    expect(light.body).toHaveProperty("occupancy");
    expect(light.reads.filter((r) => SLOW_TABLES.includes(r.name))).toEqual([]);
    expect(light.reads.length).toBeLessThan(full.reads.length / 2);
  });

  it("a locked tablet's light check-in still clears the passenger list and stops", async () => {
    const { send } = await tablet();
    const { body } = await send({ light: true }, false);
    expect(body.light).toBe(true);
    expect(body.staff).toEqual([]);
    expect(body.road_stops).toBeNull();
    expect(body.group_messages).toEqual([]);
    expect(body.trips).toEqual([]);
  });
});
