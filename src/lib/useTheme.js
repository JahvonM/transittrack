import { useEffect, useState } from "react";

// v2: the old key was written on every mount (not just explicit choices), so
// it can't tell a real preference from an OS default — reset once for the
// dark + lime redesign.
const STORAGE_KEY = "tt-theme-v2";

function applyClass(theme) {
  const root = document.documentElement;
  root.classList.remove("dark", "light");
  if (theme === "dark" || theme === "light") root.classList.add(theme);
}

function initialTheme() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === "dark" || saved === "light") return saved;
  } catch {
    /* ignore */
  }
  return "dark";
}

// Tracks the live <html> class rather than holding its own state, so
// components that only need to *react* to the theme (e.g. picking a map
// style) update the moment any toggle anywhere flips it.
export function useIsDark() {
  const read = () => !document.documentElement.classList.contains("light");
  const [isDark, setIsDark] = useState(read);
  useEffect(() => {
    const obs = new MutationObserver(() => setIsDark(read()));
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => obs.disconnect();
  }, []);
  return isDark;
}

export function useTheme() {
  const [theme, setTheme] = useState(initialTheme);

  useEffect(() => {
    applyClass(theme);
    try {
      localStorage.setItem(STORAGE_KEY, theme);
    } catch {
      /* ignore */
    }
  }, [theme]);

  const toggle = () => setTheme((t) => (t === "dark" ? "light" : "dark"));

  return { theme, setTheme, toggle };
}