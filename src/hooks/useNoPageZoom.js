import { useEffect } from "react";

// For shared tablets only: stops accidental page pinch-zoom while mounted.
export default function useNoPageZoom() {
  useEffect(() => {
    const html = document.documentElement;
    html.classList.add("tt-no-page-zoom");
    return () => html.classList.remove("tt-no-page-zoom");
  }, []);
}
