import { describe, expect, it } from "vitest";
import { internalDriverEmail, isAssignedDriver, normalizeDriverUsername, validDriverUsername } from "../driverAccount";

describe("driver phone identifiers", () => {
  it("normalizes case and surrounding whitespace", () => {
    expect(normalizeDriverUsername(" Driver.One ")).toBe("driver.one");
    expect(internalDriverEmail(" DRIVER.ONE ")).toBe("driver.driver.one@login.mcsweenstransport.com");
  });
  it("rejects unsafe usernames", () => {
    expect(validDriverUsername("ab")).toBe(false);
    expect(validDriverUsername("invalid name")).toBe(false);
    expect(validDriverUsername("john_123")).toBe(true);
  });
  it("assigns vehicles by stable Driver ID, not by email", () => {
    const bus = { driver_id: "d1", company_id: "c1" };
    expect(isAssignedDriver(bus, { id: "d1", company_id: "c1" })).toBe(true);
    expect(isAssignedDriver(bus, { id: "d2", company_id: "c1" })).toBe(false);
    expect(isAssignedDriver(bus, { id: "d1", company_id: "c2" })).toBe(false);
  });
});
