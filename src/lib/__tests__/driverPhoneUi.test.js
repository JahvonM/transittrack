import { describe, it, expect, vi } from "vitest";
vi.mock("@/api/base44Client", () => ({ base44: {} }));
import { expiryState, nextDrivingState, telLink, unlockCodeFrom, UNLOCK_CODE, weekHours, whatsappLink } from "@/lib/driverPhone";

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

describe("bus codes", () => {
  it("reads typed codes and the QR link the same way", () => {
    expect(unlockCodeFrom("k7q 4md")).toBe("K7Q4MD");
    expect(unlockCodeFrom("K7Q-4MD")).toBe("K7Q4MD");
    expect(unlockCodeFrom("https://x.test/driver-phone/start?code=K7Q4MD")).toBe("K7Q4MD");
    expect(UNLOCK_CODE.test("K7Q4MD")).toBe(true);
    expect(UNLOCK_CODE.test("K7Q4M0")).toBe(false);
  });
});

describe("hours this week", () => {
  it("counts from Monday, including a shift still open", () => {
    const now = new Date(2026, 9, 7, 12, 0); // Wednesday
    const shifts = [
      { started_at: new Date(2026, 9, 5, 6, 30).toISOString(), ended_at: new Date(2026, 9, 5, 14, 30).toISOString(), minutes: 480 },
      { started_at: new Date(2026, 9, 7, 10, 0).toISOString(), ended_at: null, minutes: null },
      { started_at: new Date(2026, 9, 4, 6, 30).toISOString(), minutes: 300 }, // Sunday, last week
    ];
    expect(weekHours(shifts, now)).toEqual({ minutes: 600, count: 2 });
  });
});
