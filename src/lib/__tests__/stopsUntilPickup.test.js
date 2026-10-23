import { describe, expect, it } from "vitest";
import { placeOnRoad, stopsUntilPickup } from "../../../base44/shared/pickupStops.ts";

const road = [[-61.700, 12.100], [-61.690, 12.100]];
const stops = [-61.698, -61.696, -61.694].map((lng) => ({
  along: placeOnRoad(road, 12.100, lng).along,
}));

describe("private stops-away count on a drawn route", () => {
  it("counts only stops ahead of the bus, not route points", () => {
    expect(stopsUntilPickup(stops, 2, road, 12.100, -61.699)).toBe(2);
    expect(stopsUntilPickup(stops, 2, road, 12.100, -61.697)).toBe(1);
  });
  it("does not claim arrival when the bus has passed the pickup", () => {
    expect(stopsUntilPickup(stops, 0, road, 12.100, -61.692)).toBeNull();
  });
  it("rejects a bus far from the road or unknown stop order", () => {
    expect(stopsUntilPickup(stops, 1, road, 12.200, -61.698)).toBeNull();
    expect(stopsUntilPickup(stops, -1, road, 12.100, -61.698)).toBeNull();
  });
});
