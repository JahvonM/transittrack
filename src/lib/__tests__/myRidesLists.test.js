import { describe, it, expect } from "vitest";
import { upcomingAndCancelled } from "@/lib/myRides";

const now = Date.parse("2026-11-02T12:00:00Z"); // 8:00 AM in Grenada, Mon 2 Nov
const day = (n) => new Date(now + n * 86_400_000).toISOString().slice(0, 10);

describe("My rides: coming up and cancelled", () => {
  it("lists booked rides and confirmed changes from today on, soonest first", () => {
    const { upcoming } = upcomingAndCancelled({
      now,
      trips: [
        { id: "t2", status: "scheduled", scheduled_time: "2026-11-04T11:00:00Z", pickup_name: "Grand Anse", dropoff_name: "Airport" },
        { id: "t1", status: "on_the_way", scheduled_time: "2026-11-02T13:00:00Z", pickup_name: "Grand Anse", dropoff_name: "Town" },
        { id: "old", status: "scheduled", scheduled_time: "2026-10-30T11:00:00Z", pickup_name: "Grand Anse" },
        { id: "done", status: "completed", scheduled_time: "2026-11-05T11:00:00Z" },
      ],
      cases: [
        { id: "c1", kind: "time_change", status: "confirmed", requested_date: day(1), requested_time: "07:15", reference: "TT-AAAAAA" },
        { id: "c2", kind: "time_change", status: "pending", requested_date: day(1), reference: "TT-BBBBBB" },
      ],
    });
    expect(upcoming.map((u) => u.key)).toEqual(["trip:t1", "case:c1", "trip:t2"]);
    expect(upcoming[1]).toMatchObject({ title: "New time 07:15", note: "Confirmed", ref: "TT-AAAAAA" });
    expect(upcoming[0].note).toBe("Booked · on the way");
  });

  it("lists cancellations: asked for, confirmed, refused, and rides the office cancelled", () => {
    const { cancelled, upcoming } = upcomingAndCancelled({
      now,
      cases: [
        { id: "a", kind: "cancel_ride", status: "pending", requested_date: day(2), reference: "TT-CCCCCC" },
        { id: "b", kind: "cancel_ride", status: "confirmed", requested_date: day(1), reference: "TT-DDDDDD" },
        { id: "c", kind: "cancel_ride", status: "rejected", requested_date: day(3), reference: "TT-EEEEEE" },
        { id: "old", kind: "cancel_ride", status: "confirmed", requested_date: day(-40), reference: "TT-FFFFFF" },
      ],
      cancelledTrips: [{ id: "x", status: "cancelled", scheduled_time: "2026-11-03T11:00:00Z", pickup_name: "Grand Anse", dropoff_name: "Airport" }],
    });
    expect(upcoming).toEqual([]);
    expect(cancelled.map((c) => [c.key, c.title])).toEqual([
      ["case:c", "Cancellation not possible: your ride stays booked"],
      ["case:a", "Cancellation asked for"],
      ["trip:x", "Grand Anse to Airport"],
      ["case:b", "Ride cancelled at your request"],
    ]);
  });
});
