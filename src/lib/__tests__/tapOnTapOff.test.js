import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { webcrypto, createHash } from "node:crypto";
import { load, mock, request } from "../../../security-tests/helpers.js";
import { AUTO_TAP_WAIT_MS, automaticTapAdvice } from "../../../base44/shared/boardingEvents.ts";
import { saveBoardingDirectory, localCardLookup } from "../boardingDirectory";
import { noteTap } from "../recentTaps";
import { boardingTapWait } from "../boardingTapWait";

// A two-way reader records card taps by itself: the first tap is getting on,
// the next tap is getting off. A second tap within 5 minutes is a double tap.

const m = (min) => Date.UTC(2026, 10, 8, 7) + min * 60_000;
const tap = (status, min) => ({ status, at: m(min) });

describe("the shared rule", () => {
  it("gets a rider on, then off at their next tap", () => {
    expect(automaticTapAdvice([], m(0))).toEqual({ status: "boarded", repeat: null });
    expect(automaticTapAdvice([tap("boarded", 0)], m(6))).toEqual({ status: "off_board", repeat: null });
    expect(automaticTapAdvice([tap("boarded", 0), tap("off_board", 40)], m(50))).toEqual({ status: "boarded", repeat: null });
  });
  it("treats a tap within 5 minutes as a double tap, to the millisecond", () => {
    const events = [tap("boarded", 0)];
    expect(automaticTapAdvice(events, m(0) + AUTO_TAP_WAIT_MS - 1).repeat).toBe(events[0]);
    expect(automaticTapAdvice(events, m(0) + AUTO_TAP_WAIT_MS).repeat).toBeNull();
  });
  it("starts again with getting on after a ride too long to be real", () => {
    expect(automaticTapAdvice([tap("boarded", 0)], m(7 * 60)).status).toBe("boarded");
  });
});

describe("the wait shown after a double tap", () => {
  it("counts down to the next tap and then disappears", () => {
    expect(boardingTapWait("boarded", m(0), m(0) + 28_000)).toBe("Wait 4m 32s, then tap again to get off.");
    expect(boardingTapWait("off_board", new Date(m(0)).toISOString(), m(4))).toBe("Wait 1m 00s, then tap again to get on.");
    expect(boardingTapWait("boarded", m(0), m(5))).toBe("");
    expect(boardingTapWait("boarded", "not a time", m(0))).toBe("");
  });
});

describe("the tablet's saved card list (no connection, or server busy)", () => {
  const device = { device_id: "tablet", company_id: "a", vehicle_id: "bus-a" };
  const hash = (s) => createHash("sha256").update(s).digest("hex");
  const list = () => ({ version: 1, device_id: "tablet", company_id: "a", vehicle_id: "bus-a", generated_at: new Date().toISOString(), expires_at: new Date(Date.now() + 86_400_000).toISOString(), directory_grant: "a".repeat(64), staff: [{ id: "rider", full_name: "Rider", photo_url: "", card_fingerprint: hash("tablet:AABBCCDD") }] });
  beforeEach(() => {
    const values = new Map();
    vi.stubGlobal("localStorage", { getItem: (k) => values.get(k) ?? null, setItem: (k, v) => values.set(k, String(v)), removeItem: (k) => values.delete(k) });
    vi.stubGlobal("crypto", webcrypto);
  });
  afterEach(() => vi.unstubAllGlobals());

  it("records on, then off, with the same 5-minute double-tap rule", async () => {
    saveBoardingDirectory(list(), device);
    expect(await localCardLookup("AABBCCDD", device, { automatic: true })).toMatchObject({ next_status: "boarded", already: null, automatic: true });
    noteTap("rider", "boarded", Date.now() - 2 * 60_000);
    expect((await localCardLookup("AABBCCDD", device, { automatic: true })).already).toMatchObject({ status: "boarded" });
    noteTap("rider", "boarded", Date.now() - 10 * 60_000);
  });
  it("lets a rider off ten minutes after boarding (an asking reader would say already recorded)", async () => {
    saveBoardingDirectory(list(), device);
    noteTap("rider", "boarded", Date.now() - 10 * 60_000);
    expect(await localCardLookup("AABBCCDD", device, { automatic: true })).toMatchObject({ next_status: "off_board", already: null, automatic: true });
    expect((await localCardLookup("AABBCCDD", device)).already).toMatchObject({ status: "boarded" });
  });
  it("never records by itself on a one-way reader", async () => {
    saveBoardingDirectory(list(), device);
    const boarding = await localCardLookup("AABBCCDD", { ...device, reader_mode: "boarding" }, { automatic: true });
    expect(boarding).toMatchObject({ next_status: "boarded", reader_mode: "boarding", automatic: false });
  });
});

