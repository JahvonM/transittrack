import React from "react";

// Side-view bus illustration with spinning wheels. Keyframes live in
// index.css (tt-*) and are disabled under prefers-reduced-motion.
//   mode="arrive": slides in from the right once, wheels rolling to a stop
//   mode="drive":  stays put, wheels spin and body bobs (pair with DrivingScene)
//   mode="still":  no motion
export default function AnimatedBus({ mode = "arrive", width = 240, className = "" }) {
  const height = Math.round((width * 112) / 240);
  const wheelClass = mode === "arrive" ? "tt-wheel tt-wheel-arrive" : mode === "drive" ? "tt-wheel tt-wheel-spin" : "tt-wheel";
  const outerClass = mode === "arrive" ? "tt-bus-arrive" : "";
  const innerClass = mode === "drive" ? "tt-bus-bob" : "";

  const wheel = (cx) => (
    <g className={wheelClass}>
      <circle cx={cx} cy="92" r="13" fill="#1C1C1F" stroke="#3F3F46" strokeWidth="3" />
      <path d={`M${cx} 83 V101 M${cx - 7.8} 87.5 L${cx + 7.8} 96.5 M${cx - 7.8} 96.5 L${cx + 7.8} 87.5`} stroke="#52525B" strokeWidth="2" />
      <circle cx={cx} cy="92" r="4.5" fill="#A1A1AA" />
      <circle cx={cx} cy="81.5" r="1.8" fill="#D6F54A" />
    </g>
  );

  return (
    <div className={`${outerClass} ${className}`} aria-hidden="true">
      <div className={innerClass}>
        <svg width={width} height={height} viewBox="0 0 240 112" style={{ display: "block", overflow: "visible" }}>
          <ellipse cx="122" cy="104" rx="106" ry="5" fill="#000" fillOpacity="0.45" />
          <rect x="44" y="3" width="120" height="8" rx="3" fill="#D4D4D8" />
          <path d="M24 8 H218 Q230 8 230 20 V84 Q230 90 224 90 H16 Q10 90 10 84 V36 C10 20 14 8 24 8 Z" fill="#F4F4F5" />
          <rect x="10" y="60" width="220" height="6" fill="#D6F54A" />
          <rect x="10" y="76" width="220" height="14" rx="5" fill="#2A2A2E" />
          <path d="M15 40 C15 26 19 16 30 16 H42 V56 H15 Z" fill="#18181B" />
          <rect x="21" y="19" width="17" height="6" rx="2" fill="#D6F54A" />
          <rect x="48" y="16" width="24" height="68" rx="3" fill="#18181B" />
          <path d="M60 18 V82" stroke="#3F3F46" strokeWidth="1.5" />
          {[80, 116, 152, 188].map((x) => (
            <rect key={x} x={x} y="16" width="30" height="36" rx="5" fill="#18181B" />
          ))}
          <rect x="11" y="68" width="9" height="6" rx="2" fill="#FEF9C3" />
          <rect x="225" y="66" width="5" height="10" rx="1.5" fill="#F87171" />
          <path d="M40 90 A18 18 0 0 1 76 90 Z" fill="#09090B" />
          <path d="M172 90 A18 18 0 0 1 208 90 Z" fill="#09090B" />
          {wheel(58)}
          {wheel(190)}
        </svg>
      </div>
    </div>
  );
}

// Buildings + palms, drawn twice side by side so the scroll loops seamlessly.
function Skyline() {
  const buildings = [
    [0, 110, 70, 90], [76, 60, 48, 140], [130, 130, 46, 70], [228, 40, 56, 160],
    [290, 96, 80, 104], [376, 74, 44, 126], [476, 120, 104, 80], [586, 50, 50, 150], [642, 104, 64, 96],
  ];
  const palm = (x) => (
    <g key={x} fill="none" stroke="currentColor" strokeLinecap="round">
      <path d={`M${x} 200 C${x - 2} 170 ${x + 4} 150 ${x + 10} 132`} strokeWidth="6" />
      <path d={`M${x + 10} 132 C${x - 4} 124 ${x - 16} 128 ${x - 24} 138 M${x + 10} 132 C${x + 22} 122 ${x + 36} 124 ${x + 44} 134 M${x + 10} 132 C${x + 4} 118 ${x - 4} 112 ${x - 14} 110 M${x + 10} 132 C${x + 16} 118 ${x + 26} 112 ${x + 36} 112`} strokeWidth="5" />
    </g>
  );
  return (
    <svg width="706" height="200" viewBox="0 0 706 200" className="block shrink-0 text-foreground/[0.07]">
      <g fill="currentColor">
        {buildings.map(([x, y, w, h]) => <rect key={x} x={x} y={y} width={w} height={h} rx="3" />)}
      </g>
      {palm(200)}
      {palm(445)}
      <g className="text-primary" fill="currentColor" fillOpacity="0.45">
        {[[90, 76], [244, 60], [306, 112], [600, 70]].map(([x, y]) => <rect key={x} x={x} y={y} width="6" height="8" rx="1" />)}
      </g>
    </svg>
  );
}

// Ambient "bus on the road" strip: the bus stays centred while the skyline
// and lane markings scroll past, so it reads as driving without leaving frame.
export function DrivingScene({ height = 200, busWidth = 280, className = "" }) {
  return (
    <div className={`relative overflow-hidden ${className}`} style={{ height }} aria-hidden="true">
      <div className="absolute left-0 flex tt-sky-scroll" style={{ bottom: 56, width: 1412, height: 200 }}>
        <Skyline />
        <Skyline />
      </div>
      <div className="absolute inset-x-0 bottom-3 h-12 bg-foreground/[0.05] border-t border-foreground/10" />
      <div className="absolute inset-x-0 tt-lane-scroll" style={{ bottom: 18, height: 5 }} />
      <div className="absolute left-1/2 -translate-x-1/2" style={{ bottom: 30 }}>
        <AnimatedBus mode="drive" width={busWidth} />
      </div>
    </div>
  );
}
