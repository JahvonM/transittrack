import React from "react";

// Turn arrows for the navigation banner and lane guidance, drawn the way
// Google Maps draws them. Angles are clockwise from straight ahead.
const ANGLE = {
  straight: 0,
  "slight right": 45,
  right: 90,
  "sharp right": 135,
  "slight left": -45,
  left: -90,
  "sharp left": -135,
};

function Arrow({ angle, strokeWidth = 2.6 }) {
  const a = (angle * Math.PI) / 180;
  const sx = Math.abs(angle) >= 90 ? 12 - 3 * Math.sign(angle) : 12; // give sharp turns room
  const px = sx;
  const py = Math.abs(angle) >= 90 ? 13 : 12;
  const len = Math.abs(angle) >= 90 ? 7.5 : 8;
  const ex = px + len * Math.sin(a);
  const ey = py - len * Math.cos(a);
  const dx = Math.sin(a);
  const dy = -Math.cos(a);
  const tip = [ex + 3.2 * dx, ey + 3.2 * dy];
  const left = [ex - 3.2 * dy, ey + 3.2 * dx];
  const right = [ex + 3.2 * dy, ey - 3.2 * dx];
  return (
    <>
      <path d={`M${sx} 22 L${px} ${py} L${ex} ${ey}`} fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
      <polygon points={`${tip.join(",")} ${left.join(",")} ${right.join(",")}`} fill="currentColor" />
    </>
  );
}

function UTurn({ mirror }) {
  // Turns back on the side the bus drives on (left-hand traffic turns right).
  return (
    <g transform={mirror ? "translate(24 0) scale(-1 1)" : undefined}>
      <path d="M16 22 V10 a4.5 4.5 0 0 0 -9 0 V15" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" />
      <polygon points="7,19.5 3.8,14.5 10.2,14.5" fill="currentColor" />
    </g>
  );
}

function Roundabout({ angle, mirror }) {
  const a = (angle * Math.PI) / 180;
  const cx = 12;
  const cy = 10;
  const r = 4.5;
  const ox = cx + r * Math.sin(a);
  const oy = cy - r * Math.cos(a);
  const ex = cx + 10 * Math.sin(a);
  const ey = cy - 10 * Math.cos(a);
  const dx = Math.sin(a);
  const dy = -Math.cos(a);
  return (
    <g transform={mirror ? "translate(24 0) scale(-1 1)" : undefined}>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="currentColor" strokeWidth="2.2" opacity="0.55" />
      <path d={`M12 22 V${cy + r} A${r} ${r} 0 ${angle < 0 ? 1 : 0} 1 ${ox} ${oy} L${ex - 2 * dx} ${ey - 2 * dy}`} fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
      <polygon points={`${ex + 1.5 * dx},${ey + 1.5 * dy} ${ex - 2.5 * dx - 3 * dy},${ey - 2.5 * dy + 3 * dx} ${ex - 2.5 * dx + 3 * dy},${ey - 2.5 * dy - 3 * dx}`} fill="currentColor" />
    </g>
  );
}

function Pin() {
  return (
    <>
      <path d="M12 22s-6.5-6.2-6.5-11.5a6.5 6.5 0 0 1 13 0C18.5 15.8 12 22 12 22z" fill="currentColor" />
      <circle cx="12" cy="10.5" r="2.4" fill="#122130" />
    </>
  );
}

// type/modifier come from Mapbox (turn, merge, fork, roundabout, arrive…).
export function ManeuverArrow({ type, modifier, drivingSide = "right", className = "w-10 h-10", title }) {
  const mirror = drivingSide === "left";
  let body;
  if (type === "arrive") body = <Pin />;
  else if (modifier === "uturn") body = <UTurn mirror={mirror} />;
  else if (type === "roundabout" || type === "rotary" || type === "roundabout turn" || type === "exit roundabout" || type === "exit rotary") {
    body = <Roundabout angle={ANGLE[modifier] ?? 0} mirror={mirror} />;
  } else body = <Arrow angle={ANGLE[modifier] ?? 0} />;
  return (
    <svg viewBox="0 0 24 24" className={className} role="img" aria-label={title || [type, modifier].filter(Boolean).join(" ")}>
      {body}
    </svg>
  );
}

// One lane of the lane-guidance strip: bright for lanes to use.
export function LaneArrow({ lane, drivingSide = "right" }) {
  const dir = (lane.active && lane.activeDirection) || lane.directions?.[0] || "straight";
  return (
    <svg viewBox="0 0 24 24" className={`w-7 h-7 ${lane.active ? "text-white" : "text-white/35"}`} aria-label={`${lane.active ? "Use" : "Not"} ${dir} lane`}>
      {dir === "uturn" ? <UTurn mirror={drivingSide === "left"} /> : <Arrow angle={ANGLE[dir] ?? 0} strokeWidth={2.4} />}
    </svg>
  );
}

// The "you are here" arrow: an ink chevron on a white disc with a lime ring,
// readable on both the light and dark map.
export function NavPuck({ size = 44 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 44 44" aria-label="Your bus">
      <circle cx="22" cy="22" r="20" fill="#122130" opacity="0.35" />
      <circle cx="22" cy="22" r="18" fill="#ffffff" />
      <circle cx="22" cy="22" r="18" fill="none" stroke="#C8EB2E" strokeWidth="3" />
      <path d="M22 8 L33 33 L22 27 L11 33 Z" fill="#122130" stroke="#ffffff" strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  );
}
