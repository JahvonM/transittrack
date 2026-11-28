import { describe, it, expect } from "vitest";
import { todaySummary } from "@/lib/companyPortal";

// The line under the company overview's "Your buses today" headline.
describe("todaySummary", () => {
  it("counts the buses on the map, today's jobs and requests waiting", () => {
    expect(todaySummary({ buses: 2, onMap: 1, jobs: 2, waiting: 1 })).toBe("1 of 2 buses is on the map now. 2 jobs today. 1 request is waiting for an answer.");
    expect(todaySummary({ buses: 3, onMap: 0, jobs: 1, waiting: 4 })).toBe("0 of 3 buses are on the map now. 1 job today. 4 requests are waiting for an answer.");
  });
  it("says so when there is nothing, and leaves out requests still loading", () => {
    expect(todaySummary({ buses: 0, onMap: 0, jobs: 0, waiting: 0 })).toBe("No buses yet. No jobs today.");
    expect(todaySummary({ buses: 1, onMap: 1, jobs: 0, waiting: null })).toBe("1 of 1 bus is on the map now. No jobs today.");
  });
});
