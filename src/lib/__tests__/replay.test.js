import { describe, expect, it } from "vitest";
import { buildTimeline, cleanPings, distM, findStops, GAP_CAP_MS, positionAt, tripKm, vtForTime } from "@/lib/replay";

const base = Date.parse("2026-10-02T08:00:00Z");
const at = (min) => new Date(base + min * 60000).toISOString();
// Driving north one record a minute (~550 m apart).
const drive = (n, from = 0, lat0 = 18) => Array.from({ length: n }, (_, i) => ({ lat: lat0 + i * 0.005, lng: -76.8, recorded_at: at(from + i), speed: 9 }));

describe("cleanPings", () => {
  it("sorts by time and drops bad points, duplicates and GPS jumps", () => {
    const pings = [
      ...drive(3).reverse(),
      { lat: 0, lng: 0, recorded_at: at(3) },
      { lat: NaN, lng: -76.8, recorded_at: at(3) },
      { lat: 25, lng: 10, recorded_at: at(4) }, // thousands of km away a minute later
      { lat: 18.01, lng: -76.8, recorded_at: at(2) }, // same moment as an existing record
      { lat: 18.015, lng: -76.8, recorded_at: at(5) },
    ];
    const out = cleanPings(pings);
    expect(out.map((p) => p.lat)).toEqual([18, 18.005, 18.01, 18.015]);
    expect(out.every((p, i) => i === 0 || p.t > out[i - 1].t)).toBe(true);
  });

  it("handles nothing", () => {
    expect(cleanPings(undefined)).toEqual([]);
    expect(buildTimeline([], null)).toBeNull();
  });
});

describe("buildTimeline / positionAt", () => {
  const pings = cleanPings(drive(10));
  const line = Array.from({ length: 91 }, (_, k) => [-76.8, 18 + k * 0.0005]);
  const tl = buildTimeline(pings, line);

  it("pins every record to the road line, never going backwards", () => {
    expect(tl.v).toEqual([0, 10, 20, 30, 40, 50, 60, 70, 80, 90]);
  });

  it("moves the bus smoothly between records", () => {
    const halfway = positionAt(tl, 30000); // 30 s into the first minute
    expect(halfway.lat).toBeCloseTo(18.0025, 5);
    expect(halfway.time).toBe(base + 30000);
    expect(halfway.heading).toBeCloseTo(0, 0); // heading north
    expect(halfway.kmh).toBeGreaterThan(30);
    expect(halfway.traveled.at(-1)).toEqual([halfway.lng, halfway.lat]);
  });

  it("only ever moves forward as time passes", () => {
    let prev = -Infinity;
    for (let x = 0; x <= tl.total; x += 5000) {
      const { lat } = positionAt(tl, x);
      expect(lat).toBeGreaterThanOrEqual(prev - 1e-12);
      prev = lat;
    }
  });

  it("clamps outside the day", () => {
    expect(positionAt(tl, -5000).lat).toBe(18);
    expect(positionAt(tl, tl.total * 2).lat).toBeCloseTo(18.045, 6);
  });

  it("measures the trip", () => {
    expect(tripKm(tl)).toBeCloseTo(distM([-76.8, 18], [-76.8, 18.045]) / 1000, 3);
  });

  it("works without a road line", () => {
    const raw = buildTimeline(pings, null);
    expect(raw.line).toHaveLength(10);
    expect(positionAt(raw, 60000).lat).toBeCloseTo(18.005, 6);
  });
});

describe("long gaps", () => {
  const pings = cleanPings([...drive(2), ...drive(2, 90, 18.01)]); // parked 88 minutes
  const tl = buildTimeline(pings, null);

  it("plays a long stop in a couple of minutes", () => {
    expect(tl.total).toBe(60000 + GAP_CAP_MS + 60000);
  });

  it("still shows the real clock time", () => {
    const mid = positionAt(tl, 60000 + GAP_CAP_MS / 2);
    expect(mid.time).toBe(base + 60000 + 44.5 * 60000); // halfway through the 89-minute stop
    expect(vtForTime(tl, base + 90 * 60000)).toBe(60000 + GAP_CAP_MS);
  });
});

describe("findStops", () => {
  it("finds places the bus stood still for 5+ minutes", () => {
    const parked = Array.from({ length: 8 }, (_, i) => ({ lat: 18.02, lng: -76.8, t: base + (10 + i) * 60000 }));
    const moving = drive(3).map((p, i) => ({ ...p, t: base + i * 60000 }));
    const after = [{ lat: 18.05, lng: -76.8, t: base + 20 * 60000 }];
    const stops = findStops([...moving, ...parked, ...after]);
    expect(stops).toHaveLength(1);
    expect(stops[0]).toMatchObject({ lat: 18.02, from: base + 10 * 60000, to: base + 17 * 60000 });
  });

  it("ignores short stops", () => {
    const parked = Array.from({ length: 3 }, (_, i) => ({ lat: 18.02, lng: -76.8, t: base + i * 60000 }));
    expect(findStops(parked)).toEqual([]);
  });
});
