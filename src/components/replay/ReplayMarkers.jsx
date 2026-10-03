import React from "react";
import { Bus } from "lucide-react";

const hhmm = (ms) => new Date(ms).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

export function stopLabel(s) {
  const mins = Math.round((s.to - s.from) / 60000);
  return `Stopped ${hhmm(s.from)}–${hhmm(s.to)} (${mins >= 60 ? `${Math.floor(mins / 60)}h ${mins % 60}m` : `${mins} min`})`;
}

export function ReplayBusIcon({ heading, color }) {
  return (
    <div className="relative w-9 h-9" aria-label="Bus">
      {heading != null && (
        <div className="absolute -inset-2.5" style={{ transform: `rotate(${heading}deg)` }}>
          <div className="mx-auto w-0 h-0" style={{ borderLeft: "6px solid transparent", borderRight: "6px solid transparent", borderBottom: `9px solid ${color}` }} />
        </div>
      )}
      <div className="w-9 h-9 rounded-full grid place-items-center shadow-lg" style={{ background: "#0B0B0D", border: `3px solid ${color}` }}>
        <Bus className="w-4 h-4" style={{ color }} />
      </div>
    </div>
  );
}

export function StopPin({ stop }) {
  return (
    <div title={stopLabel(stop)} className="w-5 h-5 rounded-full bg-amber-500 border-2 border-white shadow grid place-items-center text-[10px] font-bold text-black">
      P
    </div>
  );
}
