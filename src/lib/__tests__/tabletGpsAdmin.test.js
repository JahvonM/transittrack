import { describe, expect, it } from "vitest";
import { GPS_CHOICES, adminGpsChosen, gpsReport } from "@/lib/tabletGpsAdmin";

const now = Date.parse("2026-11-18T12:00:00Z");
const report = (h, gps_source) => gpsReport({ gps_source, helper_health: { reported_at: "2026-11-18T11:59:00Z", ...h } }, now);

describe("Admin GPS switch for driver tablets", () => {
  it("offers the module, the tablet's own GPS, or leaving it to the tablet", () => {
    expect(GPS_CHOICES.map(c => c.value)).toEqual(["usb", "tablet", null]);
    expect(adminGpsChosen({ gps_source: "usb" })).toBe("usb");
    expect(adminGpsChosen({ gps_source: "satellite" })).toBeNull();
  });
  it("says which GPS the tablet is using now", () => {
    expect(report({ gps_source: "usb", gps: "Fix (8 sats)" }).text).toBe("Using the GPS module · Fix (8 sats)");
    expect(report({ gps_source: "tablet" }).text).toBe("Using the tablet's own GPS");
    expect(report({}).text).toMatch(/doesn't report its GPS/);
    expect(gpsReport({ helper_health: { reported_at: "2026-11-18T11:00:00Z", gps_source: "usb" } }, now).text).toMatch(/hasn't reported/);
  });
  it("shows the switch is on its way until the tablet has changed over", () => {
    expect(report({ gps_source: "usb" }, "tablet")).toMatchObject({ chosen: "tablet", using: "usb", waiting: true });
    expect(report({ gps_source: "usb" }, "tablet").text).toMatch(/Switching/);
    expect(report({ gps_source: "tablet" }, "tablet").waiting).toBe(false);
    expect(report({ gps_source: "usb" }, null).waiting).toBe(false);
  });
});
