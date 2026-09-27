import React from "react";
import AnimatedBus from "@/components/AnimatedBus";

// Loading indicator: a small bus driving along a scrolling road.
export default function BusLoader({ label, fullScreen = false, className = "" }) {
  const inner = (
    <div className={`flex flex-col items-center gap-2 ${className}`} role="status" aria-label={label || "Loading"}>
      <div className="relative w-40 h-14 overflow-hidden">
        <div className="absolute inset-x-0 bottom-1.5 tt-lane-scroll" style={{ height: 3 }} />
        <div className="absolute left-1/2 -translate-x-1/2 bottom-2.5">
          <AnimatedBus mode="drive" width={96} />
        </div>
      </div>
      {label && <p className="text-sm text-muted-foreground">{label}</p>}
    </div>
  );
  if (!fullScreen) return inner;
  return <div className="min-h-screen grid place-items-center bg-background">{inner}</div>;
}
