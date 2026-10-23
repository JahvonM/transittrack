import { describe, expect, it } from "vitest";
import { pickupOnAssignedRoad } from "../pickupOnBus";

const route = {
  id: "country",
  path: [
    { lat: 12.22, lng: -61.64 },
    { lat: 12.23, lng: -61.63 },
  ],
};

describe("legacy roadside pickup recognition", () => {
  it("recognizes a saved pickup on the assigned road even without pickup_route_id", () => {
    expect(pickupOnAssignedRoad({ pickup_lat: 12.225, pickup_lng: -61.635, pickup_route_id: "" }, route)).toBe(true);
  });
  it("rejects a saved pickup on another road", () => {
    expect(pickupOnAssignedRoad({ pickup_lat: 12.30, pickup_lng: -61.60 }, route)).toBe(false);
  });
  it("rejects missing, malformed or unavailable route geometry", () => {
    expect(pickupOnAssignedRoad({ pickup_lat: null, pickup_lng: -61.635 }, route)).toBe(false);
    expect(pickupOnAssignedRoad({ pickup_lat: "not-a-coordinate", pickup_lng: -61.635 }, route)).toBe(false);
    expect(pickupOnAssignedRoad({ pickup_lat: 12.225, pickup_lng: -61.635 }, { id: "country" })).toBe(false);
  });
});
