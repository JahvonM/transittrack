import { useEffect, useRef, useState } from "react";

// How many rows of `rowHeight` (plus `gap`) fit in the element's current
// height — lets a list show as many items as the screen has room for, with
// the rest behind "See all", instead of scrolling.
export default function useFitCount(rowHeight, { gap = 8, min = 1 } = {}) {
  const ref = useRef(null);
  const [count, setCount] = useState(min);
  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const measure = () => {
      const h = el.clientHeight;
      setCount(Math.max(min, Math.floor((h + gap) / (rowHeight + gap))));
    };
    measure();
    if (typeof ResizeObserver === "undefined") return undefined;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [rowHeight, gap, min]);
  return [ref, count];
}
