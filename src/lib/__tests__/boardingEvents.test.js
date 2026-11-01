import { describe, it, expect } from "vitest";
import { DUPLICATE_WINDOW_MS, onBoard, onBoardCount, readerMode, repeatOf, reviewReason, suggestedStatus } from "../../../base44/shared/boardingEvents.ts";

const m = (min) => Date.UTC(2026, 9, 28, 7) + min * 60_000;
const tap = (status, min, extra = {}) => ({ status, at: m(min), ...extra });

describe("repeated taps", () => {
  it("a second boarding tap within the window is a repeat, not a new event", () => {
    const events = [tap("boarded", 0)];
    expect(repeatOf(events, "boarded", m(1))).toBe(events[0]);
    expect(repeatOf(events, "boarded", m(29))).toBe(events[0]);
  });
  it("a tap in the other direction is never a repeat", () => {
    expect(repeatOf([tap("boarded", 0)], "off_board", m(1))).toBeNull();
  });
  it("a boarding after an exit is a new ride, however soon", () => {
    expect(repeatOf([tap("boarded", 0), tap("off_board", 10)], "boarded", m(11))).toBeNull();
  });
  it("outside the window it's a new tap", () => {
    expect(repeatOf([tap("boarded", 0)], "boarded", m(0) + DUPLICATE_WINDOW_MS + 1)).toBeNull();
  });
  it("a tap saved offline that arrives after a later one from another tablet is still a repeat", () => {
    // Tablet B recorded boarding at 7:05 and sent it first; tablet A's 7:00
    // boarding arrives later from its offline queue.
    const later = tap("boarded", 5, { device_id: "B" });
    expect(repeatOf([later], "boarded", m(0))).toBe(later);
  });
});

describe("what needs a person to look at it", () => {
  it("flags an exit with no boarding, and a second boarding with no exit", () => {
    expect(reviewReason([], "off_board", m(0))).toBe("exit_without_boarding");
    expect(reviewReason([tap("boarded", 0)], "boarded", m(60))).toBe("boarding_without_exit");
  });
  it("leaves a normal board-then-exit alone", () => {
    expect(reviewReason([], "boarded", m(0))).toBeNull();
    expect(reviewReason([tap("boarded", 0)], "off_board", m(40))).toBeNull();
  });
  it("flags two tablets whose taps disagree on order", () => {
    // Tablet B recorded an exit at 7:40; tablet A's exit at 7:39 arrives later,
    // more than the repeat window after the boarding.
    const events = [tap("boarded", 0), tap("off_board", 40)];
    expect(reviewReason(events, "off_board", m(39))).toBe("conflicting_devices");
  });
});

describe("suggested direction and who is on board", () => {
  it("a fixed reader never asks", () => {
    expect(suggestedStatus([tap("boarded", 0)], m(5), "boarding")).toBe("boarded");
    expect(suggestedStatus([], m(5), "exit")).toBe("off_board");
  });
  it("asks to exit only while a boarding is recent", () => {
    expect(suggestedStatus([tap("boarded", 0)], m(30))).toBe("off_board");
    expect(suggestedStatus([tap("boarded", 0)], m(7 * 60))).toBe("boarded");
    expect(suggestedStatus([tap("boarded", 0), tap("off_board", 20)], m(30))).toBe("boarded");
  });
  it("counts several passengers who leave at different stops", () => {
    const byPerson = {
      ana: [tap("boarded", 0), tap("off_board", 10)],
      ben: [tap("boarded", 2)],
      cal: [tap("boarded", 3), tap("off_board", 25)],
    };
    expect(onBoardCount(byPerson, m(12))).toBe(2);
    expect(onBoardCount(byPerson, m(30))).toBe(1);
    expect(onBoard(byPerson.ben, m(30))).toEqual({ onBoard: true, since: m(2) });
  });
  it("only knows three reader modes; anything else asks", () => {
    expect(readerMode("boarding")).toBe("boarding");
    expect(readerMode("toggle")).toBe("both");
    expect(readerMode(undefined)).toBe("both");
  });
});
