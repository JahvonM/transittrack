import { describe, it, expect } from "vitest";
import { grenadaDay, grenadaToday } from "@/lib/grenadaDay";

// Records dated "today" use Grenada's date, not London's: at 8:30 pm in
// Grenada it is already the next day in UTC.
describe("Grenada day", () => {
  it("is still today at 8:30 pm in Grenada, when UTC has moved on", () => {
    const evening = new Date("2026-11-25T00:30:00Z"); // 8:30 pm on the 24th in Grenada
    expect(evening.toISOString().slice(0, 10)).toBe("2026-11-25");
    expect(grenadaToday(evening)).toBe("2026-11-24");
    expect(grenadaDay("2026-11-25T00:30:00Z")).toBe("2026-11-24");
  });
  it("turns over at midnight in Grenada", () => {
    expect(grenadaToday(new Date("2026-11-25T03:59:00Z"))).toBe("2026-11-24");
    expect(grenadaToday(new Date("2026-11-25T04:00:00Z"))).toBe("2026-11-25");
  });
  it("gives nothing for something that isn't a time", () => {
    expect(grenadaDay("not a date")).toBe("");
    expect(grenadaDay(undefined)).toBe("");
  });
});
