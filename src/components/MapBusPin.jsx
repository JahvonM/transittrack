import React, { useEffect, useRef, useState } from "react";
import AnimatedBus from "@/components/AnimatedBus";

// Remembers which way a vehicle last moved east/west so the side-view bus
// faces its direction of travel. Tiny jitters are ignored so a parked bus
// with noisy GPS doesn't flip back and forth.
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

// Map pin with a little side-view bus: wheels spin and it bobs while driving,
// a status-coloured ring pulses while on a trip, and it flips to face the way
// it's heading. Colours stay dark-tile so it reads on light and dark maps.
export default function MapBusPin({ color, driving = false, faceRight = false, alert = false, imageUrl }) {
  return (
    <div className="flex flex-col items-center">
      <div className="relative">
        {(driving || alert) && (
          <span
            className="absolute -inset-1.5 rounded-2xl animate-ping opacity-40"
            style={{ border: `2px solid ${color}`, animationDuration: alert ? "1s" : "2s" }}
          />
        )}
        <div
          className="relative w-14 h-10 rounded-xl grid place-items-center overflow-hidden"
          style={{
            backgroundColor: "#1C1C1F",
            border: `2px solid ${color}`,
            boxShadow: driving ? `0 0 0 4px ${color}2E, 0 6px 14px rgba(0,0,0,0.55)` : "0 6px 14px rgba(0,0,0,0.55)",
          }}
        >
          {imageUrl ? (
            <img src={imageUrl} alt="" className="w-full h-full object-cover" />
          ) : (
            <div style={{ transform: faceRight ? "scaleX(-1)" : undefined, transition: "transform 300ms" }}>
              <AnimatedBus mode={driving ? "drive" : "still"} width={42} />
            </div>
          )}
        </div>
      </div>
      <div className="w-3 h-2 -mt-px" style={{ backgroundColor: color, clipPath: "polygon(50% 100%, 0 0, 100% 0)" }} />
    </div>
  );
}
