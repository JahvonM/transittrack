import { describe, it, expect } from "vitest";
import { bearingDeg, boundsOf, distanceM, lerpHeading, nearestOnLine, splitRoute } from "@/components/map3d/routeGeometry";
import { busNumber, busStatusLine, passengerTripState, timelineRows } from "@/components/passenger/passengerState";

// A straight east-west road near Grand Anse, ~1.1 km long.
const A = [-61.76, 12.03];
const B = [-61.75, 12.03];
const C = [-61.74, 12.03];

describe("live map geometry", () => {
  it("measures distance and bearing", () => {
    expect(distanceM(A, B)).toBeGreaterThan(1080);
    expect(distanceM(A, B)).toBeLessThan(1100);
    expect(Math.round(bearingDeg(A, B))).toBe(90);
    expect(Math.round(bearingDeg(B, A))).toBe(270);
    expect(bearingDeg(A, [A[0] + 0.00001, A[1]])).toBeNull(); // ~1 m: too close to tell
  });

  it("turns the short way round", () => {
    expect(lerpHeading(350, 10, 0.5)).toBeCloseTo(0, 5);
    expect(lerpHeading(10, 350, 0.5)).toBeCloseTo(0, 5);
    expect(lerpHeading(90, 180, 0.5)).toBeCloseTo(135, 5);
  });

  it("snaps a point onto the route", () => {
    const hit = nearestOnLine([A, B, C], [-61.745, 12.0301]);
    expect(hit.index).toBe(1);
    expect(hit.offM).toBeLessThan(15);
    expect(hit.point[1]).toBeCloseTo(12.03, 6);
  });

  it("splits the route at the bus into driven and ahead", () => {
    const { travelled, ahead } = splitRoute([A, B, C], [-61.745, 12.03]);
    expect(travelled[0]).toEqual(A);
    expect(travelled.at(-1)).toEqual(ahead[0]);
    expect(ahead.at(-1)).toEqual(C);
  });

  it("does not split for a bus far off the route", () => {
    const { travelled, ahead } = splitRoute([A, B, C], [-61.745, 12.05]);
    expect(travelled).toEqual([]);
    expect(ahead).toEqual([A, B, C]);
  });

  it("bounds any set of points and ignores bad ones", () => {
    expect(boundsOf([A, C, null, [NaN, 1]])).toEqual([[-61.76, 12.03], [-61.74, 12.03]]);
    expect(boundsOf([])).toBeNull();
  });
});

const now = Date.parse("2026-10-04T12:00:00Z");
const ago = (min) => new Date(now - min * 60_000).toISOString();
const stop = { name: "True Blue", lat: 12.03, lng: -61.745 };
const bus = (extra = {}) => ({ id: "b1", name: "Bus 12", current_lat: 12.03, current_lng: -61.755, tracking_active: true, last_location_update: ago(0.2), ...extra });

describe("passenger arrival state", () => {
  it("asks for a stop first", () => {
    expect(passengerTripState({ stop: null, now }).kind).toBe("choose");
  });

  it("shows live minutes for a fresh approaching bus", () => {
    const s = passengerTripState({ stop, approaching: { v: bus() }, eta: { mins: 7.4 }, now });
    expect(s.kind).toBe("live");
    expect(s.mins).toBeCloseTo(7.4);
  });

  it("says arriving at a minute or less", () => {
    expect(passengerTripState({ stop, approaching: { v: bus() }, eta: { mins: 0.8 }, now }).kind).toBe("arriving");
  });

  it("marks the signal lost after ten minutes without a fix", () => {
    const s = passengerTripState({ stop, approaching: { v: bus({ last_location_update: ago(12) }) }, eta: { mins: 7 }, now });
    expect(s.kind).toBe("signal_lost");
    expect(s.fresh.state).toBe("lost");
  });

  it("keeps a slightly late fix live (stale is shown as a note, not a new state)", () => {
    const s = passengerTripState({ stop, approaching: { v: bus({ last_location_update: ago(4) }) }, eta: { mins: 7 }, now });
    expect(s.kind).toBe("live");
    expect(s.fresh.state).toBe("stale");
  });

  it("shows not started when your bus isn't tracking", () => {
    const s = passengerTripState({ stop, approaching: null, myVehicle: bus({ tracking_active: false }), now });
    expect(s.kind).toBe("not_started");
  });

  it("shows a problem only for a bus taken out of service", () => {
    expect(passengerTripState({ stop, approaching: null, myVehicle: bus({ in_service: false }), now }).kind).toBe("problem");
    // An emergency is never a passenger state: the page masks it before this.
    expect(passengerTripState({ stop, approaching: { v: bus({ status: "on_trip" }) }, eta: { mins: 5 }, now }).kind).toBe("live");
  });

  it("has no ETA when no bus serves the stop", () => {
    expect(passengerTripState({ stop, approaching: null, myVehicle: null, now }).kind).toBe("no_eta");
  });

  it("never invents minutes when there is no estimate", () => {
    expect(passengerTripState({ stop, approaching: { v: bus() }, eta: null, now }).mins).toBeNull();
  });
});

