import { describe, expect, it } from "vitest";
import fs from "node:fs";
import {
  bucketOf, buildStats, learnedEta, legKey, locateOnRoute, routeCoverage, stopKey, stopPassages, summarize, tripSamples, typicalSeconds,
} from "@/lib/travelTimes";

// Four stops ~1.1 km apart going north (Grenada).
const stops = [0, 1, 2, 3].map((i) => ({ name: `Stop ${i + 1}`, lat: 12.0 + i * 0.01, lng: -61.75 }));
// 2026-10-05 is a Monday. 11:00 UTC = 7:00 in Grenada (UTC-4).
const T0 = Date.UTC(2026, 9, 5, 11, 0, 0);

// A bus driving the route: `legMin` minutes per leg, waiting `waitMin` at
// each middle stop, logging a ping every minute.
function drive({ start = T0, legMin = [4, 6, 3], waitMin = 1 } = {}) {
  const pings = [];
  let t = start;
  const push = (lat) => pings.push({ lat, lng: -61.75, recorded_at: new Date(t).toISOString() });
  for (let leg = 0; leg < 3; leg++) {
    const a = stops[leg].lat, b = stops[leg + 1].lat;
    for (let m = 0; m < legMin[leg]; m++) { push(a + ((b - a) * m) / legMin[leg]); t += 60000; }
    if (leg < 2) for (let w = 0; w < waitMin; w++) { push(b); t += 60000; }
  }
  push(stops[3].lat);
  return pings;
}

describe("learning from GPS history", () => {
  it("finds when the bus passed each stop, even between pings", () => {
    const p = stopPassages(drive(), stops);
    expect(p.map((x) => x.stop)).toEqual([0, 1, 2, 3]);
    expect(p[1].depart - p[1].arrive).toBeGreaterThanOrEqual(60000); // waited a minute
  });

  it("measures each leg and each wait", () => {
    const { legs, dwells } = tripSamples(stopPassages(drive(), stops), stops);
    expect(legs.map((l) => l.key)).toEqual([legKey(stops[0], stops[1]), legKey(stops[1], stops[2]), legKey(stops[2], stops[3])]);
    // Leg times are close to what was driven (the stop circle trims a little).
    legs.forEach((l, i) => expect(Math.abs(l.seconds - [4, 6, 3][i] * 60)).toBeLessThan(60));
    expect(dwells.length).toBe(2);
  });

  it("ignores breaks in the trip and stops visited out of order", () => {
    const pings = drive();
    // A 2-hour gap after the first stop: no leg is counted across it.
    const gapped = pings.map((p, i) => (i > 3 ? { ...p, recorded_at: new Date(Date.parse(p.recorded_at) + 2 * 3600e3).toISOString() } : p));
    const { legs } = tripSamples(stopPassages(gapped, stops), stops);
    expect(legs.some((l) => l.key === legKey(stops[0], stops[1]))).toBe(false);
    // Driving the route backwards teaches nothing.
    const backwards = drive().reverse().map((p, i) => ({ ...p, recorded_at: new Date(T0 + i * 60000).toISOString() }));
    expect(tripSamples(stopPassages(backwards, stops), stops).legs).toEqual([]);
  });

  it("groups by Grenada time and kind of day", () => {
    expect(bucketOf(T0)).toBe("wd07");
    expect(bucketOf(Date.UTC(2026, 9, 10, 22, 30))).toBe("sa18"); // Saturday 6:30 pm
    expect(bucketOf(Date.UTC(2026, 9, 12, 3, 0))).toBe("su23"); // still Sunday 11 pm in Grenada
  });

  it("keeps the typical time and the slow end (80%)", () => {
    expect(summarize([300, 240, 360, 900, 270])).toEqual({ n: 5, median: 300, p80: 468 });
    expect(summarize([])).toBeNull();
  });

  it("builds per-hour stats from many trips", () => {
    const all = { legs: [], dwells: [] };
    for (let d = 0; d < 5; d++) {
      const s = tripSamples(stopPassages(drive({ start: T0 + d * 86400e3 }), stops), stops); // Mon–Fri 7am
      all.legs.push(...s.legs); all.dwells.push(...s.dwells);
    }
    const stats = buildStats(all);
    const leg = stats.legs[legKey(stops[1], stops[2])];
    expect(leg.all.n).toBe(5);
    expect(leg.b.wd07.n).toBe(5);
    expect(Object.keys(stats.dwells)).toEqual([stopKey(stops[1]), stopKey(stops[2])]);
  });
});

