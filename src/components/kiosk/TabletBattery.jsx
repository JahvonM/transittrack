import React from "react";
import { Zap } from "lucide-react";
import { batteryState, useTabletBattery } from "@/lib/tabletBattery";

// The tablet's battery for the top of every kiosk screen: a small battery that
// empties with the charge, the percentage, and a bolt while charging. Red at
// 15% and below, amber at 30% and below, while not charging. Hidden when the
// tablet gives no reading.
export default function TabletBattery({ className = "" }) {
  const reading = useTabletBattery();
  if (!reading) return null;
  const { level, charging } = reading;
  const label = `Battery ${level}%${charging ? ", charging" : ""}`;
  return (
    <span className={`tt-battery ${className}`} data-state={batteryState(reading)} role="img" aria-label={label} title={label}>
      <svg className="tt-battery-icon" viewBox="0 0 26 14" aria-hidden="true" focusable="false">
        <rect x="0.75" y="0.75" width="21.5" height="12.5" rx="3" fill="none" stroke="currentColor" strokeWidth="1.5" />
        <rect x="23.25" y="4.5" width="2" height="5" rx="1" fill="currentColor" />
        <rect x="3" y="3" width={Math.max(1, 17 * level / 100)} height="8" rx="1.5" fill="currentColor" />
      </svg>
      {charging && <Zap className="tt-battery-bolt" aria-hidden="true" />}
      <span>{level}%</span>
    </span>
  );
}
