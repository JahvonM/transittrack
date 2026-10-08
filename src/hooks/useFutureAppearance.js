import { useEffect } from "react";
// Presentation only; never changes the saved theme preference.
export default function useFutureAppearance(enabled = true) {
 useEffect(() => {
  if (!enabled) return;
  const root = document.documentElement;
  root.classList.add("tt-future");
  return () => root.classList.remove("tt-future");
 }, [enabled]);
}
