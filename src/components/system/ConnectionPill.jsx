import React from "react";
import { Wifi, WifiOff, CloudUpload, Radio, Clock, SatelliteDish, PauseCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { toneOf, formatAge } from "./status";

// Connection / data-freshness pill. Purely presentational: callers decide the
// state from data they already have (navigator.onLine, queue counts,
// last_location_update via freshnessOf()).
const STATES = {
  online: { tone: "success", icon: Wifi, label: "Online" },
  offline: { tone: "warning", icon: WifiOff, label: "Offline" },
  syncing: { tone: "info", icon: CloudUpload, label: "Syncing" },
  live: { tone: "live", icon: Radio, label: "Live" },
  stale: { tone: "warning", icon: Clock, label: "Delayed signal" },
  lost: { tone: "offline", icon: SatelliteDish, label: "Signal lost" },
  paused: { tone: "neutral", icon: PauseCircle, label: "Paused" },
  unknown: { tone: "neutral", icon: SatelliteDish, label: "No location yet" },
};

export function ConnectionPill({ state = "online", count, ageMs, label, size = "md", className }) {
  const s = STATES[state] || STATES.unknown;
  const t = toneOf(s.tone);
  const Icon = s.icon;
  const parts = [label || s.label];
  if (count > 0) parts.push(state === "syncing" ? `${count} left` : `${count} saved`);
  if (ageMs != null && state !== "online" && state !== "offline") parts.push(formatAge(ageMs));
  return (
    <span
      role="status"
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border font-semibold whitespace-nowrap leading-none",
        size === "sm" ? "h-6 px-2 text-xs [&_svg]:size-3.5" : "h-7 px-2.5 text-xs [&_svg]:size-4",
        t.soft, t.text, className,
      )}
    >
      <Icon aria-hidden="true" className={cn("shrink-0", t.fg, state === "syncing" && "animate-pulse")} />
      {parts.join(" · ")}
    </span>
  );
}

export default ConnectionPill;
