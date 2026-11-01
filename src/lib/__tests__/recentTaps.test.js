import { beforeEach, describe, it, expect, vi } from "vitest";
import { webcrypto, createHash } from "node:crypto";
import { localTapAdvice, noteTap, tapsFor } from "../recentTaps";
import { saveBoardingDirectory, localCardLookup } from "../boardingDirectory";

// The boarding tablet with no connection: it must still say "Already
// recorded" for a repeated tap and never offer a double tap as getting off.

const hash = (s) => createHash("sha256").update(s).digest("hex");
beforeEach(() => {
  const values = new Map();
  vi.stubGlobal("localStorage", { getItem: (k) => values.get(k) ?? null, setItem: (k, v) => values.set(k, String(v)), removeItem: (k) => values.delete(k) });
  vi.stubGlobal("crypto", webcrypto);
});

describe("tablet tap memory", () => {
  it("a repeat within the window is already recorded; later it's a new tap", () => {
    const now = Date.now();
    noteTap("rider", "boarded", now - 60_000);
    expect(localTapAdvice("rider", "both", now).already).toMatchObject({ status: "boarded" });
    expect(localTapAdvice("rider", "both", now + 40 * 60_000)).toMatchObject({ already: null, next_status: "off_board" });
  });
  it("a boarding-only reader never suggests getting off", () => {
    const now = Date.now();
    noteTap("rider", "boarded", now - 45 * 60_000);
    expect(localTapAdvice("rider", "boarding", now)).toEqual({ next_status: "boarded", already: null });
  });
  it("keeps only ids, directions and times, a few per person", () => {
    const now = Date.now();
    for (let i = 0; i < 15; i++) noteTap("rider", i % 2 ? "off_board" : "boarded", now - (15 - i) * 60_000);
    expect(tapsFor("rider")).toHaveLength(10);
    expect(Object.keys(tapsFor("rider")[0]).sort()).toEqual(["at", "status"]);
  });
  it("reads an older tablet's last direction", () => {
    localStorage.setItem("tt_kiosk_last_status", JSON.stringify({ rider: "boarded" }));
    expect(localTapAdvice("rider", "both").next_status).toBe("off_board");
  });
});

describe("offline card taps", () => {
  const device = { device_id: "tablet", company_id: "a", vehicle_id: "bus-a" };
  const list = () => ({ version: 1, device_id: "tablet", company_id: "a", vehicle_id: "bus-a", generated_at: new Date().toISOString(), expires_at: new Date(Date.now() + 86_400_000).toISOString(), directory_grant: "a".repeat(64), staff: [{ id: "rider", full_name: "Rider", photo_url: "", card_fingerprint: hash("tablet:AABBCCDD") }] });
  it("a second tap of the same card offline says already recorded", async () => {
    saveBoardingDirectory(list(), device);
    const first = await localCardLookup("AABBCCDD", device);
    expect(first).toMatchObject({ next_status: "boarded", already: null, reader_mode: "both" });
    noteTap("rider", "boarded");
    expect((await localCardLookup("AABBCCDD", device)).already).toMatchObject({ status: "boarded" });
  });
  it("follows the tablet's reader mode", async () => {
    saveBoardingDirectory(list(), device);
    expect((await localCardLookup("AABBCCDD", { ...device, reader_mode: "exit" }))).toMatchObject({ next_status: "off_board", reader_mode: "exit" });
  });
});
