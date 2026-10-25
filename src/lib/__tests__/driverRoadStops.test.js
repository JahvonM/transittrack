import { describe, it, expect } from "vitest";
import { load, mock, request } from "../../../security-tests/helpers.js";

// Driver stops on a route with a drawn road: the tablet and phone list the
// stops in the order the bus reaches them on the road, the tablet can move a
// pickup to where the bus is (passengers told, change logged), and stops are
// only added or moved on the road.

// The drawn road: Town → True Blue → Grand Anse, as straight lines.
const ROAD = [{ lat: 12.05, lng: -61.75 }, { lat: 12.02, lng: -61.76 }, { lat: 12.0, lng: -61.78 }];
// A point `t` of the way from Town to True Blue (about 3.3 km).
const onFirstLeg = (t) => ({ lat: 12.05 - 0.03 * t, lng: -61.75 - 0.01 * t });

function addRiders(sdk) {
  const rider = (id, name, at, bus = "bus-a") => {
    sdk.tables.User.push({ id, role: "staff", email: id + "@test.invalid", full_name: name, pickup_route_id: "route-a", pickup_lat: at.lat, pickup_lng: at.lng, pickup_name: "Roadside pickup · Coastal" });
    sdk.tables.CompanyMembership.push({ id: "m-" + id, user_id: id, company_id: "a", scope: "passenger", active: true, vehicle_id: bus });
  };
  rider("ann", "Ann Lee", onFirstLeg(0.5));
  rider("ben", "Ben Cole", onFirstLeg(0.52));
  rider("cara", "Cara Diaz", onFirstLeg(0.2));
  rider("dev", "Dev Other Bus", onFirstLeg(0.3), "bus-other");
  sdk.tables.Contact = [];
  sdk.tables.PushToken = [];
}

async function tablet({ bus = onFirstLeg(0.48), fixAgeMs = 10_000 } = {}) {
  const sdk = mock(null);
  sdk.tables.KioskDevice[0].kiosk_type = "driver";
  Object.assign(sdk.tables.Vehicle[0], { route_id: "route-a", driver_name: "Kofi", current_lat: bus.lat, current_lng: bus.lng, last_location_update: new Date(Date.now() - fixAgeMs).toISOString() });
  sdk.tables.Route = [{ id: "route-a", company_id: "a", name: "Coastal", path: ROAD, stops: [
    { name: "Town", lat: 12.05, lng: -61.75, order: 0 },
    { name: "True Blue", lat: 12.02, lng: -61.76, order: 1 },
    { name: "Grand Anse", lat: 12.0, lng: -61.78, order: 2 },
  ] }];
  addRiders(sdk);
  const api = load("driverSession", sdk, ["issueGrant"]);
  const grant = await api.issueGrant(sdk, sdk.tables.KioskDevice[0], "driver", "bus-a", 60000);
  const send = async (body, withGrant = true) => {
    const res = await api.default(request({ device_id: "tablet", ...(withGrant ? { driver_grant: grant } : {}), ...body }));
    return { status: res.status, body: await res.json() };
  };
  return { sdk, send };
}

describe("tablet stop list on a drawn road", () => {
  it("lists the stops in road order with who gets on where, only once unlocked", async () => {
    const { send } = await tablet();
    const { body } = await send({ action: "heartbeat" });
    const stops = body.road_stops.stops;
    // Pickups are numbered along the whole route, so the names match what
    // passengers are told; "Pickup 2" is another bus's passenger's.
    expect(stops.map((s) => s.name)).toEqual(["Town", "Pickup 1", "Pickup 3", "True Blue", "Grand Anse"]);
    expect(stops[1].riders.map((r) => r.name)).toEqual(["Cara Diaz"]);
    expect(stops[2]).toMatchObject({ key: "pickup:user:ann", fixed: false });
    expect(stops[2].riders.map((r) => r.name)).toEqual(["Ann Lee", "Ben Cole"]);
    // Another bus's passenger isn't on this bus's list.
    expect(JSON.stringify(body.road_stops)).not.toMatch(/Dev Other|@test/);
    expect((await send({ action: "heartbeat" }, false)).body.road_stops).toBeNull();
  });
});

