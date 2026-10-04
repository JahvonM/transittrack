import React from "react";
import { cn } from "@/lib/utils";
import { Loader2 } from "lucide-react";
import { toneOf } from "@/components/system/status";

// Presentation-only pieces of the Drive screen. They show values the
// dashboard already has; none of them start, stop or send anything.

/**
 * GPS, connection and tracking in one row. Each item:
 *   { key, icon, label, detail?, tone: live|success|warning|danger|info|offline|neutral }
 */
export function StatusStrip({ items, className }) {
  return (
    <ul className={cn("grid grid-cols-3 divide-x divide-border overflow-hidden rounded-xl border border-border bg-card", className)} aria-label="Bus status">
      {items.map(({ key, icon: Icon, label, detail, tone }) => {
        const t = toneOf(tone);
        const calm = tone === "success" || tone === "neutral";
        return (
          <li key={key} className={cn("flex min-w-0 items-center gap-2 px-2.5 py-2.5 sm:px-3", !calm && t.soft.split(" ")[0])}>
            <Icon className={cn("h-5 w-5 shrink-0", t.fg)} aria-hidden="true" />
            <span className="min-w-0" role="status">
              <span className={cn("block text-body-sm font-semibold leading-tight", calm ? "text-foreground" : t.text)}>{label}</span>
              {detail && <span className="block truncate text-caption text-muted-foreground">{detail}</span>}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * The stop the bus is heading to, in the biggest type on the rail, with
 * the route as a row of segments and time/distance from the turn-by-turn
 * directions when they're available.
 */
export function NextStopBlock({ stop, index, total, routeName, remainingS, remainingM, arrived, className }) {
  if (!stop) {
    return (
      <section className={cn("px-1", className)} aria-label="Next stop">
        <p className="text-body-sm text-muted-foreground">{total ? "Route finished" : "No route assigned"}</p>
        <p className="mt-1 text-title font-bold">{total ? "All stops done" : "Ask dispatch for a route"}</p>
      </section>
    );
  }
  const mins = remainingS != null ? Math.max(1, Math.round(remainingS / 60)) : null;
  const dist = remainingM == null ? null : remainingM < 1000 ? `${Math.round(remainingM / 10) * 10} m` : `${(remainingM / 1000).toFixed(1)} km`;
  return (
    <section className={cn("px-1", className)} aria-label="Next stop">
      <div className="flex items-end justify-between gap-4">
        <div className="min-w-0">
          <p className="text-body-sm text-muted-foreground">{arrived ? "Arrived at" : "Next stop"}</p>
          <p className="mt-0.5 truncate font-display text-[2.5rem] font-semibold leading-[1.05] tracking-[-0.01em]">{stop.name || `Stop ${index + 1}`}</p>
        </div>
        {!arrived && mins != null && (
          <p className="shrink-0 text-right">
            <span className="block font-display text-[2.5rem] font-semibold leading-[1.05] tabular-nums">{mins}<span className="ml-1 text-title-sm font-medium text-muted-foreground">min</span></span>
            {dist && <span className="block text-body-sm text-muted-foreground">{dist}</span>}
          </p>
        )}
      </div>
      {total > 1 && (
        <div className="mt-3">
          <div className="flex gap-1" aria-hidden="true">
            {Array.from({ length: total }, (_, i) => (
              <span key={i} className={cn("h-1.5 flex-1 rounded-full", i < index ? "bg-primary" : i === index ? "bg-primary/45" : "bg-muted")} />
            ))}
          </div>
          <p className="mt-1.5 truncate text-body-sm text-muted-foreground">
            Stop {index + 1} of {total}{routeName ? ` on ${routeName}` : ""}
          </p>
        </div>
      )}
    </section>
  );
}

// People aboard, from kiosk check-ins.
export function OnBoard({ count = 0, capacity, className }) {
  const pct = capacity ? Math.min(100, Math.round((count / capacity) * 100)) : null;
  const tone = pct == null ? "bg-primary" : pct >= 90 ? "bg-danger" : pct >= 60 ? "bg-warning" : "bg-success";
  return (
    <section className={cn("px-1", className)} aria-label="Passengers on board">
      <p className="flex items-baseline gap-2">
        <span className="font-display text-headline font-semibold tabular-nums">{count}</span>
        <span className="text-body text-muted-foreground">{capacity ? `of ${capacity} seats taken` : "on board"}</span>
      </p>
      {pct != null && (
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted" role="meter" aria-valuemin={0} aria-valuemax={capacity} aria-valuenow={count} aria-label="Seats taken">
          <div className={cn("h-full rounded-full transition-[width] duration-slow", tone)} style={{ width: `${pct}%` }} />
        </div>
      )}
    </section>
  );
}

/**
 * One half of the control deck. Shift and tracking each get one, side by
 * side, but each keeps its own handler. `primary` marks the next thing the
 * driver should do; at most one deck button is primary at a time.
 */
export function DeckButton({ icon: Icon, state, action, onClick, primary = false, disabled = false, busy = false, active = false, ariaLabel }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || busy}
      aria-label={ariaLabel}
      className={cn(
        "group flex min-h-[88px] w-full min-w-0 flex-col justify-between gap-2 rounded-xl border px-4 py-3 text-left transition-[background-color,transform] duration-fast active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60 disabled:active:scale-100",
        primary ? "border-primary bg-primary text-primary-foreground hover:shadow-md" : "border-border bg-card hover:bg-accent",
      )}
    >
      <span className={cn("flex items-center gap-1.5 text-body-sm", primary ? "text-primary-foreground" : "text-muted-foreground")}>
        {active && <span className={cn("h-2 w-2 shrink-0 rounded-full", primary ? "bg-primary-foreground" : "bg-primary tt-live-pulse text-primary")} aria-hidden="true" />}
        <span className="truncate">{state}</span>
      </span>
      <span className="flex items-center gap-2 text-title-sm font-bold leading-tight">
        {busy ? <Loader2 className="h-5 w-5 shrink-0 animate-spin" aria-hidden="true" /> : Icon && <Icon className="h-5 w-5 shrink-0" aria-hidden="true" />}
        <span className="min-w-0">{action}</span>
      </span>
    </button>
  );
}

// Things that need the driver now. Rendered only when there is something.
export function AttentionItem({ tone = "warning", icon: Icon, title, detail, action }) {
  const t = toneOf(tone);
  return (
    <div className={cn("flex items-center gap-3 rounded-xl border px-3 py-2.5", t.soft)} role={tone === "danger" ? "alert" : "status"}>
      {Icon && <Icon className={cn("h-5 w-5 shrink-0", t.fg)} aria-hidden="true" />}
      <div className="min-w-0 flex-1">
        <p className="truncate font-semibold">{title}</p>
        {detail && <p className="truncate text-body-sm text-muted-foreground">{detail}</p>}
      </div>
      {action}
    </div>
  );
}
