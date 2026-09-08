import React from "react";
import { Wifi, WifiOff, CloudUpload } from "lucide-react";

export default function OfflineStatusBadge({ online, pendingCount }) {
  const queued = pendingCount > 0;
  if (online && !queued) {
    return (
      <span className="text-xs px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 inline-flex items-center gap-1.5">
        <Wifi className="w-3 h-3" /> Online
      </span>
    );
  }
  if (online && queued) {
    return (
      <span className="text-xs px-2.5 py-1 rounded-full bg-sky-500/10 text-sky-400 border border-sky-500/30 inline-flex items-center gap-1.5">
        <CloudUpload className="w-3 h-3 animate-pulse" /> Syncing {pendingCount}…
      </span>
    );
  }
  return (
    <span className="text-xs px-2.5 py-1 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/30 inline-flex items-center gap-1.5">
      <WifiOff className="w-3 h-3" /> Offline{queued ? ` · ${pendingCount} queued` : ""}
    </span>
  );
}