import { describe, expect, it } from "vitest";
import { findClashes, formatMoney, jobVersion, jobWindow, jobTypeOf, toLocalInput, fromLocalInput } from "../jobs";
import { applyStep, withPendingSteps } from "../driverJobs";

describe("jobs", () => {
  it("reads old trips as transfers and gives each kind its usual length", () => {
    expect(jobTypeOf({})).toBe("transfer");
    expect(jobTypeOf({ job_type: "rocket" })).toBe("transfer");
    const w = jobWindow({ job_type: "hotel_tour", scheduled_time: "2026-10-20T10:00:00Z" });
    expect(w.end - w.start).toBe(4 * 3600_000);
    expect(jobWindow({ scheduled_time: "2026-10-20T10:00:00Z", end_time: "2026-10-20T10:30:00Z" }).end - Date.parse("2026-10-20T10:00:00Z")).toBe(30 * 60_000);
    expect(jobWindow({})).toBeNull();
  });

  it("finds overlapping open jobs on the same bus only", () => {
    const base = { vehicle_id: "bus", status: "scheduled" };
    const trips = [
      { ...base, id: "a", scheduled_time: "2026-10-20T10:00:00Z", end_time: "2026-10-20T11:00:00Z" },
      { ...base, id: "b", scheduled_time: "2026-10-20T11:00:00Z", end_time: "2026-10-20T12:00:00Z" },
      { ...base, id: "c", vehicle_id: "other", scheduled_time: "2026-10-20T10:30:00Z" },
      { ...base, id: "d", status: "cancelled", scheduled_time: "2026-10-20T10:30:00Z" },
    ];
    const clashes = findClashes({ id: "new", vehicle_id: "bus", scheduled_time: "2026-10-20T10:30:00Z", end_time: "2026-10-20T10:45:00Z" }, trips);
    expect(clashes.map((t) => t.id)).toEqual(["a"]);
    expect(findClashes({ ...trips[0] }, trips)).toEqual([]);
    expect(findClashes({ id: "x", scheduled_time: "2026-10-20T10:30:00Z" }, trips)).toEqual([]);
  });

  it("formats money in the job's currency", () => {
    expect(formatMoney(1234.5, "XCD")).toBe("EC$1,234.50");
    expect(formatMoney(20, "USD")).toBe("US$20.00");
    expect(formatMoney(null)).toBe("");
    expect(formatMoney("")).toBe("");
  });

  it("a job's version changes with what the driver acts on, not with its status", () => {
    const t = { pickup_name: "Airport", scheduled_time: "2026-10-20T10:00:00Z", status: "scheduled", stops: [{ name: "A" }] };
    expect(jobVersion({ ...t, status: "on_the_way" })).toBe(jobVersion(t));
    expect(jobVersion({ ...t, scheduled_time: "2026-10-20T11:00:00Z" })).not.toBe(jobVersion(t));
    expect(jobVersion({ ...t, stops: [{ name: "B" }] })).not.toBe(jobVersion(t));
  });

  it("round-trips the date-and-time box", () => {
    const iso = fromLocalInput("2026-10-20T09:30");
    expect(toLocalInput(iso)).toBe("2026-10-20T09:30");
    expect(fromLocalInput("")).toBeNull();
  });
});

describe("driver steps saved on the tablet", () => {
  const trip = { id: "t", status: "scheduled", stops: [{ name: "A" }, { name: "B" }] };

  it("shows the driver's steps before the server has them", () => {
    let t = applyStep(trip, { trip_id: "t", action: "sign_trip", mode: "pickup", signed_by: "Ann", occurred_at: "2026-10-20T10:00:00Z" });
    expect(t).toMatchObject({ status: "on_the_way", pickup_signed_by: "Ann", pickup_signed_at: "2026-10-20T10:00:00Z" });
    t = applyStep(t, { trip_id: "t", action: "reach_stop", index: 1, occurred_at: "2026-10-20T10:30:00Z" });
    expect(t.stops[1].reached_at).toBe("2026-10-20T10:30:00Z");
    expect(t.stops[0].reached_at).toBeUndefined();
    t = applyStep(t, { trip_id: "t", action: "update_trip_status", status: "arrived", occurred_at: "2026-10-20T11:00:00Z" });
    expect(t.status).toBe("arrived");
    t = applyStep(t, { trip_id: "t", action: "update_trip_status", status: "on_the_way", occurred_at: "2026-10-20T11:05:00Z" });
    expect(t.status).toBe("arrived");
    t = applyStep(t, { trip_id: "t", action: "sign_trip", mode: "dropoff", occurred_at: "2026-10-20T11:10:00Z" });
    expect(t.status).toBe("completed");
  });

  it("leaves other jobs alone", () => {
    const other = { id: "o", status: "scheduled" };
    const out = withPendingSteps([trip, other], [{ trip_id: "t", action: "update_trip_status", status: "on_the_way", occurred_at: "2026-10-20T10:00:00Z" }]);
    expect(out[0].status).toBe("on_the_way");
    expect(out[1]).toBe(other);
  });
});

describe("signing tablet", () => {
  it("asks for the pickup signature once the job has started, the drop-off once arrived", async () => {
    const { waitingSignature } = await import("../jobs");
    const jobs = [
      { id: "later", status: "scheduled", scheduled_time: "2026-10-20T15:00:00Z" },
      { id: "now", status: "on_the_way", scheduled_time: "2026-10-20T10:00:00Z" },
    ];
    expect(waitingSignature(jobs)).toMatchObject({ job: { id: "now" }, mode: "pickup" });
    expect(waitingSignature([{ ...jobs[1], pickup_signed_at: "x" }])).toBeNull();
    expect(waitingSignature([{ ...jobs[1], status: "arrived", pickup_signed_at: "x" }])).toMatchObject({ mode: "dropoff" });
    expect(waitingSignature(jobs, new Set(["now:pickup"]))).toBeNull();
    expect(waitingSignature([jobs[0]])).toBeNull();
  });
});

describe("who confirms a pickup or drop-off", () => {
  it("is the hotel front desk at the hotel end of a job, the guest elsewhere", async () => {
    const { defaultSigner } = await import("../jobs");
    expect(defaultSigner({ job_type: "airport_pickup" }, "pickup")).toBe("guest");
    expect(defaultSigner({ job_type: "airport_pickup" }, "dropoff")).toBe("reception");
    expect(defaultSigner({ job_type: "airport_dropoff" }, "pickup")).toBe("reception");
    expect(defaultSigner({ job_type: "airport_dropoff" }, "dropoff")).toBe("guest");
    expect(defaultSigner({ job_type: "hotel_tour" }, "dropoff")).toBe("reception");
    expect(defaultSigner({ job_type: "staff_run" }, "pickup")).toBe("guest");
    expect(defaultSigner({}, "dropoff")).toBe("guest");
  });
});
