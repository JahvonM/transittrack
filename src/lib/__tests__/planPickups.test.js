import { describe, it, expect } from "vitest";
import { load, mock, request } from "../../../security-tests/helpers.js";

// Admin → Plan pickups: who is on the right bus, who needs one, who is on
// the wrong bus, whose route has no bus yet, and who no route reaches.

// Points along an east-west road at latitude 12 (`m` metres along, `off` north).
const at = (m, off = 0) => ({ lng: -61.76 + m / 108_740, lat: 12 + off / 110_574 });
const road = (fromM, toM, off = 0) => [at(fromM, off), at(toM, off)];

const call = async (sdk, name, body) => { const r = await load(name, sdk).default(request(body)); return { status: r.status, body: await r.json() }; };

function setup() {
  const sdk = mock("admin");
  sdk.tables.Route = [
    { id: "route-1", company_id: "a", name: "Coastal", stops: [], path: road(0, 2000) },
    { id: "route-2", company_id: "a", name: "Hills", stops: [], path: road(0, 2000, 3000) },
    { id: "route-3", company_id: "a", name: "New estate", stops: [], path: road(0, 2000, 900) },
    { id: "route-4", company_id: "a", name: "Coastal loop", stops: [], path: road(0, 2000, 40) },
  ];
  sdk.tables.Vehicle[0].route_id = "route-1"; // Bus A
  sdk.tables.Vehicle[0].capacity = 30;
  sdk.tables.Vehicle.push({ id: "bus-a2", company_id: "a", name: "Bus A2", route_id: "route-2", capacity: 30 });
  sdk.tables.Contact = [{ id: "card-needs", type: "passenger", company_id: "a", name: "Nia Needs", email: "needs@test.invalid" }];
  const person = (id, extra) => {
    sdk.tables.User.push({ id, role: "staff", email: id + "@test.invalid", full_name: id, ...extra });
    sdk.tables.CompanyMembership.push({ id: "m-" + id, user_id: id, company_id: "a", scope: "passenger", active: true, vehicle_id: extra.bus || "" });
  };
  const pickupOn = (route, m, off = 0) => ({ pickup_route_id: route, pickup_lat: at(m, off).lat, pickup_lng: at(m, off).lng, pickup_name: "Spot" });
  person("ok", { ...pickupOn("route-1", 300), bus: "bus-a" });
  person("needs", pickupOn("route-1", 600));
  person("wrong", { ...pickupOn("route-1", 900), bus: "bus-a2" });
  person("nobus", pickupOn("route-3", 500, 900));
  person("none", {});
  person("far", pickupOn("route-1", 1200, 400));
  // Saved on a route with no bus, but Bus A's road runs 40 m away.
  person("shared", { ...pickupOn("route-4", 1500, 40), bus: "bus-a" });
  return sdk;
}
const byKey = (plan) => Object.fromEntries(plan.people.map((p) => [p.key, p]));

describe("plan pickups", () => {
  it("sorts every passenger and suggests the bus that runs their road", async () => {
    const res = await call(setup(), "routeStops", { action: "plan" });
    expect(res.status).toBe(200);
    const p = byKey(res.body);
    expect(p["user:ok"].status).toBe("ok");
    expect(p["contact:card-needs"]).toMatchObject({ status: "needs_bus", name: "Nia Needs", suggested: { id: "bus-a", name: "Bus A" } });
    expect(p["user:wrong"]).toMatchObject({ status: "wrong_bus", bus_name: "Bus A2", suggested: { id: "bus-a" } });
    expect(p["user:nobus"]).toMatchObject({ status: "route_no_bus", route_name: "New estate" });
    expect(p["user:nobus"].nearby).toMatchObject({ bus_id: "bus-a", route_name: "Coastal" });
    expect(p["user:nobus"].nearby.distance_m).toBeGreaterThan(800);
    expect(p["user:none"].status).toBe("no_pickup");
    expect(p["user:far"].status).toBe("no_route");
    expect(p["user:shared"]).toMatchObject({ status: "ok", route_name: "Coastal", bus_name: "Bus A" });
    const busA = res.body.buses.find((b) => b.id === "bus-a");
    expect(busA).toMatchObject({ route_name: "Coastal", capacity: 30 });
  });

  it("assigning the suggested bus with the plan's key puts them on the right bus", async () => {
    const sdk = setup();
    const before = byKey((await call(sdk, "routeStops", { action: "plan" })).body);
    for (const key of ["contact:card-needs", "user:wrong"]) {
      const res = await call(sdk, "nfcCards", { action: "set_bus", person_key: key, vehicle_id: before[key].suggested.id });
      expect([key, res.status]).toEqual([key, 200]);
    }
    const after = byKey((await call(sdk, "routeStops", { action: "plan" })).body);
    expect(after["contact:card-needs"].status).toBe("ok");
    expect(after["user:wrong"].status).toBe("ok");
    expect(sdk.tables.CompanyMembership.find((m) => m.user_id === "needs").vehicle_id).toBe("bus-a");
  });

  it("is for administrators only", async () => {
    for (const role of ["staff", "company", "driver"]) {
      const sdk = setup();
      sdk.tables.User[0].role = role;
      expect((await call(sdk, "routeStops", { action: "plan" })).status).toBe(403);
    }
  });
});
