import { describe, expect, it } from "vitest";
import {
  BUS_360_MAX_FRAMES, sortedBus360Frames, wrapBus360Frame,
  stepBus360FromSwipe, validateBus360Photo,
} from "./vehicle360";

describe("360 vehicle photo viewer", () => {
  it("preserves chronological rotation order without changing original photos", () => {
    const input = [{ id: "b", createdAt: 2 }, { id: "a", createdAt: 1 }, { id: "c", createdAt: 2 }];
    expect(sortedBus360Frames(input).map((x) => x.id)).toEqual(["a", "b", "c"]);
    expect(input[0].id).toBe("b");
  });
  it("wraps angles left and right correctly", () => {
    expect(wrapBus360Frame(-1, 18)).toBe(17);
    expect(wrapBus360Frame(18, 18)).toBe(0);
    expect(wrapBus360Frame(38, 18)).toBe(2);
    expect(wrapBus360Frame(4, 0)).toBe(0);
  });
  it("swipes only after deliberate horizontal movement", () => {
    expect(stepBus360FromSwipe(5, 18)).toBe(0);
    expect(stepBus360FromSwipe(-50, 18)).toBe(1);
    expect(stepBus360FromSwipe(90, 18)).toBe(-2);
    expect(stepBus360FromSwipe(-100, 1)).toBe(0);
  });
  it("rejects unsupported photos and per-vehicle capacity overflow", () => {
    expect(validateBus360Photo({ type: "image/jpeg", size: 1024 }, 0)).toBeNull();
    expect(validateBus360Photo({ type: "image/gif", size: 100 }, 0)).toMatch(/JPG/);
    expect(validateBus360Photo({ type: "image/png", size: 21 * 1024 * 1024 }, 0)).toMatch(/20 MB/);
    expect(validateBus360Photo({ type: "image/webp", size: 0 }, 0)).toMatch(/20 MB/);
    expect(validateBus360Photo({ type: "image/webp", size: 100 }, BUS_360_MAX_FRAMES)).toMatch(/36/);
  });
});
