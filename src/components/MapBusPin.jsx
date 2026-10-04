import React, { useEffect, useRef, useState } from "react";
import { getModel } from "@/lib/vehicleModels";

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

const GLASS = "#1D2430";

function Face({ style, children }) {
  return <div className="absolute" style={{ backfaceVisibility: "visible", ...style }}>{children}</div>;
}

// A small 3D vehicle built from CSS faces, tilted towards the viewer and
// rotated to its heading. The look (size, paint, roof details) comes from the
// model catalogue in lib/vehicleModels. A status-coloured glow sits under it
// and pulses while it is driving (faster for an emergency).
export function Vehicle3D({ model = "city_bus", kind, heading = 0, color = "#C8F547", driving = false, alert = false, glow = true }) {
  const m = getModel(kind === "taxi" && model === "city_bus" ? "taxi" : model);
  const { w, l, h } = m;
  const stripe = m.stripe === "accent" ? color : m.stripe;
  const box = Math.max(72, l + 20);
  const decks = m.decks || 1;
  const band = (i) => ({ left: h * (decks === 2 ? 0.14 + i * 0.44 : 0.42), width: h * (decks === 2 ? 0.26 : m.tallGlass ? 0.44 : 0.34) });

  return (
    <div className="relative" style={{ width: box, height: box, perspective: 520 }}>
      {glow && (
        <span
          className="absolute left-1/2 top-1/2 rounded-full"
          style={{ width: l * 1.05, height: l * 1.05, transform: "translate(-50%,-38%) scaleY(0.55)", background: `radial-gradient(circle, ${color}66 0%, ${color}22 45%, transparent 70%)` }}
        />
      )}
      {glow && (driving || alert) && (
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
          {/* left + right sides: window band(s) and a stripe */}
          {[0, w].map((x) => (
            <Face key={x} style={{ left: x, top: 0, width: h, height: l, transformOrigin: "left", transform: "rotateY(-90deg)", background: `linear-gradient(90deg, #9ba4ac, ${m.side} 30%, ${m.body} 75%)`, borderRadius: 3 }}>
              {Array.from({ length: decks }, (_, i) => (
                <div key={i} className="absolute" style={{ ...band(i), top: l * 0.1, bottom: l * 0.12, background: `repeating-linear-gradient(0deg, transparent 0 9px, #65717c 9px 10px), linear-gradient(110deg,#101d2b,#456275 50%,#152432)`, borderRadius: 1.5 }} />
              ))}
              {[l * .18,l * .8].map(y => <div key={y} className="absolute rounded-full" style={{left:-3,top:y,width:8,height:8,background:"radial-gradient(circle,#a2acb4 0 25%,#20242b 28% 60%,#080d12 63%)",boxShadow:"0 1px 2px #0008"}} />)}
              <div className="absolute" style={{ left: h * (decks === 2 ? 0.07 : 0.2), width: Math.max(2, h * 0.1), top: 2, bottom: 2, background: stripe }} />
            </Face>
          ))}
          {/* front (top edge = direction of travel) with windscreen + lights */}
          <Face style={{ left: 0, top: 0, width: w, height: h, transformOrigin: "top", transform: "rotateX(90deg)", background: m.body, borderRadius: 3 }}>
            {decks === 2 && <div className="absolute" style={{ left: 2, right: 2, top: h * 0.62, height: h * 0.24, background: GLASS, borderRadius: 2 }} />}
            <div className="absolute" style={{ left: 2, right: 2, top: decks === 2 ? h * 0.22 : h * 0.4, height: decks === 2 ? h * 0.26 : h * 0.42, background: GLASS, borderRadius: 2 }} />
            <div className="absolute rounded-full" style={{ left: 2, top: h * 0.08, width: 3, height: 3, background: "#FFF6C8", boxShadow: "0 0 4px #FFF6C8" }} />
            <div className="absolute rounded-full" style={{ right: 2, top: h * 0.08, width: 3, height: 3, background: "#FFF6C8", boxShadow: "0 0 4px #FFF6C8" }} />
          </Face>
          {/* back */}
          <Face style={{ left: 0, top: l, width: w, height: h, transformOrigin: "top", transform: "rotateX(90deg)", background: m.side, borderRadius: 3 }}>
            <div className="absolute rounded-sm" style={{ left: 2, top: h * 0.1, width: 4, height: 2, background: "#FF4D4D" }} />
            <div className="absolute rounded-sm" style={{ right: 2, top: h * 0.1, width: 4, height: 2, background: "#FF4D4D" }} />
          </Face>
          {/* roof */}
          <Face style={{ inset: 0, transform: `translateZ(${h}px)`, background: `linear-gradient(100deg,${m.side},${m.roof} 45%,#b5bdc3)`, borderRadius: 4, boxShadow: `inset 0 0 0 1.5px ${color}` }}>
            {m.roofUnit === "ac" && <div className="absolute rounded-sm" style={{ left: w * 0.22, right: w * 0.22, top: l * 0.35, height: l * 0.28, background: "#C9CBC4" }} />}
            {m.roofUnit === "battery" && (
              <div className="absolute rounded-sm grid gap-[2px]" style={{ left: w * 0.18, right: w * 0.18, top: l * 0.22, height: l * 0.5, gridTemplateRows: "repeat(3, 1fr)" }}>
                {[0, 1, 2].map((i) => <div key={i} style={{ background: "#0F766E", borderRadius: 1 }} />)}
              </div>
            )}
            {m.roofUnit === "taxi" && <div className="absolute rounded-sm" style={{ left: w * 0.25, right: w * 0.25, top: l * 0.42, height: 4, background: stripe }} />}
            {decks === 2 && <div className="absolute" style={{ left: 2, right: 2, top: l * 0.3, height: 2, background: stripe, opacity: 0.8 }} />}
            {/* front-edge highlight so the heading reads from above */}
            <div className="absolute" style={{ left: 0, right: 0, top: 0, height: 3, background: color, borderRadius: "4px 4px 0 0" }} />
          </Face>
        </div>
      </div>
    </div>
  );
}

// Map pin: the vehicle's chosen 3D model pointing where it's heading, with a
// status-coloured glow (pulsing while on a trip).
export default function MapBusPin({ color, driving = false, alert = false, heading = 0, model = "city_bus", kind }) {
  return <Vehicle3D model={model} kind={kind} heading={heading} color={color} driving={driving} alert={alert} />;
}
