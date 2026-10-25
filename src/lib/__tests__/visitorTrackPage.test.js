import { describe, it, expect, vi } from "vitest";
import fs from "node:fs";
vi.mock("npm:@base44/sdk@0.8.57", () => ({ createClientFromRequest: vi.fn() }));
vi.mock("../../../base44/shared/forwardToSupabase.ts", () => ({ forwardToSupabase: vi.fn() }));
vi.mock("../../../base44/shared/atomicOps.ts", () => ({ reserveAttempt: vi.fn() }));
import { trackingUrl, VISITOR_SITE } from "../../../base44/functions/visitorTracking/entry.ts";
import { describeRide, nextCheckMs, readTrackToken, rideClosed } from "../visitorTrack.js";

// The guest's tracking page lives in the app (/track), not on another site.

const key = "0123456789abcdef".repeat(4);

describe("visitor tracking page", () => {
  it("links go to the app's own /track page, with the key after #", () => {
    expect(VISITOR_SITE).toBe("https://app.mcsweenstransport.com");
    const url = new URL(trackingUrl(key));
    expect(url.origin + url.pathname).toBe("https://app.mcsweenstransport.com/track");
    expect(url.search).toBe("");
    expect(readTrackToken(url.hash)).toBe(key);
  });

  it("reads only a proper key", () => {
    expect(readTrackToken(`#trip=${key}`)).toBe(key);
    for (const hash of ["", "#", "#trip=", "#trip=abc", `#trip=${key.toUpperCase()}`, `#trip=${key}0`, `#other=${key}`]) {
      expect(readTrackToken(hash), hash).toBeNull();
    }
  });

  it("asks again often while the bus is coming, rarely before, never after", () => {
    expect(nextCheckMs({ status: "on_the_way" })).toBe(15_000);
    expect(nextCheckMs({ status: "arrived" })).toBe(15_000);
    expect(nextCheckMs({ status: "scheduled" })).toBe(60_000);
    expect(nextCheckMs({ status: "completed" })).toBeNull();
    expect(nextCheckMs({ status: "cancelled" })).toBeNull();
    expect(rideClosed({ status: "completed" })).toBe(true);
    // Well under the server's 30 checks a minute per link.
    expect(60_000 / nextCheckMs({ status: "on_the_way" })).toBeLessThanOrEqual(30);
  });

  it("says plainly what is happening", () => {
    expect(describeRide({ status: "on_the_way", location_status: "live" }).title).toBe("Your bus is on the way");
    expect(describeRide({ status: "on_the_way", location_status: "stale" }).note).toMatch(/latest position/);
    expect(describeRide({ status: "scheduled" }).note).toMatch(/once your ride starts/);
    expect(describeRide({ status: "cancelled" }).title).toMatch(/cancelled/);
  });

  it("opens without signing in, and the ChatGPT copy is no longer referenced", () => {
    const app = fs.readFileSync("src/App.jsx", "utf8");
    expect(app).toMatch(/const publicPage = .*'\/track'/);
    expect(app).toContain('<Route path="/track" element={<TrackRide />} />');
    for (const file of ["base44/functions/visitorTracking/entry.ts", "supabase/functions/visitorTracking/entry.ts", "supabase/functions/_shared/base44-compat.ts"]) {
      expect(fs.readFileSync(file, "utf8"), file).not.toContain("chatgpt.site");
    }
  });
});
