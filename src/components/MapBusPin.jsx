import React, { useEffect, useRef, useState } from "react";

// Remembers which way a vehicle last moved east/west (kept for callers that
// only need left/right).
export function useFacingRight(lng) {
  const prev = useRef(lng);
  const [faceRight, setFaceRight] = useState(false);
  useEffect(() => {
    if (lng == null) return;
    if (prev.current != null) {
      const d = lng - prev.current;
      if (Math.abs(d) > 0.00002) setFaceRight(d > 0);
    }
    prev.current = lng;
  }, [lng]);
  return faceRight;
}

// Compass bearing (0 = north, clockwise) of the vehicle's travel, from its
// last two positions. Moves of under ~6 m are GPS jitter and ignored, so a
// parked bus keeps pointing the way it arrived. Falls back to `initial`.
export function useBearing(lat, lng, initial = 0) {
  const prev = useRef(null);
  const [bearing, setBearing] = useState(initial || 0);
  useEffect(() => {
    if (lat == null || lng == null) return;
    const p = prev.current;
    if (p) {
      const toRad = (d) => (d * Math.PI) / 180;
      const dLat = lat - p.lat;
      const dLng = (lng - p.lng) * Math.cos(toRad(lat));
      const meters = Math.sqrt(dLat * dLat + dLng * dLng) * 111320;
      if (meters < 6) return;
      const deg = (Math.atan2(dLng, dLat) * 180) / Math.PI;
      // Turn the shortest way round so 350° -> 10° doesn't spin a full circle.
      setBearing((b) => {
        const target = (deg + 360) % 360;
        let delta = target - (((b % 360) + 360) % 360);
        if (delta > 180) delta -= 360;
        if (delta < -180) delta += 360;
        return b + delta;
      });
    }
    prev.current = { lat, lng };
  }, [lat, lng]);
  return bearing;
}

// Dimensions of the bus box, in px: width (x), length (y), height (z).
const SIZES = { bus: { w: 22, l: 54, h: 19 }, taxi: { w: 19, l: 32, h: 13 } };
const PAINT = {
  bus: { body: "#F4F4F0", side: "#D9DAD3", roof: "#FFFFFF", stripe: "#C8F547" },
  taxi: { body: "#F7C948", side: "#DDAE2E", roof: "#FFD95E", stripe: "#1C1C1F" },
};
const GLASS = "#1D2430";

function Face({ style, children }) {
  return <div className="absolute" style={{ backfaceVisibility: "visible", ...style }}>{children}</div>;
}

// A small 3D vehicle built from CSS faces, tilted towards the viewer and
// rotated to its heading. A status-coloured glow sits under it and pulses
// while it is driving (faster for an emergency).
export function Vehicle3D({ kind = "bus", heading = 0, color = "#C8F547", driving = false, alert = false }) {
  const { w, l, h } = SIZES[kind] || SIZES.bus;
  const p = PAINT[kind] || PAINT.bus;
  const box = 72;

  return (
    <div className="relative" style={{ width: box, height: box, perspective: 520 }}>
      {/* ground glow + shadow (not tilted with the vehicle) */}
      <span
        className="absolute left-1/2 top-1/2 rounded-full"
        style={{ width: l * 1.05, height: l * 1.05, transform: "translate(-50%,-38%) scaleY(0.55)", background: `radial-gradient(circle, ${color}66 0%, ${color}22 45%, transparent 70%)` }}
      />
      {(driving || alert) && (
        <span
          className="absolute left-1/2 top-1/2 rounded-full animate-ping"
          style={{ width: l * 0.9, height: l * 0.9, transform: "translate(-50%,-38%) scaleY(0.55)", border: `2px solid ${color}`, opacity: 0.5, animationDuration: alert ? "1s" : "2.2s" }}
        />
      )}
      <div className={`absolute inset-0 ${driving ? "tt-bus-bob" : ""}`} style={{ transformStyle: "preserve-3d" }}>
        <div
          className="absolute left-1/2 top-1/2"
          style={{
            width: w, height: l, marginLeft: -w / 2, marginTop: -l / 2,
            transformStyle: "preserve-3d",
            transform: `rotateX(52deg) rotateZ(${heading}deg)`,
            transition: "transform 1.2s ease-out",
          }}
        >
          {/* shadow on the ground */}
          <Face style={{ inset: -2, background: "rgba(0,0,0,0.45)", filter: "blur(3px)", borderRadius: 6, transform: "translateZ(0)" }} />
          {/* left + right sides: windows band and a brand stripe */}
          {[0, w].map((x) => (
            <Face key={x} style={{ left: x, top: 0, width: h, height: l, transformOrigin: "left", transform: "rotateY(-90deg)", background: p.side, borderRadius: 2 }}>
              <div className="absolute" style={{ left: h * 0.42, width: h * 0.34, top: l * 0.12, bottom: l * 0.14, background: GLASS, borderRadius: 1.5 }} />
              <div className="absolute" style={{ left: h * 0.2, width: h * 0.12, top: 2, bottom: 2, background: p.stripe }} />
            </Face>
          ))}
          {/* front (top edge = direction of travel) with windscreen + lights */}
          <Face style={{ left: 0, top: 0, width: w, height: h, transformOrigin: "top", transform: "rotateX(90deg)", background: p.body, borderRadius: 3 }}>
            <div className="absolute" style={{ left: 2, right: 2, top: h * 0.4, height: h * 0.42, background: GLASS, borderRadius: 2 }} />
            <div className="absolute rounded-full" style={{ left: 2, top: h * 0.12, width: 3, height: 3, background: "#FFF6C8", boxShadow: "0 0 4px #FFF6C8" }} />
            <div className="absolute rounded-full" style={{ right: 2, top: h * 0.12, width: 3, height: 3, background: "#FFF6C8", boxShadow: "0 0 4px #FFF6C8" }} />
          </Face>
          {/* back */}
          <Face style={{ left: 0, top: l, width: w, height: h, transformOrigin: "top", transform: "rotateX(90deg)", background: p.side, borderRadius: 3 }}>
            <div className="absolute rounded-sm" style={{ left: 2, top: h * 0.14, width: 4, height: 2, background: "#FF4D4D" }} />
            <div className="absolute rounded-sm" style={{ right: 2, top: h * 0.14, width: 4, height: 2, background: "#FF4D4D" }} />
          </Face>
          {/* roof */}
          <Face style={{ inset: 0, transform: `translateZ(${h}px)`, background: p.roof, borderRadius: 4, boxShadow: `inset 0 0 0 1.5px ${color}` }}>
            {kind === "bus" ? (
              <div className="absolute rounded-sm" style={{ left: w * 0.22, right: w * 0.22, top: l * 0.35, height: l * 0.28, background: "#C9CBC4" }} />
            ) : (
              <div className="absolute rounded-sm" style={{ left: w * 0.25, right: w * 0.25, top: l * 0.42, height: 4, background: p.stripe }} />
            )}
            {/* front-edge highlight so the heading reads from above */}
            <div className="absolute" style={{ left: 0, right: 0, top: 0, height: 3, background: color, borderRadius: "4px 4px 0 0" }} />
          </Face>
        </div>
      </div>
    </div>
  );
}

// Map pin for a bus: the 3D bus pointing where it's heading, with a
// status-coloured glow (pulsing while on a trip).
export default function MapBusPin({ color, driving = false, alert = false, heading = 0, kind = "bus" }) {
  return <Vehicle3D kind={kind} heading={heading} color={color} driving={driving} alert={alert} />;
}
