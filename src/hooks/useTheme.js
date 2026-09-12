import { useCallback, useEffect, useState } from "react";

const STORAGE_KEY = "tt_theme"; // "light" | "dark"

function getSystemPref() {
  if (typeof window === "undefined") return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function applyTheme(theme) {
  const root = document.documentElement;
  root.classList.remove("light", "dark");
  root.classList.add(theme);
}

/**
 * Simple light/dark theme toggle, persisted per-device in localStorage (the
 * app's CSS already defines both themes via .light/.dark classes on <html>,
 * this just gives the user a way to switch between them).
 */
export default function useTheme() {
  const [theme, setThemeState] = useState(() => {
    if (typeof window === "undefined") return "light";
    return localStorage.getItem(STORAGE_KEY) || getSystemPref();
  });

  useEffect(() => { applyTheme(theme); }, [theme]);

  const setTheme = useCallback((t) => {
    localStorage.setItem(STORAGE_KEY, t);
    setThemeState(t);
  }, []);

  const toggle = useCallback(() => setTheme(theme === "dark" ? "light" : "dark"), [theme, setTheme]);

  return { theme, setTheme, toggle };
}
