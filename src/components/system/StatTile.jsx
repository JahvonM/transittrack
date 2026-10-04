import React from "react";
import { cn } from "@/lib/utils";
import { toneOf } from "./status";

// One number with its label. Tone colours only the small icon chip and the
// accent bar, so a row of tiles stays calm. Clickable when given onClick.
export function StatTile({ label, value, unit, hint, icon: Icon, tone = "neutral", onClick, active = false, className, children }) {
  const t = toneOf(tone);
  const Comp = onClick ? "button" : "div";
  return (
    <Comp
      type={onClick ? "button" : undefined}
      onClick={onClick}
      aria-pressed={onClick && active ? true : undefined}
      className={cn(
        "relative flex min-w-0 flex-col gap-2 overflow-hidden rounded-lg border bg-card p-4 text-left",
        onClick && "transition-[border-color,background-color,transform] duration-fast ease-out-soft hover:border-foreground/20 hover:bg-surface-2 active:scale-[0.99]",
        active && "border-primary/60",
        className,
      )}
    >
      {tone !== "neutral" && <span className={cn("absolute inset-y-0 left-0 w-1", t.dot)} aria-hidden="true" />}
      <div className="flex items-center justify-between gap-2">
        <span className="line-clamp-2 text-body-sm font-medium text-muted-foreground">{label}</span>
        {Icon && (
          <span className={cn("grid h-8 w-8 shrink-0 place-items-center rounded-md", tone === "neutral" ? "bg-surface-2 text-muted-foreground" : cn(t.soft, t.fg, "border"))} aria-hidden="true">
            <Icon className="h-4 w-4" />
          </span>
        )}
      </div>
      <p className="flex items-baseline gap-1 leading-none">
        <span className="font-display text-display tabular-nums">{value ?? "—"}</span>
        {unit && <span className="text-body-sm font-medium text-muted-foreground">{unit}</span>}
      </p>
      {hint && <p className="truncate text-caption text-muted-foreground">{hint}</p>}
      {children}
    </Comp>
  );
}

export default StatTile;