describe("using what was learned", () => {
  const entry = { all: { n: 10, median: 400, p80: 500 }, b: { wd07: { n: 4, median: 600 }, wd09: { n: 3, median: 300 }, wd08: { n: 1, median: 999 } } };

  it("prefers the same hour, then nearby hours, then any time", () => {
    expect(typicalSeconds(entry, "wd07")).toBe(600);
    expect(typicalSeconds(entry, "wd08")).toBe(Math.round((600 * 4 + 300 * 3) / 7)); // 1 sample at 8 isn't enough
    expect(typicalSeconds(entry, "sa07")).toBe(400);
    expect(typicalSeconds(null, "wd07")).toBeNull();
  });

  it("finds where the bus is on the route", () => {
    const w = locateOnRoute(stops, { lat: 12.015, lng: -61.75 });
    expect(w.leg).toBe(1);
    expect(w.frac).toBeCloseTo(0.5, 2);
  });

  const stats = {
    legs: {
      [legKey(stops[0], stops[1])]: { all: { n: 8, median: 240 }, b: {} },
      [legKey(stops[1], stops[2])]: { all: { n: 8, median: 360 }, b: { wd07: { n: 5, median: 480 } } },
      [legKey(stops[2], stops[3])]: { all: { n: 8, median: 180 }, b: {} },
    },
    dwells: { [stopKey(stops[2])]: { all: { n: 8, median: 30 }, b: {} } },
  };

  it("adds up the rest of this leg, the legs after it and the waits between", () => {
    const pos = { lat: 12.015, lng: -61.75 }; // halfway along leg 2 (Stop 2 -> Stop 3)
    const eta = learnedEta({ stats, stops, pos, target: 3, now: T0 });
    // Half of 480 s (rush-hour time) + 30 s wait at Stop 3 + 180 s.
    expect(eta.seconds).toBe(240 + 30 + 180);
    expect(eta.learnedShare).toBe(1);
    expect(eta.trips).toBe(8);
  });

  it("uses the any-time figure outside rush hour", () => {
    const eta = learnedEta({ stats, stops, pos: { lat: 12.015, lng: -61.75 }, target: 2, now: T0 + 6 * 3600e3 });
    expect(eta.seconds).toBe(180);
  });

  it("says 0 at the stop, and nothing once the bus has passed it", () => {
    expect(learnedEta({ stats, stops, pos: stops[2], target: 2, now: T0 }).seconds).toBe(0);
    expect(learnedEta({ stats, stops, pos: { lat: 12.025, lng: -61.75 }, target: 1, now: T0 })).toBeNull();
  });

  it("estimates unlearned legs from the route's own average speed", () => {
    const partial = { legs: { [legKey(stops[0], stops[1])]: stats.legs[legKey(stops[0], stops[1])] }, dwells: {} };
    const eta = learnedEta({ stats: partial, stops, pos: stops[0], target: 2, now: T0 });
    expect(eta.learnedShare).toBeCloseTo(0.5, 1); // two equal-length legs, one learned
    expect(eta.seconds).toBeGreaterThan(400);
    expect(learnedEta({ stats: null, stops, pos: stops[0], target: 1, now: T0 }).learnedShare).toBe(0);
  });

  it("reports how much of a route is learned", () => {
    expect(routeCoverage(stats, stops)).toEqual({ learned: 3, total: 3 });
    expect(routeCoverage({ legs: {} }, stops)).toEqual({ learned: 0, total: 3 });
  });
});

describe("backend copy", () => {
  it("learnTravelTimes uses exactly the same learning code as the app", () => {
    const part = (file) => {
      const s = fs.readFileSync(file, "utf8");
      return s.slice(s.indexOf("// --- shared:start ---"), s.indexOf("// --- shared:end ---"));
    };
    const app = part("src/lib/travelTimes.js");
    expect(app.length).toBeGreaterThan(1000);
    expect(part("base44/functions/learnTravelTimes/entry.ts")).toBe(app);
  });
});
