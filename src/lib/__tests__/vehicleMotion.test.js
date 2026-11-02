import { describe, expect, it } from "vitest";
import { MOTION, createTrack, movedTo, retarget, roadPath, step, turnTo } from "../vehicleMotion";
import { distanceM, nearestOnLine } from "../../components/map3d/routeGeometry";

// A bus on St. George's Carenage, moving east about 150 m every 15 s.
const A = [-61.7520, 12.0530];
const B = [-61.7506, 12.0530]; // ~152 m east of A
const C = [-61.7492, 12.0530]; // ~152 m east of B

describe("bus movement between GPS updates", () => {
  it("appears where it is first seen", () => {
    const t = createTrack(A, 0);
    expect(step(t, 500)).toBe(false);
    expect(t.current).toEqual(A);
  });

  it("moves at a steady speed over about the time updates take, then stops at the real position", () => {
    const t = createTrack(A, 0);
    retarget(t, B, 15_000);
    expect(t.dur).toBe(Math.round(MOTION.defaultMs * 0.5 + 15_000 * 0.5) * 1.1);
    const half = t.t0 + t.dur / 2;
    step(t, half);
    // Linear: halfway in time is halfway along, not most of the way there.
    expect(distanceM(t.current, A)).toBeCloseTo(distanceM(A, B) / 2, 0);
    expect(step(t, t.t0 + t.dur + 5_000)).toBe(false);
    expect(t.current).toEqual(B); // no newer fix: it waits at the last real one
  });

  it("never runs ahead of the newest real position", () => {
    const t = createTrack(A, 0);
    retarget(t, B, 15_000);
    for (const ms of [0, 1_000, 8_000, 16_000, 60_000]) {
      step(t, t.t0 + ms);
      expect(t.current[0]).toBeGreaterThanOrEqual(A[0]);
      expect(t.current[0]).toBeLessThanOrEqual(B[0]);
    }
  });

  it("keeps going from where it is drawn when the next update arrives early", () => {
    const t = createTrack(A, 0);
    retarget(t, B, 15_000);
    step(t, 15_000 + 10_000);
    const drawn = t.current;
    retarget(t, C, 25_000);
    expect(t.from).toEqual(drawn); // no jump back or forward
    step(t, 25_000);
    expect(t.current).toEqual(drawn);
    expect(step(t, 30_000)).toBe(true); // still moving toward C
  });

  it("learns how often updates arrive, ignoring long pauses", () => {
    const t = createTrack(A, 0);
    retarget(t, B, 20_000);
    retarget(t, C, 40_000);
    expect(t.interval).toBeGreaterThan(18_000);
    expect(t.interval).toBeLessThanOrEqual(20_000);
    const learned = t.interval;
    retarget(t, A, 40_000 + 10 * 60_000); // parked for ten minutes
    expect(t.interval).toBe(learned);
    expect(t.dur).toBeLessThanOrEqual(MOTION.maxMs);
  });

  it("shows a big jump, a stale bus or reduced motion straight away", () => {
    const far = [-61.70, 12.10]; // several km away
    const t = createTrack(A, 0);
    retarget(t, far, 15_000);
    expect(t.dur).toBe(0);
    expect(t.current).toEqual(far);
    const u = createTrack(A, 0);
    retarget(u, B, 15_000, { snap: true });
    expect(u.current).toEqual(B);
  });

  it("turns to face the way it is going within about a second", () => {
    const t = createTrack(A, 0, 0);
    retarget(t, B, 15_000);
    expect(t.hTo).toBeCloseTo(90, 0); // east
    step(t, 15_000 + MOTION.turnMs);
    expect(t.heading).toBeCloseTo(90, 0);
    turnTo(t, 180, 40_000);
    step(t, 40_000 + MOTION.turnMs / 2);
    expect(t.heading).toBeGreaterThan(90);
    expect(t.heading).toBeLessThan(180);
    turnTo(t, 270, 50_000, { snap: true });
    expect(t.heading).toBe(270);
  });

  it("ignores GPS jitter under half a metre", () => {
    const t = createTrack(A, 0);
    expect(movedTo(t, [A[0] + 0.000001, A[1]])).toBe(false);
    expect(movedTo(t, B)).toBe(true);
  });
});

// A route road with a right-angle bend: east along the Carenage, then north.
const CORNER = [-61.7506, 12.0530];
const NORTH = [-61.7506, 12.0544]; // ~155 m north of the corner
const ROAD_LINE = [[-61.7534, 12.0530], A, [-61.7513, 12.0530], CORNER, [-61.7506, 12.0537], NORTH, [-61.7506, 12.0560]];

describe("following the route's road between updates", () => {
  it("goes round the bend instead of cutting the corner", () => {
    const t = createTrack(A, 0);
    retarget(t, NORTH, 15_000, { road: ROAD_LINE });
    expect(t.pts).not.toBeNull();
    for (let ms = 0; ms <= t.dur; ms += t.dur / 40) {
      step(t, t.t0 + ms);
      expect(nearestOnLine(ROAD_LINE, t.current).offM).toBeLessThan(1); // always on the road
    }
    expect(t.current).toEqual(NORTH);
  });

  it("keeps a steady speed along the road and passes the corner on time", () => {
    const t = createTrack(A, 0);
    retarget(t, NORTH, 15_000, { road: ROAD_LINE });
    const toCorner = distanceM(A, CORNER), total = toCorner + distanceM(CORNER, NORTH);
    step(t, t.t0 + t.dur * (toCorner / total));
    expect(distanceM(t.current, CORNER)).toBeLessThan(1);
  });

  it("faces each stretch of road as it reaches it", () => {
    const t = createTrack(A, 0, 0);
    retarget(t, NORTH, 15_000, { road: ROAD_LINE });
    expect(t.hTo).toBeCloseTo(90, 0); // east first
    step(t, t.t0 + t.dur * 0.95);
    step(t, t.t0 + t.dur * 0.95 + MOTION.segmentTurnMs);
    expect(t.heading).toBeCloseTo(0, 0); // north after the bend
  });

  it("works on the return trip, driving the road backwards", () => {
    const t = createTrack(NORTH, 0);
    retarget(t, A, 15_000, { road: ROAD_LINE });
    expect(t.pts).not.toBeNull();
    step(t, t.t0 + t.dur / 2);
    expect(nearestOnLine(ROAD_LINE, t.current).offM).toBeLessThan(1);
  });

  it("moves straight when the bus is off its road or the road would loop away", () => {
    const offRoad = [-61.7520, 12.0540]; // ~110 m north of the road
    expect(roadPath(ROAD_LINE, A, offRoad)).toBeNull();
    // A road that runs 1 km out and back between two points 50 m apart.
    const loop = [[-61.7520, 12.0530], [-61.7520, 12.0620], [-61.7516, 12.0620], [-61.7516, 12.0530]];
    expect(roadPath(loop, [-61.7520, 12.0530], [-61.7516, 12.0530])).toBeNull();
    const t = createTrack(A, 0);
    retarget(t, B, 15_000, { road: null });
    expect(t.pts).toBeNull();
  });

  it("still shows a big jump straight away, road or not", () => {
    const t = createTrack(A, 0);
    retarget(t, [-61.70, 12.10], 15_000, { road: ROAD_LINE });
    expect(t.dur).toBe(0);
    expect(t.pts).toBeNull();
  });
});
