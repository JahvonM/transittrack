import React from "react";
import { cn } from "@/lib/utils";

// Stop states come from the caller (which already knows where the bus is):
// `passedCount` stops are behind the bus, `nextIndex` is the stop it is
// heading to, `highlightIndex` is the rider's own stop.
function stateOf(i, { passedCount = 0, nextIndex }) {
  if (i === nextIndex) return "next";
  return i < passedCount ? "passed" : "upcoming";
}

// Horizontal line map, like the strip above a train door. Shows every stop
// as a marker; names are shown for the ends and the next stop to stay
// readable on phones. `progress` (0..1) places the bus between stops.
export function RouteStrip({ stops = [], passedCount = 0, nextIndex, highlightIndex, progress, label, className }) {
  const n = stops.length;
  if (!n) return null;
  const pos = (i) => (n === 1 ? 50 : (i / (n - 1)) * 100);
  const bus = progress != null ? Math.min(100, Math.max(0, progress * 100)) : passedCount > 0 ? pos(Math.min(n - 1, passedCount - 1)) : null;
  const next = nextIndex != null ? stops[nextIndex] : null;
  const summary = [label, next && `Next stop: ${next.name}`, `${Math.min(passedCount, n)} of ${n} stops passed`].filter(Boolean).join(". ");
  return (
    <figure className={cn("w-full", className)} aria-label={summary}>
      {(label || next) && (
        <figcaption className="mb-3 flex items-baseline justify-between gap-3 text-body-sm">
          {label && <span className="truncate font-semibold">{label}</span>}
          {next && <span className="shrink-0 truncate text-muted-foreground">Next: <span className="font-semibold text-foreground">{next.name}</span></span>}
        </figcaption>
      )}
      <div className="relative mx-2 h-6" aria-hidden="true">
        <div className="absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 rounded-full bg-border" />
        {bus != null && <div className="absolute left-0 top-1/2 h-1 -translate-y-1/2 rounded-full bg-primary transition-[width] duration-slow ease-out-soft" style={{ width: `${bus}%` }} />}
        {stops.map((s, i) => {
          const st = stateOf(i, { passedCount, nextIndex });
          const mine = i === highlightIndex;
          return (
            <span
              key={i}
              className={cn(
                "absolute top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border-2",
                n > 14 ? "h-2.5 w-2.5" : "h-3.5 w-3.5",
                st === "passed" && "border-primary bg-primary",
                st === "next" && "h-4 w-4 border-primary bg-background ring-4 ring-primary/25",
                st === "upcoming" && "border-muted-foreground/60 bg-background",
                mine && "border-foreground bg-foreground",
              )}
              style={{ left: `${pos(i)}%` }}
            />
          );
        })}
        {bus != null && (
          <span className="absolute top-1/2 h-5 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-background bg-primary shadow-md transition-[left] duration-slow ease-out-soft" style={{ left: `${bus}%` }} />
        )}
      </div>
      <div className="mt-2 flex justify-between gap-3 text-caption text-muted-foreground">
        <span className="truncate">{stops[0]?.name}</span>
        {n > 1 && <span className="truncate text-right">{stops[n - 1]?.name}</span>}
      </div>
    </figure>
  );
}

// Vertical stop list with the same states. `meta(stop, i)` can return a
// small right-hand label such as an arrival time.
export function StopList({ stops = [], passedCount = 0, nextIndex, highlightIndex, meta, className }) {
  return (
    <ol className={cn("relative", className)}>
      {stops.map((s, i) => {
        const st = stateOf(i, { passedCount, nextIndex });
        const mine = i === highlightIndex;
        const last = i === stops.length - 1;
        return (
          <li key={i} className="relative flex min-h-12 gap-3 pb-1" aria-current={st === "next" ? "step" : undefined}>
            <div className="relative flex w-5 shrink-0 justify-center" aria-hidden="true">
              {!last && <span className={cn("absolute top-3 bottom-[-0.25rem] w-1 rounded-full", i < passedCount ? "bg-primary" : "bg-border")} />}
              <span className={cn(
                "relative z-10 mt-1 h-4 w-4 rounded-full border-2",
                st === "passed" && "border-primary bg-primary",
                st === "next" && "border-primary bg-background ring-4 ring-primary/25",
                st === "upcoming" && "border-muted-foreground/60 bg-background",
                mine && "border-foreground bg-foreground",
              )} />
            </div>
            <div className="flex min-w-0 flex-1 items-start justify-between gap-3 pb-3">
              <div className="min-w-0">
                <p className={cn("truncate text-body-sm", st === "passed" ? "text-muted-foreground" : "font-semibold")}>{s.name}</p>
                <p className="text-caption text-muted-foreground">
                  {[st === "next" && "Next stop", st === "passed" && "Passed", mine && "Your stop"].filter(Boolean).join(" · ")}
                </p>
              </div>
              {meta && <span className="shrink-0 text-body-sm tabular-nums text-muted-foreground">{meta(s, i)}</span>}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

export default RouteStrip;
