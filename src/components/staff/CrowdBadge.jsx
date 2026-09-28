import React from "react";
import { Users } from "lucide-react";
import { crowdLevel } from "@/hooks/useCrowding";

const TONE = {
  free: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30",
  busy: "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30",
  full: "bg-red-500/15 text-red-700 dark:text-red-300 border-red-500/30",
  muted: "bg-muted text-muted-foreground border-border",
};

export default function CrowdBadge({ count = 0, capacity }) {
  const level = crowdLevel(count, capacity);
  if (!level) return null;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium whitespace-nowrap ${TONE[level.tone]}`}
      title={level.detail ? `${level.detail} seats taken` : undefined}
    >
      <Users className="w-3 h-3" aria-hidden="true" />
      {level.label}
      {level.detail && <span className="opacity-70">· {level.detail}</span>}
    </span>
  );
}
