import React, { useId, useState } from "react";

// Minimal inline trend line for a stat tile — single series (no legend
// needed: the tile's own title identifies it), thin 2px stroke, rounded
// data-ends, with a lightweight per-point hover tooltip. Colored via
// `currentColor` so it inherits the wrapping element's text-color class
// (theme/dark-mode consistent, no hardcoded hex).
export default function Sparkline({ data, className = "" }) {
  const id = useId();
  const [hoverIdx, setHoverIdx] = useState(null);
  const w = 100;
  const h = 28;
  if (!data || data.length < 2) return null;

  const values = data.map((d) => d.value);
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const range = max - min || 1;
  const stepX = w / (data.length - 1);
  const points = data.map((d, i) => ({
    x: i * stepX,
    y: h - ((d.value - min) / range) * (h - 6) - 3,
    ...d,
  }));
  const path = points.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");

  return (
    <div className={`relative ${className}`}>
      <svg viewBox={`0 0 ${w} ${h}`} width="100%" height={h} preserveAspectRatio="none" aria-hidden="true">
        <path d={path} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        {points.map((p, i) => (
          <circle key={`hit-${id}-${i}`} cx={p.x} cy={p.y} r={6} fill="transparent"
            onMouseEnter={() => setHoverIdx(i)} onMouseLeave={() => setHoverIdx(null)} style={{ cursor: "pointer" }} />
        ))}
        {points.map((p, i) => (
          <circle key={`dot-${id}-${i}`} cx={p.x} cy={p.y} r={hoverIdx === i ? 3 : 0} fill="currentColor" style={{ pointerEvents: "none" }} />
        ))}
      </svg>
      {hoverIdx != null && (
        <div
          className="absolute -top-6 px-1.5 py-0.5 rounded bg-foreground text-background text-[10px] font-medium whitespace-nowrap pointer-events-none z-10"
          style={{ left: `${(points[hoverIdx].x / w) * 100}%`, transform: "translateX(-50%)" }}
        >
          {points[hoverIdx].label}: {points[hoverIdx].value}
        </div>
      )}
    </div>
  );
}
