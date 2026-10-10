import { describe, it, expect } from "vitest";
import { pickupStops, placeOnRoad, mergeDistance } from "../../../base44/shared/pickupStops.ts";

// A straight east-west road about 2.2 km long at latitude 12.
const road = [[-61.76, 12], [-61.74, 12]];
// A point `m` metres along the road, `off` metres north of it.
const at = (m, off = 0) => ({ lng: -61.76 + m / 108_740, lat: 12 + off / 110_574 });

describe("placing a pickup on the drawn road", () => {
  it("finds how far along the road it is and how far off it", () => {
    const p = placeOnRoad(road, at(500, 30).lat, at(500, 30).lng);
    expect(p.along).toBeCloseTo(500, -1);
    expect(p.off).toBeCloseTo(30, -1);
    expect(p.lat).toBeCloseTo(12, 6);
    expect(placeOnRoad([[0, 0]], 1, 1)).toBeNull();
  });
});

describe("pickups become stops along the road", () => {
  it("orders stops the way the bus reaches them and merges neighbours", () => {
    const { stops, offRoad } = pickupStops({
      road,
      pickups: [
        { id: "c", name: "Cara", ...at(1500, 10) },
        { id: "a", name: "Ann", ...at(300, 20) },
        { id: "b", name: "Ben", ...at(380, 5), pickup_name: "Outside Joe's shop" },
        { id: "far", name: "Far", ...at(900, 400) },
      ],
    });
    expect(stops.map((s) => s.riders.map((r) => r.id))).toEqual([["a", "b"], ["c"]]);
    expect(stops[0].name).toBe("Outside Joe's shop");
    expect(stops[1].name).toBe("Pickup 1");
    expect(offRoad).toEqual(["far"]);
    // The shared stop is at one of their spots; the other walks, and is told how far.
    expect(stops[0].riders.find((r) => r.id === "a").moved_m).toBe(0);
    expect(stops[0].riders.find((r) => r.id === "b").moved_m).toBeGreaterThan(60);
  });

  it("doesn't chain a long line of pickups into one stop", () => {
    const pickups = [0, 100, 200, 300, 400].map((m, i) => ({ id: "p" + i, name: "P" + i, ...at(200 + m) }));
    const { stops } = pickupStops({ road, pickups, mergeM: 150 });
    expect(stops.map((s) => s.riders.length)).toEqual([2, 2, 1]);
  });

  it("a fixed stop takes in the pickups near it and keeps its name and place", () => {
    const { stops } = pickupStops({
      road,
      fixed: [{ name: "Grand Anse junction", ...at(1000) }],
      pickups: [{ id: "x", name: "Xi", ...at(1080, 15) }, { id: "y", name: "Yo", ...at(1600) }],
    });
    expect(stops[0]).toMatchObject({ name: "Grand Anse junction", fixed: true });
    expect(stops[0].riders.map((r) => r.id)).toEqual(["x"]);
    expect(stops[1].riders.map((r) => r.id)).toEqual(["y"]);
  });

  it("can turn merging off, and the merge distance has limits", () => {
    const pickups = [{ id: "a", ...at(300) }, { id: "b", ...at(320) }];
    expect(pickupStops({ road, pickups, mergeM: 0 }).stops).toHaveLength(2);
    expect(mergeDistance({})).toBe(150);
    expect(mergeDistance({ pickup_merge_m: 80 })).toBe(80);
    expect(mergeDistance({ pickup_merge_m: 5000 })).toBe(500);
    expect(mergeDistance({ pickup_merge_m: -3 })).toBe(150);
  });
});

describe("routeStops: who sees which stops", () => {
  const setup = async (role) => {
    const { mock } = await import("../../../security-tests/helpers.js");
    const sdk = mock(role);
    sdk.tables.Route = [{ id: "route-a", company_id: "a", name: "Coastal", stops: [], path: [{ lat: 12, lng: -61.76 }, { lat: 12, lng: -61.74 }] }];
    sdk.tables.Vehicle[0].route_id = "route-a";
    const me = sdk.tables.User.find((u) => u.id === "caller");
    Object.assign(me, { pickup_route_id: "route-a", pickup_lat: at(300).lat, pickup_lng: at(300).lng, pickup_name: "Roadside pickup · Coastal" });
    sdk.tables.User.push({ id: "nb", role: "staff", email: "nb@test.invalid", full_name: "Neighbour Name", pickup_route_id: "route-a", pickup_lat: at(400).lat, pickup_lng: at(400).lng });
    sdk.tables.CompanyMembership.push({ id: "m-nb", user_id: "nb", company_id: "a", scope: "passenger", active: true });
    sdk.tables.Contact = [{ id: "card", type: "staff", company_id: "a", name: "Directory Rider", vehicle_id: "bus-a", pickup_lat: at(1500).lat, pickup_lng: at(1500).lng }];
    return sdk;
  };
  const call = async (sdk, body) => {
    const { load, request } = await import("../../../security-tests/helpers.js");
    const r = await load("routeStops", sdk).default(request(body));
    return { status: r.status, body: await r.json() };
  };

  it("an admin gets every stop on the road with who gets on there", async () => {
    const res = await call(await setup("admin"), { action: "route", route_id: "route-a" });
    expect(res.status).toBe(200);
    expect(res.body.has_road).toBe(true);
    expect(res.body.stops.map((s) => s.riders.map((r) => r.name))).toEqual([["Caller", "Neighbour Name"], ["Directory Rider"]]);
  });

  it("a passenger gets only their own stop: where, how far, how many share it, and no names", async () => {
    const sdk = await setup("staff");
    sdk.tables.CompanyMembership[0].company_id = "a";
    const res = await call(sdk, { action: "mine" });
    expect(res.status).toBe(200);
    expect(res.body.stop).toMatchObject({ shared_with: 1, fixed: false });
    expect(JSON.stringify(res.body)).not.toMatch(/Neighbour|Directory|nb@/);
    expect((await call(sdk, { action: "route", route_id: "route-a" })).status).toBe(403);
  });

  it("nothing for a passenger who isn't a member of the route's company", async () => {
    const sdk = await setup("staff");
    sdk.tables.CompanyMembership[0].company_id = "b";
    expect((await call(sdk, { action: "mine" })).body.stop).toBeNull();
  });
});
