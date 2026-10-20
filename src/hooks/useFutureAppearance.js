import { useEffect } from "react";
// Presentation only; never changes the saved theme preference.
// `extra` adds another class while mounted (the passenger app adds
// "tt-passenger-app", which lets its screens follow Light/Dark and the colour
// theme from Account → Appearance).
export default function useFutureAppearance(enabled = true, extra = "") {
 useEffect(() => {
  if (!enabled) return;
  const root = document.documentElement;
  root.classList.add("tt-future");
  if (extra) root.classList.add(extra);
  return () => { root.classList.remove("tt-future"); if (extra) root.classList.remove(extra); };
 }, [enabled, extra]);
}
