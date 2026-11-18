import { describe, expect, it } from "vitest";
import { batteryFrom, batteryState } from "@/lib/tabletBattery";

const now = 1_800_000_000_000;
describe("tablet battery for the kiosk screens", () => {
  it("prefers the browser's live reading, then Android's, then the old Helper's", () => {
    const native = { at: now - 1000, battery: 64, charging: false };
    const helper = { battery: 50, charging: true };
    expect(batteryFrom({ browser: { level: 0.78, charging: true }, native, helper, now })).toEqual({ level: 78, charging: true });
    expect(batteryFrom({ native, helper, now })).toEqual({ level: 64, charging: false });
    expect(batteryFrom({ helper, now })).toEqual({ level: 50, charging: true });
  });
  it("ignores old or broken readings and keeps the number between 0 and 100", () => {
    expect(batteryFrom({ native: { at: now - 6 * 60 * 1000, battery: 64 }, now })).toBeNull();
    expect(batteryFrom({ helper: { at: now - 6 * 60 * 1000, battery: 40 }, now })).toBeNull();
    expect(batteryFrom({ browser: { level: Number.NaN }, now })).toBeNull();
    expect(batteryFrom({ native: { at: now, battery: 104.6 }, now }).level).toBe(100);
    expect(batteryFrom({ now })).toBeNull();
  });
  it("turns amber at 30%, red at 15%, and stays calm while charging", () => {
    expect(batteryState({ level: 31, charging: false })).toBe("ok");
    expect(batteryState({ level: 30, charging: false })).toBe("warn");
    expect(batteryState({ level: 15, charging: false })).toBe("low");
    expect(batteryState({ level: 5, charging: true })).toBe("charging");
    expect(batteryState(null)).toBe("");
  });
});
