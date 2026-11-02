import { describe, expect, it } from "vitest";
import {
  DELAYED_MS, HIDE_AFTER_MS, TOKEN_KEY, baseFontPx, connection, dispatchColumns, displayAlerts, fleetCounts, fleetRows,
  forgetToken, minutesLeft, progressText, readStoredToken, retryDelay, rotation, storeToken,
} from "../officeDisplay";

const NOW = Date.parse("2026-11-01T16:00:00.000Z");
const at = (ms) => new Date(NOW + ms).toISOString();
const memory = () => { const m = new Map(); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), m }; };

describe("screen scale", () => {
  it("keeps the same layout at 1080p, 4K and with Windows scaling", () => {
    expect(baseFontPx(1920, 1080, "normal")).toBe(20);
    expect(baseFontPx(3840, 2160, "normal")).toBe(40);
    expect(baseFontPx(1280, 720, "normal")).toBe(13.3); // 1080p at 150%
    expect(baseFontPx(1920, 1080, "xlarge")).toBeGreaterThan(baseFontPx(1920, 1080, "large"));
    // Ultra-wide or odd windows fit the shorter side.
    expect(baseFontPx(3440, 1080, "normal")).toBe(20);
    expect(baseFontPx(100, 100, "normal")).toBe(13);
  });
});

describe("connection state", () => {
  it("says how current the screen is and hides old content", () => {
    expect(connection({ lastOkAt: 0, now: NOW }).state).toBe("connecting");
    expect(connection({ lastOkAt: 0, failures: 2, now: NOW }).state).toBe("offline");
    expect(connection({ lastOkAt: NOW - 10_000, now: NOW }).state).toBe("live");
    expect(connection({ lastOkAt: NOW - DELAYED_MS - 1, now: NOW }).state).toBe("delayed");
    expect(connection({ lastOkAt: NOW - DELAYED_MS - 1, failures: 1, now: NOW }).state).toBe("offline");
    expect(connection({ lastOkAt: NOW - 5_000, now: NOW, online: false }).state).toBe("offline");
    expect(connection({ lastOkAt: NOW - HIDE_AFTER_MS - 1, now: NOW }).state).toBe("hidden");
  });
  it("backs off retries without giving up", () => {
    expect([1, 2, 3, 4, 5, 9].map(retryDelay)).toEqual([5_000, 10_000, 20_000, 30_000, 60_000, 60_000]);
  });
});

describe("rotation", () => {
  it("rotates only approved non-camera layouts", () => {
    expect(rotation({ layout: "fleet", rotate: true, rotate_layouts: ["fleet", "dispatch"] })).toEqual(["fleet", "dispatch"]);
    expect(rotation({ layout: "cameras", rotate: true, rotate_layouts: ["fleet", "dispatch"] })).toEqual(["cameras"]);
    expect(rotation({ layout: "dispatch", rotate: true, rotate_layouts: ["cameras", "fleet"] })).toEqual(["dispatch"]);
    expect(rotation({ layout: "maintenance", rotate: false, rotate_layouts: ["fleet", "dispatch"] })).toEqual(["maintenance"]);
    expect(rotation(null)).toEqual(["fleet"]);
  });
});

describe("stored credential", () => {
  it("keeps only a well-formed token and forgets it on request", () => {
    const s = memory();
    expect(readStoredToken(s)).toBeNull();
    storeToken(s, "a".repeat(64));
    expect(readStoredToken(s)).toBe("a".repeat(64));
    s.setItem(TOKEN_KEY, JSON.stringify({ token: "not-a-token" }));
    expect(readStoredToken(s)).toBeNull();
    s.setItem(TOKEN_KEY, "{bad json");
    expect(readStoredToken(s)).toBeNull();
    storeToken(s, "b".repeat(64));
    forgetToken(s);
    expect(readStoredToken(s)).toBeNull();
    expect(readStoredToken(null)).toBeNull();
  });
});