describe("move a pickup to where the bus is", () => {
  it("moves everyone who meets there onto the road at the bus, notes it for them, and logs it", async () => {
    const { sdk, send } = await tablet();
    const res = await send({ action: "move_pickup", stop_key: "pickup:user:ann", lat: 1, lng: 1 });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ ok: true, moved: 2 });
    expect(res.body.moved_m).toBeGreaterThan(50);
    const bus = onFirstLeg(0.48);
    for (const id of ["ann", "ben"]) {
      const u = sdk.tables.User.find((x) => x.id === id);
      expect(u.pickup_lat).toBeCloseTo(bus.lat, 5);
      expect(u.pickup_lng).toBeCloseTo(bus.lng, 5);
      expect(u.pickup_moved).toMatchObject({ by: "Kofi", m: res.body.moved_m, lat: u.pickup_lat, lng: u.pickup_lng });
    }
    // Cara's pickup is somewhere else and stays put.
    expect(sdk.tables.User.find((x) => x.id === "cara").pickup_moved).toBeUndefined();
    expect(sdk.tables.AuditLog.at(-1)).toMatchObject({ entity: "Route", record_id: "route-a", actor_role: "driver" });
    expect(sdk.tables.AuditLog.at(-1).summary).toMatch(/Moved pickup "Pickup 3" \d+ m .* for 2 passengers/);
    expect(sdk.tables.AuditLog.at(-1).summary).not.toMatch(/Ann|Ben/);
  });

  it("refuses when the bus isn't near that pickup", async () => {
    const { sdk, send } = await tablet({ bus: onFirstLeg(0.9) });
    const res = await send({ action: "move_pickup", stop_key: "pickup:user:ann" });
    expect(res.status).toBe(400);
    expect(sdk.tables.User.find((x) => x.id === "ann").pickup_moved).toBeUndefined();
  });

  it("refuses a fixed stop, an unknown pickup, and edits without the PIN", async () => {
    const { send } = await tablet();
    expect((await send({ action: "move_pickup", stop_key: "fixed:True Blue" })).status).toBe(404);
    expect((await send({ action: "move_pickup", stop_key: "pickup:user:nobody" })).status).toBe(404);
    expect((await send({ action: "move_pickup", stop_key: "pickup:user:ann" }, false)).status).toBe(401);
  });
});

describe("adding and moving stops on a drawn road", () => {
  it("adds a stop like before, in the order the bus reaches it on the road", async () => {
    const { sdk, send } = await tablet({ bus: { lat: 12.01, lng: -61.77 } });
    const res = await send({ action: "add_stop", name: "Morne Jaloux junction" });
    expect(res.status).toBe(200);
    expect(sdk.tables.Route[0].stops.map((s) => [s.name, s.order])).toEqual([["Town", 0], ["True Blue", 1], ["Morne Jaloux junction", 2], ["Grand Anse", 3]]);
  });

  it("won't add or move a stop more than 50 m off the road", async () => {
    const { sdk, send } = await tablet({ bus: { lat: 12.03, lng: -61.74 } });
    const res = await send({ action: "add_stop", name: "Off the road" });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/only be changed on the road/);
    expect(sdk.tables.Route[0].stops).toHaveLength(3);
  });
});

describe("driver phone stop list on a drawn road", () => {
  it("lists stops in road order by name, without pickup points, and who meets where", async () => {
    const sdk = mock("staff");
    sdk.tables.Driver = [{ id: "drv", full_name: "Dana Driver", email: "caller@test.invalid", auth_user_id: "mock-auth-caller", company_id: "a", company_name: "A", phone_app_access: true }];
    Object.assign(sdk.tables.Vehicle[0], { driver_email: "caller@test.invalid", route_id: "route-a" });
    sdk.tables.Route = [{ id: "route-a", company_id: "a", name: "Coastal", path: ROAD, stops: [
      { name: "Town", lat: 12.05, lng: -61.75, order: 0 }, { name: "Grand Anse", lat: 12.0, lng: -61.78, order: 1 },
    ] }];
    sdk.tables.CompanyMembership[0].vehicle_id = "bus-other";
    addRiders(sdk);
    const res = await load("driverPhone", sdk).default(request({ action: "today" }));
    const body = await res.json();
    expect(body.route.stops.map((s) => s.name)).toEqual(["Town", "Pickup 1", "Pickup 3", "Grand Anse"]);
    expect(body.route.stops[1]).toMatchObject({ lat: null, lng: null, fixed: false });
    const at = Object.fromEntries(body.pickups.map((p) => [p.name, p.stop]));
    expect(at["Ann L."] ?? at["Ann Lee"]).toBe("Pickup 3");
    expect(at["Cara D."] ?? at["Cara Diaz"]).toBe("Pickup 1");
    expect(JSON.stringify(body.pickups)).not.toMatch(/Dev/);
  });
});

describe("passengers and drivers agree on the meeting point", () => {
  it("a passenger whose bus drives past their pickup meets at the same stop the driver sees", async () => {
    const { sdk, send } = await tablet();
    // Saved on another route, but on this bus and beside its road.
    Object.assign(sdk.tables.User.find((u) => u.id === "caller"), { pickup_route_id: "route-old", pickup_lat: onFirstLeg(0.51).lat, pickup_lng: onFirstLeg(0.51).lng });
    sdk.tables.CompanyMembership[0].vehicle_id = "bus-a";
    const driverSees = (await send({ action: "heartbeat" })).body.road_stops.stops.find((s) => s.riders.some((r) => r.name === "Caller"));
    sdk.auth = { me: async () => sdk.tables.User.find((u) => u.id === "caller") };
    const res = await load("routeStops", sdk).default(request({ action: "mine" }));
    const mine = (await res.json()).stop;
    expect(driverSees.name).toBe("Pickup 3");
    expect(mine).toMatchObject({ name: driverSees.name, lat: driverSees.lat, lng: driverSees.lng, shared_with: 2 });
  });
});
