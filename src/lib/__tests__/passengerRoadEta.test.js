import { describe, it, expect } from "vitest";
import { load, mock, request } from "../../../security-tests/helpers.js";
import { remainingBusPoints, roughMinutes } from "@/lib/busEta";
import { pickupArrival } from "@/lib/pickupArrival";

// Passengers on a route with only a drawn road (no named stops): an arrival
// time along the road, how many of the bus's stops are left before theirs,
// and a heads-up when their stop is next.

// The drawn road: Town → True Blue → Grand Anse, as straight lines.
const ROAD = [{ lat: 12.05, lng: -61.75 }, { lat: 12.02, lng: -61.76 }, { lat: 12.0, lng: -61.78 }];
// A point `t` of the way from Town to True Blue (about 3.3 km).
const onFirstLeg = (t) => ({ lat: 12.05 - 0.03 * t, lng: -61.75 - 0.01 * t });
const SECRETS = { TT_ATOMIC_STORE_URL: "https://example.supabase.co", TT_ATOMIC_SERVICE_ROLE_KEY: "sb_secret_synthetic-test-key-never-real", FIREBASE_SERVICE_ACCOUNT: "{}" };

function addRiders(sdk) {
  const rider = (id, name, at, extra = {}, bus = "bus-a") => {
    sdk.tables.User.push({ id, role: "staff", email: id + "@test.invalid", full_name: name, pickup_route_id: "route-a", pickup_lat: at.lat, pickup_lng: at.lng, pickup_name: "Roadside pickup · Coastal", ...extra });
    sdk.tables.CompanyMembership.push({ id: "m-" + id, user_id: id, company_id: "a", scope: "passenger", active: true, vehicle_id: bus });
  };
  rider("cara", "Cara Diaz", onFirstLeg(0.2), { stop_alerts: true });
  rider("ann", "Ann Lee", onFirstLeg(0.5), { stop_alerts: true });
  rider("ben", "Ben Cole", onFirstLeg(0.52)); // alerts off
  rider("dev", "Dev Other Bus", onFirstLeg(0.3), { stop_alerts: true }, "bus-other");
  sdk.tables.Contact = [];
  sdk.tables.PushToken = ["cara", "ann", "ben", "dev"].map((id) => ({ email: id + "@test.invalid", token: "TOKEN-" + id }));
  sdk.tables.NotificationLog = [];
}

// A driver tablet on bus-a. Only a drawn road: the route has no named stops.
async function tablet({ direction = "to_work" } = {}) {
  const sdk = mock(null);
  sdk.testSecrets = SECRETS;
  sdk.tables.KioskDevice[0].kiosk_type = "driver";
  const start = onFirstLeg(0);
  Object.assign(sdk.tables.Vehicle[0], { route_id: "route-a", driver_name: "Kofi", trip_direction: direction, tracking_active: true, current_lat: start.lat, current_lng: start.lng, last_location_update: new Date(Date.now() - 60_000).toISOString() });
  sdk.tables.Route = [{ id: "route-a", company_id: "a", name: "Country", path: ROAD, stops: [] }];
  addRiders(sdk);
  const api = load("driverSession", sdk, ["issueGrant"]);
  const grant = await api.issueGrant(sdk, sdk.tables.KioskDevice[0], "driver", "bus-a", 60000);
  let tick = 0;
  const send = async (body) => {
    const res = await api.default(request({ device_id: "tablet", driver_grant: grant, ...body }));
    return { status: res.status, body: await res.json() };
  };
  // A GPS fix `t` of the way along the first leg, reporting the next stop.
  const drive = (t, roadNext) => {
    const at = onFirstLeg(t);
    tick += 1;
    return send({ action: "update_location", lat: at.lat, lng: at.lng, speed: 8, status: "on_trip", recorded_at: new Date(Date.now() - 50_000 + tick * 1000).toISOString(), ...(roadNext == null ? {} : { road_next: roadNext }) });
  };
  const told = () => sdk.tables.NotificationLog.flatMap((row) => row.recipients || []);
  return { sdk, send, drive, told };
}

describe("the bus's next stop on a drawn road", () => {
  it("the tablet's stop list is the one passengers are counted against", async () => {
    const { send } = await tablet();
    const stops = (await send({ action: "heartbeat" })).body.road_stops.stops;
    expect(stops.map((s) => s.name)).toEqual(["Pickup 1", "Pickup 3"]);
  });

  it("stores the next stop, tells the passengers at it who switched alerts on, once", async () => {
    const { sdk, drive, told } = await tablet();
    expect((await drive(0.05, 0)).status).toBe(200);
    expect(sdk.tables.Vehicle[0].road_next_stop).toBe(0);
    // Pickup 1 (Cara) is next: only Cara is told. Dev rides another bus.
    expect(told()).toEqual(["cara@test.invalid"]);
    await drive(0.3, 1);
    expect(sdk.tables.Vehicle[0].road_next_stop).toBe(1);
    // Pickup 3 next: Ann (alerts on), not Ben (alerts off).
    expect(told()).toEqual(["cara@test.invalid", "ann@test.invalid"]);
    expect(sdk.tables.NotificationLog.at(-1)).toMatchObject({ key: "stop_ahead" });
    // GPS wobble back past a stop doesn't move it back or alert again.
    await drive(0.29, 0);
    expect(sdk.tables.Vehicle[0].road_next_stop).toBe(1);
    await drive(0.31, 1);
    expect(told()).toHaveLength(2);
    // The alert never names anyone else's pickup.
    expect(JSON.stringify(sdk.tables.NotificationLog)).not.toMatch(/Cara|Ben Cole|12\.0/);
  });

  it("a new run along the road counts from the start again", async () => {
    const { sdk, drive, told } = await tablet();
    await drive(0.6, 2);
    expect(sdk.tables.Vehicle[0].road_next_stop).toBe(2);
    await drive(0.01, 0);
    expect(sdk.tables.Vehicle[0].road_next_stop).toBe(0);
    await drive(0.05, 1);
    expect(told()).toEqual(["ann@test.invalid"]);
  });

  it("doesn't alert pickups on the way home, and a new trip clears it", async () => {
    const { sdk, send, drive, told } = await tablet({ direction: "to_home" });
    await drive(0.3, 1);
    expect(sdk.tables.Vehicle[0].road_next_stop).toBe(1);
    expect(told()).toEqual([]);
    expect((await send({ action: "set_direction", direction: "to_work" })).status).toBe(200);
    expect(sdk.tables.Vehicle[0].road_next_stop).toBeNull();
  });

  it("ignores a next stop that isn't a whole number", async () => {
    const { sdk, drive } = await tablet();
    await drive(0.3, 1.5);
    await drive(0.31, -1);
    expect(sdk.tables.Vehicle[0].road_next_stop ?? null).toBeNull();
  });
});

