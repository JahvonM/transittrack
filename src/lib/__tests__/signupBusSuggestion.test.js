import { describe, it, expect } from "vitest";
import { busesForPickup } from "../signupDay.js";

// A road running east along latitude 17.30.
const road = [{ lat: 17.3, lng: -62.80 }, { lat: 17.3, lng: -62.79 }, { lat: 17.3, lng: -62.78 }];
const far = [{ lat: 17.35, lng: -62.80 }, { lat: 17.35, lng: -62.78 }];
const buses = [
  { id: "far", name: "Bus Far", route: { id: "r2", name: "Hills", path: far } },
  { id: "near", name: "Bus Near", route: { id: "r1", name: "Coast road", path: road } },
  { id: "none", name: "Bus No Route", route: null },
];
const at = (extra = {}) => ({ pickup_lat: 17.3005, pickup_lng: -62.79, ...extra });

describe("Sign-up day suggests the bus that passes a pickup spot", () => {
  it("suggests only buses whose route drives within 200 m of the spot", () => {
    const { passing } = busesForPickup(at(), buses);
    expect(passing.map((b) => b.id)).toEqual(["near"]);
    expect(passing[0].distanceM).toBeLessThan(200);
  });
  it("says when their bus doesn't drive past, and doesn't guess without a drawn road", () => {
    expect(busesForPickup(at({ vehicle_id: "far" }), buses).currentPasses).toBe(false);
    expect(busesForPickup(at({ vehicle_id: "near" }), buses).currentPasses).toBe(true);
    expect(busesForPickup(at({ vehicle_id: "none" }), buses).currentPasses).toBeNull();
  });
  it("suggests nothing without a pickup spot", () => {
    expect(busesForPickup({}, buses)).toEqual({ passing: [], currentPasses: null });
  });
});
