import React from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

// Neutral shimmer blocks. Shapes match the components they stand in for so
// content does not jump when it arrives. Static under reduced motion.
export function SkeletonBlock({ className, ...props }) {
  return <div className={cn("tt-skeleton rounded-md", className)} aria-hidden="true" {...props} />;
}

export function SkeletonText({ lines = 3, className }) {
  return (
    <div className={cn("space-y-2", className)} aria-hidden="true">
      {Array.from({ length: lines }, (_, i) => <SkeletonBlock key={i} className={cn("h-3.5", i === lines - 1 ? "w-2/3" : "w-full")} />)}
    </div>
  );
}

export function SkeletonCard({ className }) {
  return (
    <div className={cn("space-y-4 rounded-lg border bg-card p-4", className)} aria-hidden="true">
      <div className="flex items-center gap-3"><SkeletonBlock className="h-10 w-10 rounded-full" /><div className="flex-1 space-y-2"><SkeletonBlock className="h-4 w-1/2" /><SkeletonBlock className="h-3 w-1/3" /></div></div>
      <SkeletonText lines={2} />
    </div>
  );
}

export function SkeletonStat({ className }) {
  return (
    <div className={cn("space-y-3 rounded-lg border bg-card p-4", className)} aria-hidden="true">
      <SkeletonBlock className="h-3.5 w-1/2" /><SkeletonBlock className="h-9 w-1/3" />
    </div>
  );
}

export function SkeletonList({ rows = 4, className }) {
  return (
    <div className={cn("divide-y rounded-lg border bg-card", className)} aria-hidden="true">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center gap-3 p-4"><SkeletonBlock className="h-9 w-9 rounded-md" /><div className="flex-1 space-y-2"><SkeletonBlock className="h-3.5 w-2/5" /><SkeletonBlock className="h-3 w-1/4" /></div><SkeletonBlock className="h-6 w-16 rounded-full" /></div>
      ))}
    </div>
  );
}

export function SkeletonTable({ rows = 5, cols = 4, className }) {
  return (
    <div className={cn("overflow-hidden rounded-lg border bg-card", className)} aria-hidden="true">
      <div className="flex gap-4 border-b bg-surface-2 px-4 py-3">{Array.from({ length: cols }, (_, i) => <SkeletonBlock key={i} className="h-3 flex-1" />)}</div>
      {Array.from({ length: rows }, (_, r) => (
        <div key={r} className="flex gap-4 border-b px-4 py-3.5 last:border-0">{Array.from({ length: cols }, (_, c) => <SkeletonBlock key={c} className={cn("h-3.5 flex-1", c === 0 && "max-w-[40%]")} />)}</div>
      ))}
    </div>
  );
}

// Centered spinner with a visible label, for loads that have no layout yet.
export function LoadingState({ label = "Loading…", className }) {
  return (
    <div role="status" className={cn("flex flex-col items-center justify-center gap-3 py-12 text-body-sm text-muted-foreground", className)}>
      <Loader2 className="h-6 w-6 animate-spin text-primary" aria-hidden="true" />
      <span>{label}</span>
    </div>
  );
}