describe("a passenger's place in their bus's stop list", () => {
  it("is where the driver's list has their stop, as a number only", async () => {
    const { sdk, send } = await tablet();
    const caller = sdk.tables.User.find((u) => u.id === "caller");
    Object.assign(caller, { role: "staff", pickup_route_id: "route-a", pickup_lat: onFirstLeg(0.51).lat, pickup_lng: onFirstLeg(0.51).lng });
    sdk.tables.CompanyMembership[0].vehicle_id = "bus-a";
    const driverStops = (await send({ action: "heartbeat" })).body.road_stops.stops;
    sdk.auth = { me: async () => sdk.tables.User.find((u) => u.id === "caller") };
    const res = await load("routeStops", sdk).default(request({ action: "mine" }));
    const { stop } = await res.json();
    expect(stop.bus_id).toBe("bus-a");
    expect(driverStops[stop.bus_order].name).toBe(stop.name);
    expect(stop.bus_order).toBe(1);
    expect(Object.keys(stop)).not.toContain("riders");
  });

  it("counts only the stops of their own bus", async () => {
    const { sdk } = await tablet();
    // Dev's bus (bus-other) doesn't stop at Cara's or Ann's pickups.
    sdk.tables.Vehicle.push({ id: "bus-other", company_id: "a", name: "Bus Other", route_id: "route-a" });
    sdk.auth = { me: async () => sdk.tables.User.find((u) => u.id === "dev") };
    const { stop } = await (await load("routeStops", sdk).default(request({ action: "mine" }))).json();
    expect(stop).toMatchObject({ bus_id: "bus-other", bus_order: 0 });
  });
});

describe("arrival time along a drawn road", () => {
  const route = { path: ROAD, stops: [] };
  const bus = (t) => ({ current_lat: onFirstLeg(t).lat, current_lng: onFirstLeg(t).lng });

  it("goes from the bus along the road to the stop", () => {
    const stop = onFirstLeg(0.8);
    const points = remainingBusPoints(route, bus(0.1), stop);
    expect(points[0]).toEqual({ lat: onFirstLeg(0.1).lat, lng: onFirstLeg(0.1).lng });
    expect(points.at(-1)).toEqual(stop);
    expect(points.length).toBeGreaterThanOrEqual(2);
  });

  it("follows the drawn road around its bends", () => {
    const stop = { lat: 12.005, lng: -61.775 }; // on the second leg
    const points = remainingBusPoints(route, bus(0.2), stop);
    // Passes True Blue's corner rather than cutting across.
    expect(points.some((p) => Math.abs(p.lat - 12.02) < 0.004 && Math.abs(p.lng + 61.76) < 0.004)).toBe(true);
  });

  it("has no time once the bus is past the stop", () => {
    expect(remainingBusPoints(route, bus(0.9), onFirstLeg(0.3))).toBeNull();
  });

  it("goes straight to the stop while the bus is still off the road", () => {
    const depot = { current_lat: 12.06, current_lng: -61.70 };
    expect(remainingBusPoints(route, depot, onFirstLeg(0.5))).toEqual([{ lat: 12.06, lng: -61.70 }, onFirstLeg(0.5)]);
  });

  it("keeps using named stops on routes without a drawn road", () => {
    const stops = [{ name: "A", lat: 12.05, lng: -61.75, order: 0 }, { name: "B", lat: 12.02, lng: -61.76, order: 1 }, { name: "C", lat: 12.0, lng: -61.78, order: 2 }];
    const points = remainingBusPoints({ stops }, { current_lat: 12.04, current_lng: -61.753 }, stops[2]);
    expect(points.map((p) => p.name || "bus")).toEqual(["bus", "B", "C"]);
  });

  it("gives a rough time when directions can't be fetched", () => {
    const { mins, km } = roughMinutes([onFirstLeg(0), onFirstLeg(1)]);
    expect(km).toBeGreaterThan(3.5);
    expect(km).toBeLessThan(5);
    expect(mins).toBeGreaterThan(7);
    expect(mins).toBeLessThan(10);
  });

  it("a few minutes out counts as close to the stop", () => {
    const now = Date.now();
    const live = { ...bus(0.1), tracking_active: true, last_location_update: new Date(now - 5000).toISOString() };
    expect(pickupArrival({ bus: live, pickup: onFirstLeg(0.8), mins: 2.5, now })?.kind).toBe("nearby");
    expect(pickupArrival({ bus: live, pickup: onFirstLeg(0.8), mins: 9, now })?.kind).toBe("on_way");
  });
});
