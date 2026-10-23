import { describe, expect, it } from "vitest";
import { unroutedPickupEstimate } from "../busEta";

describe("passenger ETA when route geometry has not loaded", () => {
  const bus = { current_lat: 12.10, current_lng: -61.70 };
  it("estimates a valid future passenger's saved address", () => {
    const result = unroutedPickupEstimate(bus, { lat: 12.15, lng: -61.72 });
    expect(result?.mins).toBeGreaterThan(0);
    expect(result?.estimated).toBe(true);
    expect(result?.source).toBe("unrouted");
  });
  it("never invents an ETA for missing or malformed coordinates", () => {
    expect(unroutedPickupEstimate(bus, null)).toBeNull();
    expect(unroutedPickupEstimate(bus, { lat: "not-a-number", lng: -61.7 })).toBeNull();
    expect(unroutedPickupEstimate({ current_lat: 123, current_lng: -61.7 }, { lat: 12.1, lng: -61.7 })).toBeNull();
  });
  it("handles stopped vehicles without dividing by live speed", () => {
    expect(unroutedPickupEstimate({ ...bus, speed: 0 }, { lat: 12.11, lng: -61.7 })?.mins).toBeGreaterThan(0);
  });
});
