import React, { useEffect, useRef, useState } from "react";

const reducedMotion = () =>
  typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

// Animates a number from its previous value to the new one (from 0 on first
// render). Non-numeric values render as-is.
export default function CountUp({ value, duration = 900, className = "" }) {
  const target = Number(value);
  const valid = Number.isFinite(target);
  const [shown, setShown] = useState(valid && !reducedMotion() ? 0 : target);
  const fromRef = useRef(valid && !reducedMotion() ? 0 : target);

  useEffect(() => {
    if (!valid) return;
    if (reducedMotion()) {
      setShown(target);
      fromRef.current = target;
      return;
    }
    const from = fromRef.current;
    const start = performance.now();
    let raf;
    const step = (now) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setShown(from + (target - from) * eased);
      if (t < 1) raf = requestAnimationFrame(step);
      else fromRef.current = target;
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, valid, duration]);

  if (!valid) return <span className={className}>{value}</span>;
  return <span className={`tabular-nums ${className}`}>{Math.round(shown).toLocaleString()}</span>;
}
