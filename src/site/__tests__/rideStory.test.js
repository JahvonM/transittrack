import { describe, expect, it } from "vitest";
import { SCENES, sceneAt, sceneProgress, scrollTopFor, storyProgress } from "@/site/rideStory";

describe("the website's opening", () => {
  it("has three shots", () => {
    expect(SCENES.map((s) => s.label)).toEqual(["Airport", "Island", "Track"]);
  });
  it("measures how far through the opening the page is", () => {
    expect(storyProgress(0, 3000, 1000)).toBe(0);
    expect(storyProgress(-1000, 3000, 1000)).toBe(0.5);
    expect(storyProgress(-9000, 3000, 1000)).toBe(1);
    expect(storyProgress(300, 3000, 1000)).toBe(0);
    expect(storyProgress(-100, 800, 1000)).toBe(0);
  });
  it("gives each shot its own 0 to 1", () => {
    expect(sceneProgress(1 / 6, 0)).toBeCloseTo(0.5);
    expect(sceneProgress(1 / 6, 1)).toBe(0);
    expect(sceneProgress(0.5, 1)).toBeCloseTo(0.5);
    expect(sceneProgress(0.9, 1)).toBe(1);
  });
  it("knows which shot is on screen", () => {
    expect(sceneAt(0)).toBe(0);
    expect(sceneAt(0.33)).toBe(0);
    expect(sceneAt(1 / 3)).toBe(1);
    expect(sceneAt(0.5)).toBe(1);
    expect(sceneAt(1)).toBe(2);
  });
  it("jumps a little way into a shot", () => {
    expect(scrollTopFor(0, 600, 3000, 1000)).toBe(600);
    expect(scrollTopFor(1, 600, 3000, 1000)).toBe(600 + Math.round(2000 * (1.3 / 3)));
    expect(scrollTopFor(2, 600, 3000, 1000)).toBe(600 + Math.round(2000 * (2.3 / 3)));
  });
});
