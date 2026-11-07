import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { scopedEntities, FIRST_POLL_MS, FAST_POLL_MS } from "@/lib/scopedEntities";
import { noteServerTime, clockOffsetMs, serverNow, resetServerClock } from "@/lib/serverClock";
import { freshnessOf } from "@/components/system/status";
import { fleetStatus } from "@/components/admin/AdminOverview";
import { locationIsStale } from "@/lib/busEta";
import { positionState } from "@/lib/busInfo";

// One admin device showed every bus as "Signal lost" while the others showed
// it live. Two ways that happened: its live bus list stopped for good after
// one sign-in hiccup (401), or its clock was wrong.

const signedOut = () => Object.assign(new Error("Sign in required"), { status: 401 });
const liveLists = (lists, now) => ({ data: { result: { lists, errors: {}, ...(now ? { now } : {}) } } });

beforeEach(() => resetServerClock());
afterEach(() => { vi.useRealTimers(); resetServerClock(); });

describe("live bus list after a sign-in hiccup", () => {
  it("keeps refreshing after a 401 instead of showing old positions until a reload", async () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date("2032-01-01T00:00:00Z"));
    const bus = { id: "bus", last_location_update: new Date().toISOString() };
    let calls = 0;
    const invoke = vi.fn(async () => { calls++; if (calls === 1) throw signedOut(); return liveLists({ Vehicle: [bus] }); });
    const seen = vi.fn();
    const stop = scopedEntities({ functions: { invoke } }).Vehicle.subscribe(seen);
    await vi.advanceTimersByTimeAsync(FIRST_POLL_MS);
    expect(seen).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(60_000);   // backs off, then tries again
    expect(calls).toBeGreaterThanOrEqual(2);
    expect(seen).toHaveBeenCalledWith({ type: "create", id: "bus", data: bus });
    stop();
  });

  it("stops after six 401s in a row (really signed out)", async () => {
    vi.useFakeTimers();
    const invoke = vi.fn(async () => { throw signedOut(); });
    const stop = scopedEntities({ functions: { invoke } }).Vehicle.subscribe(() => {});
    await vi.advanceTimersByTimeAsync(60 * 60_000);
    expect(invoke).toHaveBeenCalledTimes(6);
    stop();
  });

  it("still stops at once when the list is not allowed (403)", async () => {
    vi.useFakeTimers();
    const invoke = vi.fn(async () => ({ data: { result: { lists: {}, errors: { Vehicle: { status: 403 } } } } }));
    const stop = scopedEntities({ functions: { invoke } }).Vehicle.subscribe(() => {});
    await vi.advanceTimersByTimeAsync(10 * FAST_POLL_MS);
    expect(invoke).toHaveBeenCalledTimes(1);
    stop();
  });
});

describe("a device whose clock is wrong", () => {
  const now = Date.parse("2026-11-07T22:00:00Z");
  const bus = { in_service: true, tracking_active: true, current_lat: 12.05, current_lng: -61.75, status: "on_trip", last_location_update: new Date(now - 10_000).toISOString() };

  it("learns the difference from the server's time, ignoring small ones and slow replies", () => {
    noteServerTime(now + 5_000, now, now + 400);
    expect(clockOffsetMs()).toBe(0);
    noteServerTime(now - 3_600_000, now, now + 400);           // this clock is an hour fast
    expect(clockOffsetMs()).toBe(-3_600_200);
    noteServerTime(now + 3_600_000, now, now + 60_000);        // too slow to trust: unchanged
    expect(clockOffsetMs()).toBe(-3_600_200);
    noteServerTime(Number.NaN, now, now + 400);                // an older server says nothing
    expect(clockOffsetMs()).toBe(-3_600_200);
    expect(serverNow(now)).toBe(now - 3_600_200);
  });

  it("shows a live bus as live on a PC whose clock is an hour fast", () => {
    const fast = now + 3_600_000;
    expect(fleetStatus(bus, fast).label).toBe("Signal lost");   // before the server's time is known
    noteServerTime(now, fast, fast + 200);
    expect(fleetStatus(bus, fast).label).toBe("On route");
    expect(freshnessOf(bus.last_location_update, { now: fast }).state).toBe("live");
    expect(locationIsStale(bus, fast)).toBe(false);
    expect(positionState(bus, fast)).toBe("live");
  });

  it("does not call a fix from the bus 'in the future' on a phone whose clock is slow", () => {
    const slow = now - 20 * 60_000;
    expect(locationIsStale(bus, slow)).toBe(true);
    noteServerTime(now, slow, slow + 200);
    expect(locationIsStale(bus, slow)).toBe(false);
  });

  it("is learned from each live refresh", async () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date(now + 3_600_000));
    const invoke = vi.fn(async () => liveLists({ Vehicle: [] }, now));
    const stop = scopedEntities({ functions: { invoke } }).Vehicle.subscribe(() => {});
    await vi.advanceTimersByTimeAsync(FIRST_POLL_MS);
    expect(Math.abs(clockOffsetMs() + 3_600_000)).toBeLessThan(5_000);
    stop();
  });
});
