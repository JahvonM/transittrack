import { afterEach, describe, expect, it, vi } from "vitest";
import fixture from "./fixtures/route-short.json";
vi.mock("@/lib/mapbox", () => ({ MAPBOX_TOKEN: "test-token" }));
import { fetchTurnByTurnRoutes } from "@/lib/geo";
import { locationIsStale, remainingBusPoints } from "@/lib/busEta";

afterEach(() => vi.unstubAllGlobals());

describe("driver alternatives", () => {
  it("requests alternatives and retains each route's own geometry and time", async () => {
    const first = fixture.routes[0];
    const second = { ...first, duration: first.duration + 600, geometry: { ...first.geometry, coordinates: first.geometry.coordinates.map(([x, y]) => [x + 0.001, y]) } };
    const fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ routes: [first, second] }) });
    vi.stubGlobal("fetch", fetch);
    const choices = await fetchTurnByTurnRoutes({ lat: 12.1, lng: -61.7 }, { lat: 12.2, lng: -61.6 });
    expect(fetch.mock.calls[0][0]).toContain("alternatives=true");
    expect(choices).toHaveLength(2);
    expect(choices[1].durationS - choices[0].durationS).toBe(600);
    expect(choices[1].geometry).not.toEqual(choices[0].geometry);
  });
  it("accepts a single route and handles routing failure without invented choices", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => fixture }));
    expect(await fetchTurnByTurnRoutes({ lat: 12, lng: -61 }, { lat: 13, lng: -61 })).toHaveLength(1);
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    expect(await fetchTurnByTurnRoutes({ lat: 12, lng: -61 }, { lat: 13, lng: -61 })).toEqual([]);
  });
});

describe("bus arrival scope", () => {
  const stops = [0, 1, 2, 3].map((i) => ({ name: String(i), lat: 12 + i * 0.01, lng: -61.7, order: i }));
  const bus = { current_lat: 12.005, current_lng: -61.7 };
  it("includes all stops before pickup in route order", () => {
    expect(remainingBusPoints({ stops: [...stops].reverse() }, bus, stops[3])).toEqual([
      { lat: bus.current_lat, lng: bus.current_lng }, ...stops.slice(1),
    ]);
  });
  it("does not route backwards to an already passed pickup", () => {
    expect(remainingBusPoints({ stops }, { ...bus, current_lat: 12.025 }, stops[1])).toBeNull();
  });
  it("rejects unavailable or old GPS timestamps even when tracking is enabled", () => {
    const now = Date.parse("2026-10-04T12:00:00Z");
    expect(locationIsStale({ tracking_active: true }, now)).toBe(true);
    expect(locationIsStale({ last_location_update: new Date(now - 121000).toISOString() }, now)).toBe(true);
    expect(locationIsStale({ last_location_update: new Date(now - 30000).toISOString() }, now)).toBe(false);
  });
});
