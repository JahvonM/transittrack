import { describe, expect, it } from "vitest";
import route from "./fixtures/route-short.json";
import { formatDistance, formatDuration, parseDirections, progressAt, projectOnRoute, routeAhead, speedLimitKmh, voicePromptAt } from "@/lib/navigation";

// A real Mapbox route in Grenada (Old Road -> Western Road -> ...), saved
// so the tests don't need the internet.
const nav = parseDirections(route);
const at = (along) => {
  // the point on the route `along` metres from the start
  const i = nav.cum.findIndex((c) => c >= along);
  const a = nav.geometry[Math.max(0, i - 1)];
  const b = nav.geometry[i];
  const f = (along - nav.cum[i - 1]) / (nav.cum[i] - nav.cum[i - 1]);
  return { lng: a[0] + (b[0] - a[0]) * f, lat: a[1] + (b[1] - a[1]) * f };
};

describe("parseDirections", () => {
  it("reads the route, its steps and banners", () => {
    expect(nav.total).toBeGreaterThan(8000);
    expect(nav.steps.map((s) => s.type)).toEqual(["depart", "turn", "turn", "turn", "turn", "turn", "arrive"]);
    expect(nav.steps[1].instruction).toBe("Bear left onto Western Road.");
    expect(nav.steps[0].banner.text).toBe("Western Road");
    expect(nav.stepStart[1]).toBeCloseTo(83, 0);
  });
  it("returns null for an empty answer", () => {
    expect(parseDirections({ routes: [] })).toBeNull();
    expect(parseDirections(null)).toBeNull();
  });
});

describe("projectOnRoute", () => {
  it("puts the bus on the road and measures how far along it is", () => {
    const p = projectOnRoute(nav, at(1500));
    expect(p.along).toBeCloseTo(1500, 0);
    expect(p.offM).toBeLessThan(1);
  });
  it("snaps a bus a little off the line back onto it", () => {
    const pos = at(3000);
    // This route drives part of Western Road out and back (2.3 km and 3 km
    // along are the same spot), so like the app, follow the bus from the
    // start and let its last position decide which pass it's on.
    let hint = null;
    for (let a = 0; a <= 2950; a += 50) hint = projectOnRoute(nav, at(a), hint).seg;
    const p = projectOnRoute(nav, { lat: pos.lat + 0.0002, lng: pos.lng }, hint); // ~22 m north
    expect(p.offM).toBeGreaterThan(5);
    expect(p.offM).toBeLessThan(30);
    expect(Math.abs(p.along - 3000)).toBeLessThan(40);
  });
  it("finds the bus again after a jump even with an old hint", () => {
    const p = projectOnRoute(nav, at(7000), 3);
    expect(p.along).toBeCloseTo(7000, 0);
  });
});

describe("progressAt", () => {
  it("shows the next turn and counts down to it", () => {
    const p = progressAt(nav, 1000);
    expect(p.step.instruction).toBe("Turn right.");
    expect(p.banner.text).toBe("Turn right");
    expect(p.distToManeuverM).toBeCloseTo(nav.stepStart[2] - 1000, 3);
    expect(p.remainingM).toBeCloseTo(nav.total - 1000, 3);
    expect(p.remainingS).toBeGreaterThan(0);
    expect(p.remainingS).toBeLessThan(nav.durationS);
  });
  it("previews a turn that comes right after (the 28 m right then left)", () => {
    const p = progressAt(nav, 2400);
    expect(p.step.instruction).toBe("Turn right.");
    expect(p.thenStep?.instruction).toBe("Turn left onto Palmiste Dig Road.");
  });
  it("moves on once a turn is passed", () => {
    expect(progressAt(nav, nav.stepStart[2] + 3).step.instruction).toBe("Turn left onto Palmiste Dig Road.");
  });
  it("arrives near the end", () => {
    expect(progressAt(nav, nav.total - 10)).toMatchObject({ arrived: true });
  });
  it("time left only goes down", () => {
    let prev = Infinity;
    for (let a = 0; a < nav.total - 30; a += 100) {
      const s = progressAt(nav, a).remainingS;
      expect(s).toBeLessThanOrEqual(prev + 1e-6);
      prev = s;
    }
  });
});

describe("voice prompts", () => {
  it("says each prompt once, at its distance, like Google Maps", () => {
    const spoken = new Set();
    const said = [];
    for (let a = 100; a < nav.stepStart[2]; a += 20) {
      const v = voicePromptAt(nav, progressAt(nav, a), spoken);
      if (v) said.push(v.text);
    }
    expect(said).toEqual(["Continue for 2.5 kilometers.", "In 800 meters, Turn right.", "Turn right. Then Turn left."]);
  });
  it("skips prompts the bus has already driven past", () => {
    const spoken = new Set();
    const v = voicePromptAt(nav, progressAt(nav, nav.stepStart[2] - 50), spoken);
    expect(v.text).toBe("Turn right. Then Turn left.");
    expect(voicePromptAt(nav, progressAt(nav, nav.stepStart[2] - 40), spoken)).toBeNull();
  });
});

describe("drawing and numbers", () => {
  it("draws only the road still ahead, starting at the bus", () => {
    const from = projectOnRoute(nav, at(4000));
    const runs = routeAhead(nav, from);
    expect(runs[0].coords[0]).toEqual(from.point);
    expect(runs.at(-1).coords.at(-1)).toEqual(nav.geometry.at(-1));
    expect(runs.every((r) => ["normal", "moderate", "heavy"].includes(r.level))).toBe(true);
  });
  it("colours traffic", () => {
    const n = { ...nav, congestion: nav.geometry.slice(1).map((_, i) => (i < 10 ? "low" : i < 20 ? "heavy" : "moderate")) };
    expect(routeAhead(n).map((r) => r.level)).toEqual(["normal", "heavy", "moderate"]);
  });
  it("reads speed limits when known", () => {
    const n = { ...nav, maxspeed: [{ speed: 50, unit: "km/h" }, { speed: 30, unit: "mph" }, { unknown: true }] };
    expect(speedLimitKmh(n, 0)).toBe(50);
    expect(speedLimitKmh(n, 1)).toBe(48);
    expect(speedLimitKmh(n, 2)).toBeNull();
  });
  it("formats like Google Maps", () => {
    expect(formatDistance(43)).toBe("40 m");
    expect(formatDistance(320)).toBe("300 m");
    expect(formatDistance(2449)).toBe("2.4 km");
    expect(formatDistance(15400)).toBe("15 km");
    expect(formatDuration(1171)).toBe("20 min");
    expect(formatDuration(3900)).toBe("1 hr 5 min");
    expect(formatDuration(20)).toBe("1 min");
  });
});
