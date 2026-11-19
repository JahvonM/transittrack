import { useEffect } from "react";

// The Workshop's light parts-catalogue look (index.css, html.tt-workshop)
// while it is open. Presentation only: the saved Light/Dark choice is kept.
export default function useWorkshopAppearance() {
  useEffect(() => {
    const root = document.documentElement;
    const before = root.style.colorScheme;
    root.classList.add("tt-workshop");
    root.style.colorScheme = "light";
    return () => { root.classList.remove("tt-workshop"); root.style.colorScheme = before; };
  }, []);
}
