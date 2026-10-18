import { describe, it, expect } from "vitest";
import { cellularSummary, recoverySummary } from "../tabletHealthSummary";
describe("tablet status descriptions", () => {
  it("distinguishes missing information, no SIM, Wi-Fi-only and zero signal", () => {
    expect(cellularSummary({})).toBe("");
    expect(cellularSummary({ cellular_state: "absent" })).toBe("No SIM");
    expect(cellularSummary({ cellular_state: "unsupported" })).toBe("Wi-Fi-only tablet");
    expect(cellularSummary({ cellular_state: "unknown" })).toBe("SIM status unavailable");
    expect(cellularSummary({ cellular_state: "ready", cellular_carrier: "FLOW", cellular_bars: 0 })).toBe("FLOW · 0/4 signal (last reading)");
    expect(cellularSummary({ cellular_state: "ready", cellular_bars: 8 })).toBe("SIM ready · signal unavailable");
  });
  it("does not report a successful recovery when the screen still needs help", () => {
    expect(recoverySummary({})).toBe("");
    expect(recoverySummary({ recovery_available: true, recovery_state: "retry_required" })).toBe("Screen needs manual reopen");
    expect(recoverySummary({ recovery_available: true, recovery_state: "waiting" })).toBe("Restoring kiosk screen");
    expect(recoverySummary({ recovery_available: true, recovery_state: "recovered" })).toBe("Kiosk screen recovered");
  });
});
