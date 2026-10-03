import { describe, expect, it } from "vitest";
import { googleMapsDirectionsUrl } from "@/lib/navLinks";
import { computeOccupancyByVehicle } from "@/lib/occupancy";
import { formatEta, haversineKm } from "@/lib/geo";
import { formatUid, normalizeUid } from "@/lib/cardReader";
import { layoutZones, zoneFor } from "@/lib/busZones";

describe("googleMapsDirectionsUrl", () => {
  it("goes to the last stop through the ones before it", () => {
    const url = new URL(googleMapsDirectionsUrl([{ lat: 1, lng: 2 }, { lat: 3, lng: 4 }, { lat: 5, lng: 6 }]));
    expect(url.searchParams.get("destination")).toBe("5,6");
    expect(url.searchParams.get("waypoints")).toBe("1,2|3,4");
    expect(url.searchParams.get("dir_action")).toBe("navigate");
  });
  it("keeps to Google's limit of 9 stops in between", () => {
    const stops = Array.from({ length: 15 }, (_, i) => ({ lat: i, lng: i }));
    const url = new URL(googleMapsDirectionsUrl(stops));
    expect(url.searchParams.get("waypoints").split("|")).toHaveLength(9);
    expect(url.searchParams.get("destination")).toBe("14,14");
  });
  it("needs at least one stop with a position", () => {
    expect(googleMapsDirectionsUrl([{ name: "No GPS" }])).toBeNull();
  });
});

describe("computeOccupancyByVehicle", () => {
  it("counts people whose latest tap on that bus was boarding", () => {
    const t = (min) => new Date(Date.UTC(2026, 0, 1, 8, min)).toISOString();
    const counts = computeOccupancyByVehicle([
      { vehicle_id: "a", card_tag: "1", status: "boarded", created_date: t(0) },
      { vehicle_id: "a", card_tag: "1", status: "off_board", created_date: t(5) },
      { vehicle_id: "a", card_tag: "2", status: "boarded", created_date: t(1) },
      { vehicle_id: "b", staff_name: "Ana", status: "boarded", created_date: t(2) },
      { status: "boarded", created_date: t(3) },
    ]);
    expect(counts).toEqual({ a: 1, b: 1 });
  });
});

describe("geo", () => {
  it("measures distance", () => {
    expect(haversineKm(0, 0, 0, 1)).toBeCloseTo(111.19, 1);
  });
  it("formats arrival times", () => {
    expect(formatEta(null)).toBe("—");
    expect(formatEta(0.5)).toBe("Arriving");
    expect(formatEta(12.4)).toBe("12 min");
    expect(formatEta(95)).toBe("1h 35m");
  });
});

describe("card ids", () => {
  it("reads any reader format the same way", () => {
    expect(normalizeUid("04:a1-b2 c3")).toBe("04A1B2C3");
    expect(formatUid("04a1b2c3")).toBe("04:A1:B2:C3");
  });
});

describe("x-ray parts", () => {
  it("puts items on the right part of the bus", () => {
    expect(zoneFor({ item_name: "Brake lights" })).toBe("lights_rear");
    expect(zoneFor({ item_name: "Rear door seal" })).toBe("rear_door");
    expect(zoneFor({ item_name: "Wheelchair ramp" }, "", "city_rear")).toBe("wheelchair");
  });
  it("uses Whole bus for parts a layout doesn't have", () => {
    expect(layoutZones("front_engine").some((z) => z.id === "wheelchair")).toBe(false);
    expect(zoneFor({ item_name: "Wheelchair ramp" }, "", "front_engine")).toBe("general");
  });
});
