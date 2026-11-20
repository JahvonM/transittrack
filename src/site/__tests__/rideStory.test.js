import { describe, expect, it } from "vitest";
import { SCENES, sceneAt, sceneProgress, scrollTopFor, storyProgress } from "@/site/rideStory";

describe("the website's opening story", () => {
  it("has five shots", () => {
    expect(SCENES.map((s) => s.label)).toEqual(["McSween", "Airport", "Island", "Track", "Book"]);
  });
  it("measures how far through the story the page is", () => {
    expect(storyProgress(0, 5000, 1000)).toBe(0);
    expect(storyProgress(-2000, 5000, 1000)).toBe(0.5);
    expect(storyProgress(-9000, 5000, 1000)).toBe(1);
    expect(storyProgress(300, 5000, 1000)).toBe(0);
    expect(storyProgress(-100, 800, 1000)).toBe(0);
  });
  it("gives each shot its own 0 to 1", () => {
    expect(sceneProgress(0.1, 0)).toBeCloseTo(0.5);
    expect(sceneProgress(0.1, 1)).toBe(0);
    expect(sceneProgress(0.5, 2)).toBeCloseTo(0.5);
    expect(sceneProgress(0.9, 2)).toBe(1);
  });
  it("knows which shot is on screen", () => {
    expect(sceneAt(0)).toBe(0);
    expect(sceneAt(0.19)).toBe(0);
    expect(sceneAt(0.2)).toBe(1);
    expect(sceneAt(0.5)).toBe(2);
    expect(sceneAt(1)).toBe(4);
  });
  it("jumps a little way into a shot so its words show", () => {
    expect(scrollTopFor(0, 600, 5000, 1000)).toBe(600);
    expect(scrollTopFor(2, 600, 5000, 1000)).toBe(600 + Math.round(4000 * 0.49));
    expect(scrollTopFor(4, 600, 5000, 1000)).toBe(600 + Math.round(4000 * 0.89));
  });
});
