import { describe, it, expect } from "vitest";
import { etaText, roughMinutes } from "../rideEta.js";
import { describeRide } from "../visitorTrack.js";

describe("the guest's arrival time", () => {
  it("says the minutes plainly and drops numbers that can't be right", () => {
    expect(etaText(0.4)).toBe("Less than a minute away");
    expect(etaText(1.2)).toBe("About 1 minute away");
    expect(etaText(12.4)).toBe("About 12 minutes away");
    expect(etaText(65)).toBe("About 1 hour 5 min away");
    expect(etaText(120)).toBe("About 2 hours away");
    for (const bad of [NaN, -3, 500, null, undefined]) expect(etaText(bad)).toBe("");
  });
  it("estimates by distance when the map service can't answer", () => {
    // About 6 km apart in a straight line: around 16 minutes with bends at town speed.
    const m = roughMinutes({ lat: 12.0042, lng: -61.7861 }, { lat: 12.0526, lng: -61.7516 });
    expect(m).toBeGreaterThan(12); expect(m).toBeLessThan(22);
    expect(roughMinutes({ lat: 12 }, { lat: 12, lng: -61 })).toBeNull();
  });
  it("headlines follow the ride: at the pickup, to the drop-off, arrived at the drop-off", () => {
    expect(describeRide({ status: "on_the_way", stage: "at_pickup" }).title).toBe("Your ride is at your pickup");
    expect(describeRide({ status: "on_the_way", stage: "to_dropoff", location_status: "live" }).title).toBe("On the way to your drop-off");
    expect(describeRide({ status: "arrived", stage: "at_dropoff" })).toMatchObject({ title: "You've arrived", note: "Your ride is at your drop-off." });
  });
});