const feed = {
  vehicles: [
    { id: "a", name: "Bus 2", status: "on_trip", in_service: true, tracking_active: true, last_location_update: at(-30_000), current_lat: 12, current_lng: -61 },
    { id: "b", name: "Bus 10", status: "idle", in_service: true, tracking_active: false, last_location_update: at(-20 * 60_000), current_lat: 12, current_lng: -61 },
    { id: "c", name: "Bus 1", status: "offline", in_service: false },
    { id: "d", name: "Bus 3", status: "emergency", in_service: true, tracking_active: true, last_location_update: at(-10_000), current_lat: 12, current_lng: -61 },
  ],
  tablets: [
    { id: "t1", vehicle_id: "a", kiosk_type: "bus_boarding", paired: true, status: "active", last_seen: at(-60_000), helper_health: {} },
    { id: "t2", vehicle_id: "b", kiosk_type: "driver", paired: true, status: "active", last_seen: at(-40 * 60_000), helper_health: { battery: 12, charging: false } },
  ],
  on_board: { a: 2, b: 5 },
  shifts: [{ vehicle_id: "b", started_at: at(-3600_000), driver_name: "Dana" }],
  jobs: [
    { id: "j1", status: "scheduled", scheduled_time: at(-20 * 60_000), past_time_not_started: true },
    { id: "j2", status: "on_the_way", scheduled_time: at(-5 * 60_000), vehicle_id: "a", kind: "Transfer", dropoff_name: "Hotel" },
    { id: "j3", status: "scheduled", scheduled_time: at(60 * 60_000), past_time_not_started: false },
    { id: "j4", status: "completed", scheduled_time: at(-3 * 3600_000) },
    { id: "j5", status: "arrived", scheduled_time: at(-2 * 60_000) },
  ],
};

describe("fleet overview", () => {
  it("orders buses SOS first, then live, then last known, and counts only trustworthy riders", () => {
    const rows = fleetRows(feed, NOW);
    expect(rows.map((r) => r.id)).toEqual(["d", "a", "b", "c"]);
    const a = rows.find((r) => r.id === "a");
    expect(a.onBoard).toBe(2); // boarding tablet reporting
    expect(a.job).toEqual({ kind: "Transfer", to: "Hotel", status: "on_the_way" });
    const b = rows.find((r) => r.id === "b");
    expect(b.onBoard).toBeNull(); // no boarding tablet reporting: the server's 5 isn't shown
    expect(b.tablet.ok).toBe(false);
    expect(b.driverName).toBe("Dana");
  });
  it("raises only alerts the screen has data for", () => {
    const keys = displayAlerts(feed, NOW).map((a) => a.key);
    expect(keys).toContain("sos:d");
    expect(keys).toContain("gps:b");
    expect(keys).toContain("off:t2");
    expect(keys).toContain("bat:t2");
    expect(keys.some((k) => /^(lock|queue|faults|unprotected|requests)/.test(k))).toBe(false);
  });
  it("counts what it can see", () => {
    expect(fleetCounts(feed, NOW)).toEqual({ live: 2, lastKnown: 1, noLocation: 1, underWay: 2, pastTime: 1, outOfService: 1 });
    expect(fleetCounts(null, NOW).live).toBe(0);
  });
});

describe("dispatch board", () => {
  it("splits jobs by facts", () => {
    const c = dispatchColumns(feed.jobs, NOW);
    expect(c.pastTime.map((j) => j.id)).toEqual(["j1"]);
    expect(c.underWay.map((j) => j.id)).toEqual(["j2", "j5"]);
    expect(c.next.map((j) => j.id)).toEqual(["j3"]);
    expect(c.done).toBe(1);
  });
  it("describes progress from confirmations only", () => {
    expect(progressText({ status: "on_the_way" })).toBe("Driving to pickup");
    expect(progressText({ status: "arrived" })).toBe("Waiting at pickup");
    expect(progressText({ status: "on_the_way", pickup_confirmed: true })).toBe("Picked up, heading to drop-off");
    expect(progressText({ status: "completed", dropoff_confirmed: true })).toBe("Drop-off confirmed");
    expect(progressText({ status: "scheduled" })).toBe("");
  });
  it("counts camera minutes down to zero", () => {
    expect(minutesLeft(at(9.5 * 60_000), NOW)).toBe(10);
    expect(minutesLeft(at(-1), NOW)).toBe(0);
    expect(minutesLeft(null, NOW)).toBe(0);
  });
});