describe("route timeline", () => {
  const route = {
    name: "Grand Anse Loop",
    stops: [
      { name: "Depot", lat: 12.03, lng: -61.77, order: 0 },
      { name: "Morne Rouge", lat: 12.03, lng: -61.76, order: 1 },
      { name: "Lagoon Road", lat: 12.03, lng: -61.75, order: 2 },
      { name: "Calliste", lat: 12.03, lng: -61.745, order: 3 },
      { name: "True Blue", lat: 12.03, lng: -61.74, order: 4 },
      { name: "Airport", lat: 12.03, lng: -61.735, order: 5 },
      { name: "Point Salines", lat: 12.03, lng: -61.73, order: 6 },
    ],
  };

  it("places the bus before the next stop and collapses passed and later stops", () => {
    const t = timelineRows({ route, bus: bus({ current_lng: -61.755 }), stopName: "True Blue" });
    const names = t.rows.map((r) => (r.type === "bus" ? "BUS" : r.stop.name));
    expect(names).toEqual(["Morne Rouge", "BUS", "Lagoon Road", "Calliste", "True Blue", "Point Salines"]);
    expect(t.hiddenBefore).toBe(1);
    expect(t.hiddenAfter).toBe(1);
    expect(t.stopsToGo).toBe(3);
    expect(t.rows.find((r) => r.mine).stop.name).toBe("True Blue");
  });

  it("keeps a parked bus above the first stop", () => {
    const t = timelineRows({ route, bus: bus(), stopName: "True Blue", placeBus: false });
    expect(t.rows[0].type).toBe("bus");
    expect(t.stopsToGo).toBeNull();
  });

  it("can show every passed stop", () => {
    const t = timelineRows({ route, bus: bus({ current_lng: -61.7425 }), stopName: "True Blue", showAllPassed: true });
    expect(t.hiddenBefore).toBe(0);
    expect(t.rows.filter((r) => r.status === "passed").length).toBe(4);
  });
});

describe("bus number", () => {
  it("reads the number out of a bus name", () => {
    expect(busNumber("Bus 12")).toBe("12");
    expect(busNumber("Coach 7A")).toBe("7");
    expect(busNumber("Shuttle")).toBeNull();
  });
});

describe("bus status line", () => {
  const route = { stops: [
    { name: "Depot", lat: 12.03, lng: -61.77, order: 0 },
    { name: "Lagoon Road", lat: 12.03, lng: -61.75, order: 1 },
    { name: "True Blue", lat: 12.03, lng: -61.73, order: 2 },
  ] };
  it("names the next stop for a live bus", () => {
    expect(busStatusLine(bus({ current_lng: -61.76 }), route, now)).toBe("Next stop Lagoon Road");
  });
  it("says when the signal is lost or the bus is parked", () => {
    expect(busStatusLine(bus({ last_location_update: ago(15) }), route, now)).toMatch(/^Signal lost/);
    expect(busStatusLine(bus({ tracking_active: false, last_location_update: null }), route, now)).toBe("Not on the road");
    expect(busStatusLine(bus({ in_service: false }), route, now)).toBe("Out of service");
  });
});
