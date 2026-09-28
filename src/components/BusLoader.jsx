import React from "react";
import AnimatedBus from "@/components/AnimatedBus";

// The bus faces left, so the world streams past to the right. Each strip is
// drawn twice side by side and slid by half its width for a seamless loop.
function FarStrip() {
  const blocks = [[4, 18, 20, 22], [28, 8, 16, 32], [48, 22, 24, 18], [78, 12, 14, 28], [96, 20, 28, 20], [130, 6, 18, 34], [152, 16, 22, 24], [180, 24, 30, 16], [196, 10, 14, 30]];
  return (
    <svg width="220" height="40" viewBox="0 0 220 40" className="block shrink-0 text-foreground/[0.09]" aria-hidden="true">
      <g fill="currentColor">
        {blocks.map(([x, y, w, h]) => <rect key={x} x={x} y={y} width={w} height={h} rx="1.5" />)}
      </g>
      <g className="text-primary" fill="currentColor" fillOpacity="0.4">
        {[[32, 14], [84, 18], [134, 12], [158, 22]].map(([x, y]) => <rect key={x} x={x} y={y} width="3" height="4" rx="0.5" />)}
      </g>
    </svg>
  );
}

function NearStrip() {
  const palm = (x) => (
    <g key={x} fill="none" stroke="currentColor" strokeLinecap="round">
      <path d={`M${x} 46 C${x - 1} 36 ${x + 1} 28 ${x + 4} 20`} strokeWidth="2.5" />
      <path d={`M${x + 4} 20 C${x - 2} 16 ${x - 7} 18 ${x - 10} 22 M${x + 4} 20 C${x + 9} 15 ${x + 15} 16 ${x + 18} 21 M${x + 4} 20 C${x + 2} 14 ${x - 2} 11 ${x - 6} 11 M${x + 4} 20 C${x + 7} 14 ${x + 11} 11 ${x + 15} 11`} strokeWidth="2" />
    </g>
  );
  const post = (x) => (
    <g key={x} fill="currentColor">
      <rect x={x} y="14" width="2" height="32" rx="1" />
      <rect x={x - 5} y="13" width="9" height="2.5" rx="1.2" />
      <circle cx={x - 4} cy="17" r="1.6" className="text-primary" fill="currentColor" fillOpacity="0.7" />
    </g>
  );
  return (
    <svg width="220" height="46" viewBox="0 0 220 46" className="block shrink-0 text-foreground/[0.18]" aria-hidden="true">
      {palm(30)}
      {post(100)}
      {palm(160)}
      {post(206)}
    </svg>
  );
}

// Loading indicator: a little bus driving through town. Scenery scrolls at two
// speeds for depth, the road markings rush underneath, and the bus bounces on
// its suspension with wheels spinning, exhaust puffing and speed streaks behind.
export default function BusLoader({ label, fullScreen = false, className = "" }) {
  const fade = "linear-gradient(90deg, transparent 0, #000 16%, #000 84%, transparent 100%)";
  const inner = (
    <div className={`flex flex-col items-center gap-2 ${className}`} role="status" aria-label={label || "Loading"}>
      <div className="tt-loader relative overflow-hidden" style={{ width: 220, height: 92, maskImage: fade, WebkitMaskImage: fade }} aria-hidden="true">
        <div className="absolute left-0 flex tt-ld-far" style={{ bottom: 24, width: 440 }}>
          <FarStrip />
          <FarStrip />
        </div>
        <div className="absolute left-0 flex tt-ld-near" style={{ bottom: 20, width: 440 }}>
          <NearStrip />
          <NearStrip />
        </div>
        <div className="absolute inset-x-0 bottom-0 h-[22px] bg-foreground/[0.06] border-t border-foreground/15" />
        <div className="absolute inset-x-0 tt-ld-lane" style={{ bottom: 9, height: 3 }} />

        <div className="absolute" style={{ left: 162, bottom: 44 }}>
          <span className="tt-ld-speed" style={{ top: 0, animationDelay: "0s" }} />
          <span className="tt-ld-speed" style={{ top: 9, width: 16, animationDelay: "0.2s" }} />
          <span className="tt-ld-speed" style={{ top: 18, animationDelay: "0.4s" }} />
        </div>
        <div className="absolute" style={{ left: 160, bottom: 22 }}>
          <span className="tt-ld-puff" style={{ animationDelay: "0s" }} />
          <span className="tt-ld-puff" style={{ animationDelay: "0.3s" }} />
          <span className="tt-ld-puff" style={{ animationDelay: "0.6s" }} />
        </div>

        <div className="absolute" style={{ left: 48, bottom: 11 }}>
          <div className="tt-ld-bounce">
            <AnimatedBus mode="drive" width={116} />
          </div>
        </div>
      </div>
      {label && <p className="text-sm text-muted-foreground">{label}</p>}
    </div>
  );
  if (!fullScreen) return inner;
  return <div className="min-h-screen grid place-items-center bg-background">{inner}</div>;
}
