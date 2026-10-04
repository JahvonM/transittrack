import React from "react";
import AnimatedBus from "@/components/AnimatedBus";
import { cn } from "@/lib/utils";

// Standard empty state. The parked bus is TransitTrack's default illustration;
// pass `icon` for a quieter icon instead. `text` is the original one-line API
// (still supported); `title` + `description` give a heading and detail.
export default function EmptyState({ text, title, description, icon: Icon, action, compact = false, className = "", children }) {
  const heading = title || (!description ? null : text);
  const body = description || (title ? text : !heading ? text : null);
  return (
    <div className={cn("flex flex-col items-center justify-center text-center", compact ? "gap-2 py-6" : "gap-3 py-10", className)}>
      {Icon ? (
        <span className={cn("grid place-items-center rounded-full bg-surface-2 text-muted-foreground", compact ? "h-10 w-10" : "h-12 w-12")} aria-hidden="true">
          <Icon className={compact ? "h-5 w-5" : "h-6 w-6"} />
        </span>
      ) : (
        <div className="opacity-60" aria-hidden="true">
          <AnimatedBus mode="arrive" width={compact ? 80 : 110} />
        </div>
      )}
      {heading && <p className="text-title-sm">{heading}</p>}
      {body && <p className="max-w-xs text-body-sm text-muted-foreground">{body}</p>}
      {action}
      {children}
    </div>
  );
}
