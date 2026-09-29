// Colour themes. Each swaps the accent (buttons, highlights, map routes, the
// on-trip glow) in both modes. Dark mode uses a bright accent with near-black
// text on it; light mode uses a deeper shade that stays readable as text on
// white and under white button text. The CSS for each lives in index.css
// (html[data-accent="…"]); the swatch here is just for the picker.
export const ACCENTS = [
  { id: "lime", label: "Lime", swatch: "#D6F54A" },
  { id: "ocean", label: "Ocean", swatch: "#38BDF8" },
  { id: "sunset", label: "Sunset", swatch: "#FB923C" },
  { id: "rose", label: "Rose", swatch: "#F472B6" },
  { id: "violet", label: "Violet", swatch: "#A78BFA" },
  { id: "mint", label: "Mint", swatch: "#34D399" },
  { id: "gold", label: "Gold", swatch: "#FACC15" },
];

export const ACCENT_KEY = "tt-accent";
export const ACCENT_EVENT = "tt-accent-change";

export function currentAccent() {
  try {
    const a = localStorage.getItem(ACCENT_KEY);
    if (ACCENTS.some((x) => x.id === a)) return a;
  } catch { /* storage blocked */ }
  return "lime";
}

export function applyAccent(id) {
  const accent = ACCENTS.some((x) => x.id === id) ? id : "lime";
  document.documentElement.setAttribute("data-accent", accent);
  try { localStorage.setItem(ACCENT_KEY, accent); } catch { /* storage blocked */ }
  try { window.dispatchEvent(new Event(ACCENT_EVENT)); } catch { /* non-browser */ }
  return accent;
}

function hslToHex(h, s, l) {
  s /= 100; l /= 100;
  const k = (n) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n) => Math.round(255 * (l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)))));
  return "#" + [f(0), f(8), f(4)].map((x) => x.toString(16).padStart(2, "0")).join("").toUpperCase();
}

// The live accent as a hex colour, for things CSS variables can't reach
// (Mapbox paint properties, SVG gradients built from strings).
export function accentHex() {
  try {
    const raw = getComputedStyle(document.documentElement).getPropertyValue("--primary").trim();
    const [h, s, l] = raw.replace(/%/g, "").split(/\s+/).map(Number);
    if ([h, s, l].every(Number.isFinite)) return hslToHex(h, s, l);
  } catch { /* SSR / no DOM */ }
  return "#D6F54A";
}
