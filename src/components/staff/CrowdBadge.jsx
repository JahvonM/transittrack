import React from "react";
import { Users } from "lucide-react";
import { crowdLevel } from "@/hooks/useCrowding";

const TONE = {
  free: "bg-success/15 text-success border-success/30",
  busy: "bg-warning/15 text-warning border-warning/30",
  full: "bg-danger/15 text-danger border-danger/30",
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