describe("the server (kioskCheckIn)", () => {
  const minAgo = (n) => new Date(Date.now() - n * 60_000).toISOString();
  const ASSIGNED = { expected_device_id: "tablet", expected_company_id: "a", expected_vehicle_id: "bus-a" };
  function setup() {
    const sdk = mock("admin");
    sdk.tables.Contact[0].nfc_card_tag = "AABBCCDD";
    sdk.tables.NfcCard = [{ id: "c1", company_id: "a", holder_source: "contact", holder_id: "rider", card_uid: "AABBCCDD", is_active: true }];
    sdk.tables.StaffCheckIn = [];
    sdk.tables.DriverShift = [];
    const handler = load("kioskCheckIn", sdk).default;
    const send = async (body) => { const r = await handler(request({ device_id: "tablet", ...body })); return { status: r.status, body: await r.json() }; };
    return { sdk, send };
  }
  let n = 0;
  const board = (dir, status, ago) => ({ action: "check_in", staff_id: "rider", method: "nfc", status, directory_grant: dir.directory_grant,
    card_fingerprint: dir.staff.find((s) => s.id === "rider").card_fingerprint, client_request_id: "auto-" + (++n) + "-" + Date.now(), occurred_at: minAgo(ago), ...ASSIGNED });
  const look = async (f, extra = {}) => (await f.send({ action: "lookup_tag", card_tag: "AABBCCDD", ...extra })).body;

  it("says get on, then get off ten minutes later, for a reader that records by itself", async () => {
    const f = setup();
    expect(await look(f, { auto_toggle: true })).toMatchObject({ next_status: "boarded", automatic: true, already: null });
    const dir = (await f.send({ action: "offline_directory" })).body;
    expect((await f.send(board(dir, "boarded", 10))).status).toBe(200);
    expect(await look(f, { auto_toggle: true })).toMatchObject({ next_status: "off_board", automatic: true, already: null });
    // An older tablet that asks the rider still treats it as a repeat.
    expect(await look(f)).toMatchObject({ automatic: false, already: { status: "boarded" } });
  });
  it("calls a tap two minutes after boarding a double tap", async () => {
    const f = setup();
    const dir = (await f.send({ action: "offline_directory" })).body;
    await f.send(board(dir, "boarded", 2));
    expect(await look(f, { auto_toggle: true })).toMatchObject({ automatic: true, already: { status: "boarded" } });
  });
  it("records the exit the tablet sends, with nothing to review", async () => {
    const f = setup();
    const dir = (await f.send({ action: "offline_directory" })).body;
    await f.send(board(dir, "boarded", 12));
    const exit = await f.send(board(dir, "off_board", 0));
    expect(exit.status).toBe(200);
    expect(f.sdk.tables.StaffCheckIn.map((r) => [r.status, r.review_reason || ""])).toEqual([["boarded", ""], ["off_board", ""]]);
  });
  it("keeps a one-way reader to its direction", async () => {
    const f = setup();
    f.sdk.tables.KioskDevice[0].reader_mode = "boarding";
    expect(await look(f, { auto_toggle: true })).toMatchObject({ next_status: "boarded", reader_mode: "boarding", automatic: false });
  });
});
