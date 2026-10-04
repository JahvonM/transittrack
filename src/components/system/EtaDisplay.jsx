import React from "react";
import { Sparkles, Ruler } from "lucide-react";
import { cn } from "@/lib/utils";

const SIZES = {
  sm: { num: "text-headline", unit: "text-body-sm", word: "text-title-sm" },
  md: { num: "text-[2.75rem] leading-none", unit: "text-body", word: "text-title" },
  lg: { num: "text-hero", unit: "text-title-sm", word: "text-headline" },
  xl: { num: "text-[4.5rem] leading-none", unit: "text-title", word: "text-display" },
};

// The ETA as the strongest element on screen. Shows only what the caller
// knows: minutes, or a word state when there is no number. It never invents
// "on time" or "late" — there is no timetable to compare against.
//   state: "minutes" | "arriving" | "not_started" | "no_signal" | "unknown"
//   source: "learned" (from real trips) | "estimated" (distance/speed) | null
export function EtaDisplay({ minutes, state, source, samples, size = "lg", label = "Arrives in", className, align = "start" }) {
  const sz = SIZES[size] || SIZES.lg;
  const resolved = state || (minutes == null ? "unknown" : minutes <= 1 ? "arriving" : "minutes");
  const words = { arriving: "Arriving now", not_started: "Not started", no_signal: "No live signal", unknown: "ETA unavailable" };
  const spoken = resolved === "minutes" ? `${label} ${Math.round(minutes)} minutes` : words[resolved];
  return (
    <div className={cn("flex flex-col gap-1", align === "center" && "items-center text-center", align === "end" && "items-end text-right", className)}>
      {resolved === "minutes" && label && <span className="text-caption font-semibold uppercase tracking-wider text-muted-foreground">{label}</span>}
      <p className="flex items-baseline gap-1.5 leading-none">
        <span className="sr-only">{spoken}</span>
        {resolved === "minutes" ? (
          <>
            <span className={cn("font-display font-bold tabular-nums", sz.num, "text-foreground")} aria-hidden="true">{Math.round(minutes)}</span>
            <span className={cn("font-semibold text-muted-foreground", sz.unit)} aria-hidden="true">min</span>
          </>
        ) : (
          <span aria-hidden="true" className={cn("font-display font-bold", sz.word, resolved === "arriving" ? "text-primary" : "text-foreground")}>{words[resolved]}</span>
        )}
      </p>
      {source && resolved !== "not_started" && resolved !== "unknown" && (
        <span className="inline-flex items-center gap-1 text-caption text-muted-foreground">
          {source === "learned" ? <Sparkles className="h-3.5 w-3.5" aria-hidden="true" /> : <Ruler className="h-3.5 w-3.5" aria-hidden="true" />}
          {source === "learned" ? `Based on ${samples ? `${samples} real trips` : "real trips"}` : "Estimated from distance"}
        </span>
      )}
    </div>
  );
}

export default EtaDisplay;
