import { describe, it, expect, vi } from "vitest";
vi.mock("npm:@base44/sdk@0.8.44", () => ({ createClientFromRequest: vi.fn() }));
vi.mock("../../../base44/shared/forwardToSupabase.ts", () => ({ forwardToSupabase: vi.fn(async () => null) }));
vi.mock("../../../base44/shared/atomicOps.ts", () => ({ reserveAttempt: vi.fn(async () => true) }));
vi.mock("../../../base44/shared/notificationPolicy.ts", () => ({ emailWithPolicy: vi.fn() }));
import { readRequest } from "../../../base44/functions/bookingRequest/entry.ts";
import {
  AIRPORT_NAME, SITE_SERVICES, bookingBody, bookingProblems, draftFromRequest, grenadaInputFor, grenadaInputToIso,
  isSiteHost, sitePage, withService,
} from "@/lib/bookingSite";
import { JOB_TYPES } from "@/lib/jobs";

// The public website's booking form (src/site/BookPage.jsx).

const NOW = Date.parse("2026-10-25T12:00:00Z"); // 08:00 in Grenada
const filled = (over = {}) => ({
  service: "airport_pickup", when: "2026-10-27T15:30", flight_number: "bw 431", pickup: AIRPORT_NAME, dropoff: "Spice Island Beach Resort",
  guests: "3", luggage: "", name: "Ana Joseph", phone: "+1 473 555 0101", email: "ana@example.com", notes: "", website: "", ...over,
});

describe("website booking form", () => {
  it("reads the time as Grenada time wherever the visitor is", () => {
    expect(grenadaInputToIso("2026-10-27T15:30")).toBe("2026-10-27T19:30:00.000Z");
    expect(grenadaInputToIso("2026-07-01T00:05")).toBe("2026-07-01T04:05:00.000Z");
    expect(grenadaInputToIso("")).toBeNull();
    expect(grenadaInputToIso("27/10/2026 15:30")).toBeNull();
    expect(grenadaInputFor(NOW)).toBe("2026-10-25T08:00");
    expect(grenadaInputToIso(grenadaInputFor(NOW))).toBe(new Date(NOW).toISOString());
  });

  it("offers only kinds of ride that dispatch can make into a job", () => {
    const types = new Set(JOB_TYPES.map((t) => t.id));
    for (const s of SITE_SERVICES) expect(types.has(s.id)).toBe(true);
  });

  it("says what to fix before sending", () => {
    expect(bookingProblems(filled(), NOW)).toEqual({});
    const p = bookingProblems(filled({ when: "2026-10-25T08:30", pickup: "", guests: "0", phone: "call me", email: "ana@", flight_number: "!!" }), NOW);
    expect(Object.keys(p).sort()).toEqual(["email", "flight_number", "guests", "phone", "pickup", "when"]);
    expect(p.when).toMatch(/at least an hour/);
    expect(bookingProblems(filled({ when: "2028-01-01T10:00" }), NOW).when).toMatch(/next year/);
  });

  it("sends what the bookingRequest function accepts", () => {
    const body = bookingBody(filled({ luggage: "2", notes: "  Two car seats " }), NOW - 45_000, NOW);
    expect(body).toMatchObject({ action: "request", requested_time: "2026-10-27T19:30:00.000Z", guests: 3, luggage: 2, flight_number: "BW 431", notes: "Two car seats", website: "", form_ms: 45_000 });
    const kept = readRequest(body, NOW);
    expect(kept).toMatchObject({ service: "airport_pickup", pickup: AIRPORT_NAME, guests: 3, luggage: 2, flight_number: "BW 431", email: "ana@example.com" });
    // No flight number for rides that aren't to or from the airport.
    expect(bookingBody(filled({ service: "hotel_tour" }), NOW, NOW).flight_number).toBe("");
  });

  it("keeps the airport on the right side when the kind of ride changes", () => {
    const start = withService({ pickup: "", dropoff: "", flight_number: "" }, "airport_pickup");
    expect(start.pickup).toBe(AIRPORT_NAME);
    const back = withService({ ...start, dropoff: "Coyaba" }, "airport_dropoff");
    expect([back.pickup, back.dropoff]).toEqual(["Coyaba", AIRPORT_NAME]);
    const tour = withService({ ...back, flight_number: "BW 1" }, "hotel_tour");
    expect([tour.pickup, tour.dropoff, tour.flight_number]).toEqual(["Coyaba", "", ""]);
  });

  it("opens the website only on its own addresses", () => {
    expect(isSiteHost("mcsweenstransport.com")).toBe(true);
    expect(isSiteHost("WWW.mcsweenstransport.com")).toBe(true);
    expect(isSiteHost("app.mcsweenstransport.com")).toBe(false);
    expect(isSiteHost("eager-transit-track-go.base44.app")).toBe(false);
    expect(sitePage("/")).toBe("/");
    expect(sitePage("/book/")).toBe("/book");
    expect(sitePage("/track")).toBe("/track");
    expect(sitePage("/login")).toBeNull();
    expect(sitePage("/admin/trips")).toBeNull();
  });

  it("turns a request into a job for dispatch to finish", () => {
    const d = draftFromRequest({ service: "airport_pickup", requested_time: "2026-10-27T19:30:00.000Z", pickup: AIRPORT_NAME, dropoff: "Coyaba", guests: 3, luggage: 2, flight_number: "BW 431", name: "Ana Joseph", phone: "+1 473 555 0101", email: "ana@example.com", notes: "Two car seats" });
    expect(d).toMatchObject({ job_type: "airport_pickup", scheduled_time: "2026-10-27T19:30:00.000Z", pickup: { name: AIRPORT_NAME, lat: null }, dropoff: { name: "Coyaba" }, passenger_name: "Ana Joseph", guests: 3 });
    expect(d.notes).toBe("Two car seats\nBooked on the website by ana@example.com");
    expect(draftFromRequest({ service: "spaceship" }).job_type).toBe("transfer");
  });
});

describe("the old Base44 address", () => {
  it("sends people to the same page on app.mcsweenstransport.com, and nowhere else", async () => {
    const { readFileSync } = await import("node:fs");
    const html = readFileSync("index.html", "utf8");
    expect(html).toContain('if (location.hostname === "eager-transit-track-go.base44.app") {');
    expect(html).toContain('location.replace("https://app.mcsweenstransport.com" + location.pathname + location.search + location.hash);');
  });
});
