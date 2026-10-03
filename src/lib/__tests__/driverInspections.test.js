import { describe, expect, it } from "vitest";
import { currentSlot, dueAtTime, dueNow, nextSlot, statusFor, timesOf } from "@/lib/driverInspections";

const day = (h, m = 0) => new Date(2026, 9, 5, h, m); // Monday 5 Oct 2026, local time
const timed = { id: "t1", driver_trigger: "at_times", driver_times: ["13:30", "bad", "7:00"] };

describe("set times", () => {
  it("keeps valid times, earliest first", () => {
    expect(timesOf(timed)).toEqual(["7:00", "13:30"]);
  });

  it("knows the current and next round", () => {
    expect(currentSlot(timed, day(6, 59))).toBeNull();
    expect(currentSlot(timed, day(7, 0)).time).toBe("7:00");
    expect(currentSlot(timed, day(15)).time).toBe("13:30");
    expect(nextSlot(timed, day(8))).toBe("13:30");
    expect(nextSlot(timed, day(14))).toBeNull();
  });

  it("is due again at each time until done after that time", () => {
    const doneAt8 = [{ template_id: "t1", created_date: day(8).toISOString() }];
    expect(dueAtTime(timed, [], {}, day(7, 5))?.time).toBe("7:00");
    expect(dueAtTime(timed, doneAt8, {}, day(9))).toBeNull();
    expect(dueAtTime(timed, doneAt8, {}, day(13, 31))?.time).toBe("13:30");
    expect(statusFor(timed, doneAt8, {}, day(9))).toBe("done");
  });

  it("only on the chosen days", () => {
    const weekends = { ...timed, driver_days: [0, 6] };
    expect(dueAtTime(weekends, [], {}, day(8))).toBeNull();
  });

  it("counts a check finished offline on the tablet", () => {
    expect(dueAtTime(timed, [], { t1: day(7, 10).toISOString() }, day(8))).toBeNull();
  });
});

describe("dueNow", () => {
  it("lists each due inspection once", () => {
    const daily = { id: "d1", driver_trigger: "start_of_day" };
    const sent = { id: "s1", driver_trigger: "on_demand", driver_sent_at: day(6).toISOString() };
    const ids = dueNow([daily, sent, timed, { ...daily }], [], {}, day(8)).map((t) => t.id);
    expect(ids).toEqual(["s1", "t1", "d1"]);
  });
});
