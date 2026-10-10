import { describe, it, expect } from "vitest";
import { drawnRoad, roadLengthKm, simplifyRoad, snapRoad } from "@/lib/routeRoad";
import { load, mock, request } from "../../../security-tests/helpers.js";

// A route's road can be drawn in the Route Planner instead of being worked
// out from its stops.
const call = async (sdk, name, body) => { const r = await load(name, sdk).default(request(body)); return { status: r.status, body: await r.json() }; };

describe("the drawn road", () => {
  it("is read from the route as [lng, lat] pairs, and is absent when not drawn", () => {
    expect(drawnRoad({ path: [{ lat: 12, lng: -61.7 }, { lat: 12.01, lng: -61.71 }] })).toEqual([[-61.7, 12], [-61.71, 12.01]]);
    expect(drawnRoad({ path: [{ lat: 12, lng: -61.7 }] })).toBeNull();
    expect(drawnRoad({ stops: [{ lat: 1, lng: 1 }, { lat: 2, lng: 2 }] })).toBeNull();
    expect(drawnRoad({ path: [{ lat: "x", lng: 1 }, { lat: 12, lng: -61.7 }] })).toBeNull();
  });

  it("keeps the shape of the road with fewer points", () => {
    const straight = Array.from({ length: 50 }, (_, i) => [-61.7 + i * 0.0001, 12]);
    expect(simplifyRoad(straight)).toEqual([straight[0], straight[49]]);
    const corner = [[-61.7, 12], [-61.699, 12], [-61.698, 12], [-61.698, 12.001], [-61.698, 12.002]];
    expect(simplifyRoad(corner)).toEqual([[-61.7, 12], [-61.698, 12], [-61.698, 12.002]]);
    expect(roadLengthKm([[-61.7, 12], [-61.7, 12.01]])).toBeCloseTo(1.11, 1);
  });

  it("follows the streets through every tapped point, in pieces the map service accepts", async () => {
    const calls = [];
    const fetcher = async (url) => {
      const coords = decodeURIComponent(url.split("/driving/")[1].split("?")[0]).split(";").map((c) => c.split(",").map(Number));
      calls.push(coords.length);
      return { ok: true, json: async () => ({ routes: [{ geometry: { coordinates: coords } }] }) };
    };
    const taps = Array.from({ length: 30 }, (_, i) => ({ lat: 12 + (i % 2) * 0.001, lng: -61.7 + i * 0.001 }));
    const line = await snapRoad(taps, { fetcher });
    expect(calls).toEqual([25, 6]); // 25 points, then the rest starting from the 25th
    expect(line[0]).toEqual([-61.7, 12]);
    expect(line.at(-1)[0]).toBeCloseTo(-61.671, 5);
    expect(await snapRoad(taps.slice(0, 1), { fetcher })).toBeNull();
    expect(await snapRoad(taps.slice(0, 3), { fetcher: async () => ({ ok: false }) })).toBeNull();
  });
});

describe("saving and sharing a drawn road", () => {
  const route = { id: "route-a", company_id: "a", name: "Coastal", stops: [], path: [{ lat: 12, lng: -61.7 }, { lat: 12.01, lng: -61.71 }], path_via: [{ lat: 12, lng: -61.7 }, { lat: 12.01, lng: -61.71 }] };

  it("only accepts map points of a sensible size", async () => {
    const sdk = mock("admin");
    sdk.tables.Route = [];
    const save = (data) => call(sdk, "entityAccess", { entity: "Route", operation: "create", data: { name: "R", company_id: "a", ...data } });
    expect((await save({ path: route.path, path_via: route.path_via })).status).toBe(200);
    expect(sdk.tables.Route.at(-1).path).toEqual([{ lat: 12, lng: -61.7 }, { lat: 12.01, lng: -61.71 }]);
    expect((await save({ path: [{ lat: 95, lng: 0 }] })).status).toBe(400);
    expect((await save({ path: "not a road" })).status).toBe(400);
    expect((await save({ path: Array.from({ length: 5001 }, () => ({ lat: 1, lng: 1 })) })).status).toBe(400);
    expect((await save({ path: [{ lat: 12, lng: -61.7, evil: "<script>" }] })).status).toBe(200);
    expect(sdk.tables.Route.at(-1).path).toEqual([{ lat: 12, lng: -61.7 }]);
  });

  it("reaches the driver phone with the route", async () => {
    const sdk = mock("staff");
    sdk.tables.Driver = [{ id: "drv", full_name: "Dana", email: "caller@test.invalid", company_id: "a", phone_app_access: true }];
    sdk.tables.Vehicle[0].driver_email = "caller@test.invalid";
    sdk.tables.Vehicle[0].route_id = "route-a";
    sdk.tables.Route = [route];
    sdk.tables.Contact = [];
    const res = await call(sdk, "driverPhone", { action: "today" });
    expect(res.status).toBe(200);
    expect(res.body.route.path).toEqual(route.path);
  });
});

describe("the bus tablet", () => {
  it("receives the drawn road with its route", async () => {
    const sdk = mock("staff");
    sdk.tables.KioskDevice = [{ id: "drv", created_date: "2026-10-01T00:00:00Z", status: "active", paired: true, kiosk_type: "driver", company_id: "a", company_name: "A", vehicle_id: "bus-a", pairing_code: "PAIR12345678" }, ...sdk.tables.KioskDevice];
    sdk.tables.Vehicle[0].route_id = "route-a";
    sdk.tables.Route = [{ id: "route-a", company_id: "a", name: "Coastal", stops: [{ name: "Town", lat: 12, lng: -61.7, order: 0 }], path: [{ lat: 12, lng: -61.7 }, { lat: 12.01, lng: -61.71 }], path_via: [{ lat: 12, lng: -61.7 }] }];
    const res = await call(sdk, "driverSession", { device_id: "drv", action: "heartbeat" });
    expect(res.status).toBe(200);
    expect(res.body.route.path).toEqual([{ lat: 12, lng: -61.7 }, { lat: 12.01, lng: -61.71 }]);
    expect(res.body.route.stops).toHaveLength(1);
  });
});
