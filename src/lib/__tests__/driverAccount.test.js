import { describe, expect, it } from "vitest";
import { driverKey, driverOwnsBus, internalDriverEmail, isAssignedDriver, normalizeDriverUsername, okDriverPassword, signInTarget, validDriverUsername } from "../driverAccount";

describe("the sign-in box takes an email or a driver username", () => {
  it("signs a username in with its hidden address, and an email as it is", () => {
    expect(signInTarget(" Ann_1 ")).toEqual({ email: "driver.ann_1@login.mcsweenstransport.com", driver: true });
    expect(signInTarget("ann@example.com")).toEqual({ email: "ann@example.com", driver: false });
    expect(signInTarget("a b")).toBeNull();
    expect(signInTarget("")).toBeNull();
  });
  it("only takes a username in driver mode", () => {
    expect(signInTarget("ann_1", { driverMode: true })).toEqual({ email: "driver.ann_1@login.mcsweenstransport.com", driver: true });
    expect(signInTarget("ann@example.com", { driverMode: true })).toBeNull();
  });
});

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

describe("one key per driver for buses, shifts, messages and backup GPS", () => {
  it("is the sign-in address of a username account, even when the driver also has an email", () => {
    expect(driverKey({ username: "Ann_1", email: "ann@example.com" })).toBe("driver.ann_1@login.mcsweenstransport.com");
    expect(driverKey({ email: " Bob@Example.com " })).toBe("bob@example.com");
    expect(driverKey({})).toBe("");
  });
  it("matches buses by driver record, then by key or email on older buses", () => {
    const ann = { id: "d1", company_id: "c1", username: "ann_1", email: "ann@example.com" };
    expect(driverOwnsBus({ company_id: "c1", driver_id: "d1" }, ann)).toBe(true);
    expect(driverOwnsBus({ company_id: "c1", driver_id: "d2", driver_email: "ann@example.com" }, ann)).toBe(false);
    expect(driverOwnsBus({ company_id: "c1", driver_email: "driver.ann_1@login.mcsweenstransport.com" }, ann)).toBe(true);
    expect(driverOwnsBus({ company_id: "c1", driver_email: "ann@example.com" }, ann)).toBe(true);
    expect(driverOwnsBus({ company_id: "c1", driver_email: "" }, { id: "d3", company_id: "c1" })).toBe(false);
    expect(driverOwnsBus({ company_id: "c2", driver_id: "d1" }, ann)).toBe(false);
  });
});

describe("driver phone passwords", () => {
  it("need 12 to 72 bytes with uppercase, lowercase and a number", () => {
    expect(okDriverPassword("Short1A")).toBe(false);
    expect(okDriverPassword("longenoughbutweak")).toBe(false);
    expect(okDriverPassword("GoodPassword12")).toBe(true);
    expect(okDriverPassword("Aa1" + "x".repeat(69))).toBe(true);
    expect(okDriverPassword("Aa1" + "x".repeat(70))).toBe(false);
    // 72 characters but more than 72 bytes.
    expect(okDriverPassword("Aa1" + "é".repeat(69))).toBe(false);
  });
});
