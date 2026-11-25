// The website's opening: one screen that stays put while scrolling moves it
// through a few full-screen shots. Plain maths, kept apart so it can be
// tested.

export const SCENES = [
  { id: "airport", label: "Airport" },
  { id: "island", label: "Island" },
  { id: "track", label: "Track" },
];

const clamp01 = (n) => Math.min(1, Math.max(0, n));

// How far through the opening the page is (0 to 1): 0 while its top is at
// the top of the screen, 1 once it has scrolled its whole extra height.
export function storyProgress(top, height, viewport) {
  const run = height - viewport;
  if (!(run > 0)) return 0;
  return clamp01(-top / run);
}

// Each shot's own progress (0 before it, 0 to 1 during, 1 after).
export function sceneProgress(p, index, count = SCENES.length) {
  return clamp01(p * count - index);
}

// The shot on screen.
export function sceneAt(p, count = SCENES.length) {
  return Math.min(count - 1, Math.max(0, Math.floor(p * count + 1e-6)));
}

// Where to scroll to land on a shot: a little way into it, so it has
// finished coming in.
export function scrollTopFor(index, sectionTop, height, viewport, count = SCENES.length) {
  const run = Math.max(0, height - viewport);
  const into = index === 0 ? 0 : (index + 0.3) / count;
  return Math.round(sectionTop + run * Math.min(1, into));
}
