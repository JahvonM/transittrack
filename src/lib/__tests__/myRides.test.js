import { describe, it, expect, vi, afterEach } from "vitest";
import { groupRides, todayRides } from "../myRides";

const t = (h, m = 0, day = 28) => new Date(Date.UTC(2026, 9, day, h, m)).toISOString();
const ev = (id, status, when, bus = "Bus 1") => ({ id, status, boarded_at: when, vehicle_name: bus });

describe("my rides from boarding and exit taps", () => {
  afterEach(() => vi.useRealTimers());

  it("pairs each boarding with its exit, newest first", () => {
    vi.useFakeTimers({ now: Date.parse(t(23)) });
    const rides = groupRides([ev("a", "boarded", t(7)), ev("b", "off_board", t(7, 40)), ev("c", "boarded", t(17)), ev("d", "off_board", t(17, 35))]);
    expect(rides.map((r) => [r.state, new Date(r.boardedAt).getUTCHours()])).toEqual([["completed", 17], ["completed", 7]]);
  });

  it("counts a repeated tap as the same ride, not a second one", () => {
    vi.useFakeTimers({ now: Date.parse(t(23)) });
    const rides = groupRides([ev("a", "boarded", t(7)), ev("a2", "boarded", t(7, 1)), ev("b", "off_board", t(7, 40))]);
    expect(rides).toHaveLength(1);
    expect(rides[0]).toMatchObject({ state: "completed", repeats: 1 });
  });

  it("orders by when the tap happened, so offline taps that arrive late still pair up", () => {
    vi.useFakeTimers({ now: Date.parse(t(23)) });
    // The exit reached the server first; the boarding was saved offline.
    const rides = groupRides([ev("x", "off_board", t(8, 10)), ev("y", "boarded", t(7, 50))]);
    expect(rides).toEqual([expect.objectContaining({ state: "completed" })]);
  });

  it("keeps two trips on the same bus on the same day apart", () => {
    vi.useFakeTimers({ now: Date.parse(t(23)) });
    const rides = groupRides([ev("1", "boarded", t(7)), ev("2", "off_board", t(7, 30)), ev("3", "boarded", t(12)), ev("4", "off_board", t(12, 20))]);
    expect(rides).toHaveLength(2);
    expect(rides.every((r) => r.state === "completed")).toBe(true);
  });

  it("says plainly when an exit or a boarding tap is missing", () => {
    vi.useFakeTimers({ now: Date.parse(t(23)) });
    const rides = groupRides([ev("1", "off_board", t(8)), ev("2", "boarded", t(9))]);
    expect(rides.map((r) => r.state).sort()).toEqual(["exit_only", "no_exit"]);
  });

  it("shows a ride still under way as on board", () => {
    vi.useFakeTimers({ now: Date.parse(t(7, 20)) });
    expect(groupRides([ev("1", "boarded", t(7))])[0].state).toBe("open");
  });

  it("keeps rides on different buses separate", () => {
    vi.useFakeTimers({ now: Date.parse(t(23)) });
    const rides = groupRides([ev("1", "boarded", t(7), "Bus 1"), ev("2", "off_board", t(7, 20), "Bus 2")]);
    expect(rides.map((r) => r.state).sort()).toEqual(["exit_only", "no_exit"]);
  });
});

describe("today's regular rides", () => {
  it("follows the company schedule with no booking needed", () => {
    const [toWork, back] = todayRides({ bus: { name: "Bus 1" }, pickup: "Grand Anse", destination: "Main office", returning: false });
    expect(toWork).toMatchObject({ label: "To work", from: "Grand Anse", to: "Main office", state: "scheduled", current: true });
    expect(back).toMatchObject({ label: "Return", from: "Main office", to: "Grand Anse", state: "scheduled", current: false });
  });
  it("shows not travelling on both rides and running late on the way in", () => {
    expect(todayRides({ skip: true }).map((r) => r.state)).toEqual(["not_travelling", "not_travelling"]);
    expect(todayRides({ late: true, lateUntil: "x" }).map((r) => r.state)).toEqual(["running_late", "scheduled"]);
  });
});
