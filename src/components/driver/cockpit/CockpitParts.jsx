import React from "react";
import { cn } from "@/lib/utils";
import { Loader2 } from "lucide-react";
import { toneOf } from "@/components/system/status";

// Presentation-only pieces of the Drive screen. They show values the
// dashboard already has; none of them start, stop or send anything.

/**
 * GPS, connection and tracking in one row. Each item:
 *   { key, icon, label, detail?, tone: live|success|warning|danger|info|offline|neutral,
 *     onClick?, actionLabel? }  — with onClick the item is a button.
 */
export function StatusStrip({ items, className }) {
  return (
    <ul className={cn("grid grid-cols-3 divide-x divide-border overflow-hidden rounded-xl border border-border bg-card", className)} aria-label="Bus status">
      {items.map(({ key, icon: Icon, label, detail, tone, onClick, actionLabel }) => {
        const t = toneOf(tone);
        const calm = tone === "success" || tone === "neutral";
        const body = (
          <>
            <Icon className={cn("h-5 w-5 shrink-0", t.fg)} aria-hidden="true" />
            <span className="min-w-0" role="status">
              <span className={cn("block text-body-sm font-semibold leading-tight", calm ? "text-foreground" : t.text)}>{label}</span>
              {detail && <span className="block truncate text-caption text-muted-foreground">{detail}</span>}
              {onClick && actionLabel && <span className={cn("block truncate text-caption font-semibold underline underline-offset-2", calm ? "text-foreground" : t.text)}>{actionLabel}</span>}
            </span>
          </>
        );
        return (
          <li key={key} className={cn("min-w-0", !calm && t.soft.split(" ")[0])}>
            {onClick ? (
              <button type="button" onClick={onClick} aria-label={`${label}. ${actionLabel || ""}`.trim()}
                className="flex w-full min-w-0 items-center gap-2 px-2.5 py-2.5 sm:px-3 text-left hover:bg-accent/60 active:bg-accent">
                {body}
              </button>
            ) : (
              <div className="flex min-w-0 items-center gap-2 px-2.5 py-2.5 sm:px-3">{body}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/**
 * One half of the control deck. Shift and tracking each get one, side by
 * side, but each keeps its own handler. `primary` marks the next thing the
 * driver should do; at most one deck button is primary at a time.
 */
export function DeckButton({ icon: Icon, state, action, onClick, primary = false, danger = false, disabled = false, busy = false, active = false, ariaLabel }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || busy}
      aria-label={ariaLabel}
      className={cn(
        "group flex min-h-[88px] w-full min-w-0 flex-col justify-between gap-2 rounded-xl border px-4 py-3 text-left transition-[background-color,transform] duration-fast active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60 disabled:active:scale-100",
        primary ? "border-primary bg-primary text-primary-foreground hover:shadow-md"
          : danger ? "border-danger/50 bg-danger/12 text-danger hover:border-danger"
            : "border-border bg-card hover:bg-accent",
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
