import { describe, it, expect, vi } from "vitest";
vi.mock("@/api/base44Client", () => ({ base44: {} }));
import { expiryState, nextDrivingState, telLink, whatsappLink } from "@/lib/driverPhone";

describe("driving screen", () => {
  const run = (readings) => readings.reduce((s, r) => nextDrivingState(s, r), {});
  it("needs two fast readings in a row before it covers the app", () => {
    expect(run([{ speed: 6, at: 0 }]).driving).toBe(false);
    expect(run([{ speed: 6, at: 0 }, { speed: 2, at: 1000 }, { speed: 6, at: 2000 }]).driving).toBe(false);
    expect(run([{ speed: 6, at: 0 }, { speed: 6, at: 1000 }]).driving).toBe(true);
  });
  it("stays on through a short stop and lifts after ten seconds stopped", () => {
    const moving = run([{ speed: 6, at: 0 }, { speed: 6, at: 1000 }]);
    expect(nextDrivingState(nextDrivingState(moving, { speed: 0, at: 2000 }), { speed: 0, at: 8000 }).driving).toBe(true);
    expect(nextDrivingState(nextDrivingState(moving, { speed: 0, at: 2000 }), { speed: 0, at: 12001 }).driving).toBe(false);
  });
  it("ignores readings without a speed", () => {
    const moving = run([{ speed: 6, at: 0 }, { speed: 6, at: 1000 }]);
    expect(nextDrivingState(moving, { speed: null, at: 50000 }).driving).toBe(true);
  });
});

describe("document expiry", () => {
  const now = new Date("2026-10-07T12:00:00");
  it("reads as valid, expiring soon or expired", () => {
    expect(expiryState("2027-08-31", now).tone).toBe("success");
    expect(expiryState("2026-10-27", now)).toMatchObject({ tone: "warning", days: 20 });
    expect(expiryState("2026-10-07", now).text).toBe("Expires today");
    expect(expiryState("2026-10-01", now).tone).toBe("danger");
    expect(expiryState("", now).tone).toBe("neutral");
  });
});

describe("phone links", () => {
  it("builds call and WhatsApp links only from real numbers", () => {
    expect(telLink("+1 (473) 555-0123")).toBe("tel:+14735550123");
    expect(whatsappLink("+1 (473) 555-0123")).toBe("https://wa.me/14735550123");
    expect(telLink("n/a")).toBe("");
    expect(whatsappLink("")).toBe("");
  });
});
