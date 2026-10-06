import React from "react";
import { Wifi, WifiOff } from "lucide-react";
import { cn } from "@/lib/utils";

// Small always-visible connection light for the shared kiosk tablets: green
// when the tablet is reaching the server, red when it isn't. Presentational
// only — the caller passes the online state it already tracks.
export default function KioskConnectionBadge({ online, className = "" }) {
  const Icon = online ? Wifi : WifiOff;
  return (
    <span
      role="status"
      aria-label={online ? "Connected" : "Not connected"}
      title={online ? "Connected" : "Not connected"}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold leading-none",
        online ? "border-success/40 bg-success/10 text-success" : "border-destructive/40 bg-destructive/10 text-destructive",
        className,
      )}
    >
      <Icon className="w-4 h-4 shrink-0" aria-hidden="true" />
      <span className="hidden sm:inline">{online ? "Connected" : "Offline"}</span>
    </span>
  );
}