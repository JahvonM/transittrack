import { describe, it, expect, beforeEach, vi } from "vitest";
import { alertKey, etaQuality, firstTime, journeyStage } from "../journeyStage";

const T0 = Date.UTC(2026, 10, 2, 11, 0); // 7:00 in Grenada
const min = (n) => T0 + n * 60_000;
const tap = (id, status, at) => ({ id, status, boarded_at: new Date(at).toISOString() });

describe("the passenger's journey stage", () => {
  it("follows the bus until they tap on, never from GPS alone", () => {
    expect(journeyStage({ tripKind: "not_started", now: min(0) }).stage).toBe("scheduled");
    expect(journeyStage({ tripKind: "live", arrivalKind: "on_way", now: min(0) }).stage).toBe("approaching");
    expect(journeyStage({ tripKind: "arriving", arrivalKind: "arrived", now: min(0) }).stage).toBe("at_pickup");
    // The bus at the stop, even stopped there for minutes, is not a boarding.
    expect(journeyStage({ tripKind: "arriving", arrivalKind: "arrived", now: min(10) }).stage).toBe("at_pickup");
  });
  it("boarding and exit come from their own taps", () => {
    const taps = [tap("b1", "boarded", min(0))];
    expect(journeyStage({ tripKind: "live", taps, now: min(1) }).stage).toBe("boarded");
    expect(journeyStage({ tripKind: "live", taps, now: min(10) }).stage).toBe("onboard");
    expect(journeyStage({ tripKind: "live", taps, destinationKm: 1.2, now: min(25) }).stage).toBe("near_destination");
    // Near the destination is still on board: only a tap says they got off.
    expect(journeyStage({ tripKind: "live", taps, destinationKm: 0.01, now: min(40) }).stage).toBe("near_destination");
    const off = [...taps, tap("x1", "off_board", min(30))];
    expect(journeyStage({ tripKind: "live", taps: off, now: min(31) })).toMatchObject({ stage: "exited", boardedAt: min(0) });
    expect(journeyStage({ tripKind: "live", taps: off, now: min(50) }).stage).toBe("completed");
  });
  it("after a finished ride, the next ride's wait starts fresh", () => {
    const off = [tap("b1", "boarded", min(0)), tap("x1", "off_board", min(30))];
    const later = journeyStage({ tripKind: "live", arrivalKind: "on_way", taps: off, now: min(9 * 60) });
    expect(later).toMatchObject({ stage: "approaching", afterRide: "x1" });
  });
  it("a boarding long ago with no exit no longer counts as on board", () => {
    expect(journeyStage({ tripKind: "not_started", taps: [tap("b1", "boarded", min(0))], now: min(7 * 60) }).stage).toBe("scheduled");
  });
  it("says when there is nothing to follow", () => {
    expect(journeyStage({ tripKind: "live", notTravelling: true, now: min(0) }).stage).toBe("not_travelling");
    expect(journeyStage({ tripKind: "unassigned" }).stage).toBe("unassigned");
    expect(journeyStage({ tripKind: "choose" }).stage).toBe("choose");
    expect(journeyStage({ tripKind: "problem" }).stage).toBe("out_of_service");
  });
  it("other passengers getting off does not change this passenger's journey", () => {
    // Only this passenger's own taps are ever passed in; the bus is still going.
    const mine = [tap("b1", "boarded", min(0))];
    expect(journeyStage({ tripKind: "live", taps: mine, now: min(20) }).stage).toBe("onboard");
  });
});

describe("how much to trust the time", () => {
  it("names each case", () => {
    expect(etaQuality({ eta: { mins: 5, isDriving: true }, fresh: true, tracking: true })).toBe("live");
    expect(etaQuality({ eta: { mins: 5, isLearned: true }, fresh: true, tracking: true })).toBe("live");
    expect(etaQuality({ eta: { mins: 5, estimated: true }, fresh: true, tracking: true })).toBe("approximate");
    expect(etaQuality({ eta: { mins: 5, isDriving: true }, fresh: false, tracking: true })).toBe("last_known");
    expect(etaQuality({ eta: null, fresh: null, tracking: false, scheduledTime: "2026-11-02T11:30:00Z" })).toBe("scheduled");
    expect(etaQuality({ eta: null, fresh: null, tracking: false })).toBe("unavailable");
  });
});

describe("journey alerts", () => {
  beforeEach(() => {
    const values = new Map();
    vi.stubGlobal("localStorage", { getItem: (k) => values.get(k) ?? null, setItem: (k, v) => values.set(k, String(v)), removeItem: (k) => values.delete(k), key: (i) => [...values.keys()][i], get length() { return values.size; } });
  });
  it("two rides on the same bus in one day each get their own pickup alert", () => {
    const ctx = { busId: "bus-a", date: "2026-11-02", direction: "to_work" };
    const morning = journeyStage({ tripKind: "live", arrivalKind: "nearby", now: min(0) });
    const second = journeyStage({ tripKind: "live", arrivalKind: "nearby", taps: [tap("b1", "boarded", min(5)), tap("x1", "off_board", min(30))], now: min(4 * 60) });
    const a = alertKey("u1", morning, "pickup_near", ctx), b = alertKey("u1", second, "pickup_near", ctx);
    expect(a).not.toBe(b);
    expect(firstTime(a)).toBe(true);
    expect(firstTime(a)).toBe(false);
    expect(firstTime(b)).toBe(true);
  });
  it("is per passenger, per ride, per event", () => {
    const ride = journeyStage({ taps: [tap("b1", "boarded", min(0))], now: min(1) });
    expect(alertKey("u1", ride, "boarded")).not.toBe(alertKey("u2", ride, "boarded"));
    expect(alertKey("u1", ride, "boarded")).not.toBe(alertKey("u1", ride, "near_destination"));
  });
});
