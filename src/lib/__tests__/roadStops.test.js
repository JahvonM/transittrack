import { describe, it, expect, vi, afterEach } from "vitest";
import { busOnRoad, nextRoadStopIndex, roadStopsOf, roadVia } from "../roadStops";
import { pickupMovedNote } from "../pickupOnBus";

// A straight road at latitude 12, about 2.2 km long, drawn through 3 points.
const route = {
  path: [{ lat: 12, lng: -61.76 }, { lat: 12, lng: -61.75 }, { lat: 12, lng: -61.74 }],
  path_via: [{ lat: 12, lng: -61.76 }, { lat: 12.0002, lng: -61.75 }, { lat: 12, lng: -61.74 }],
};
const at = (m) => -61.76 + m / 108_740; // longitude `m` metres along it
const stops = [{ key: "a", name: "A", along: 200 }, { key: "b", name: "B", along: 900 }, { key: "c", name: "C", along: 1800 }];

describe("the bus on the drawn road", () => {
  it("knows the next stop along the road and when all are passed", () => {
    expect(nextRoadStopIndex(stops, busOnRoad(route, 12, at(100)))).toBe(0);
    expect(nextRoadStopIndex(stops, busOnRoad(route, 12, at(500)))).toBe(1);
    // Just short of B (within 30 m behind it) still counts B as next.
    expect(nextRoadStopIndex(stops, busOnRoad(route, 12, at(920)))).toBe(1);
    expect(nextRoadStopIndex(stops, busOnRoad(route, 12, at(2100)))).toBe(3);
  });

  it("falls back when the bus is off the road or there's no road", () => {
    expect(nextRoadStopIndex(stops, busOnRoad(route, 12.01, at(500)))).toBeNull();
    expect(busOnRoad({ path: [] }, 12, at(500))).toBeNull();
    expect(roadStopsOf({ route, road_stops: { stops } })).toBe(stops);
    expect(roadStopsOf({ route: {}, road_stops: { stops } })).toBeNull();
    expect(roadStopsOf({ route, road_stops: null })).toBeNull();
  });

  it("passes through the points the road was drawn through on the way to a stop", () => {
    expect(roadVia(route, 100, 1800)).toEqual([{ lat: 12.0002, lng: -61.75 }]);
    expect(roadVia(route, 1200, 1800)).toEqual([]);
    expect(roadVia(route, 100, 300)).toEqual([]);
    // Without tapped points it samples the road itself.
    expect(roadVia({ path: route.path }, 100, 1800)).toEqual([{ lat: 12, lng: -61.75 }]);
  });
});

describe("directions that follow the drawn road", () => {
  afterEach(() => vi.unstubAllGlobals());
  it("sends the road points as silent waypoints, by plain driving when there are many", async () => {
    vi.resetModules();
    vi.doMock("@/lib/mapbox", () => ({ MAPBOX_TOKEN: "test-token" }));
    const urls = [];
    vi.stubGlobal("fetch", async (url) => { urls.push(url); return { ok: false, json: async () => ({}) }; });
    const { fetchTurnByTurnRoutes } = await import("../geo");
    await fetchTurnByTurnRoutes({ lat: 12, lng: -61.76 }, { lat: 12, lng: -61.74 }, { via: [{ lat: 12, lng: -61.755 }, { lat: 12, lng: -61.75 }] });
    expect(urls).toHaveLength(1);
    expect(urls[0]).toMatch(/\/driving\/-61\.76,12;-61\.755,12;-61\.75,12;-61\.74,12\?/);
    expect(urls[0]).toContain("waypoints=0;3");
    expect(urls[0]).toContain("alternatives=false");
    urls.length = 0;
    await fetchTurnByTurnRoutes({ lat: 12, lng: -61.76 }, { lat: 12, lng: -61.74 });
    expect(urls[0]).toMatch(/driving-traffic/);
    expect(urls[0]).not.toContain("waypoints=");
    vi.doUnmock("@/lib/mapbox");
  });
});

describe("the passenger's note when a driver moved their pickup", () => {
  const moved = { at: "2026-10-09T08:00:00Z", by: "Kofi", m: 70, lat: 12.035, lng: -61.755 };
  const now = Date.parse("2026-10-10T08:00:00Z");
  it("shows while the pickup is still where the driver put it", () => {
    expect(pickupMovedNote({ pickup_lat: 12.035, pickup_lng: -61.755, pickup_moved: moved }, now)).toMatch(/^Kofi moved your pickup 70 m along the road on .+, to where the bus can stop\.$/);
  });
  it("goes once they pick a new spot, or after two weeks", () => {
    expect(pickupMovedNote({ pickup_lat: 12.1, pickup_lng: -61.755, pickup_moved: moved }, now)).toBeNull();
    expect(pickupMovedNote({ pickup_lat: 12.035, pickup_lng: -61.755, pickup_moved: moved }, now + 15 * 86400_000)).toBeNull();
    expect(pickupMovedNote({ pickup_lat: 12.035, pickup_lng: -61.755 }, now)).toBeNull();
  });
});
