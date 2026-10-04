import React from "react";
import { cn } from "@/lib/utils";
import { toneOf } from "./status";

const SIZES = {
  sm: "h-6 px-2 gap-1 text-xs [&_svg]:size-3.5",
  md: "h-7 px-2.5 gap-1.5 text-xs [&_svg]:size-4",
  lg: "h-9 px-3 gap-2 text-sm [&_svg]:size-4",
};

// Pill with icon + label in one of the status tones. Pass `icon={null}` to
// use a dot instead of an icon (the label still carries the meaning).
export function StatusBadge({ tone = "neutral", label, icon, size = "md", variant = "soft", pulse = false, className, children, ...props }) {
  const t = toneOf(tone);
  const Icon = icon === undefined ? t.icon : icon;
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border font-semibold whitespace-nowrap leading-none",
        SIZES[size] || SIZES.md,
        variant === "solid" ? cn(t.solid, "border-transparent") : cn(t.soft, t.text),
        className,
      )}
      {...props}
    >
      {Icon ? <Icon aria-hidden="true" className={cn("shrink-0", variant !== "solid" && t.fg, pulse && "animate-pulse")} /> : <StatusDot tone={tone} pulse={pulse} decorative />}
      <span>{label ?? children}</span>
    </span>
  );
}

// Small round indicator. Needs a `label` for screen readers unless it sits
// next to visible text that already says the same thing (`decorative`).
export function StatusDot({ tone = "neutral", label, pulse = false, decorative = false, size = 8, className }) {
  const t = toneOf(tone);
  return (
    <span
      className={cn("relative inline-block shrink-0 rounded-full", t.dot, pulse && cn("tt-live-pulse", t.fg), className)}
      style={{ width: size, height: size }}
      {...(decorative ? { "aria-hidden": true } : { role: "img", "aria-label": label || tone })}
    />
  );
}

export default StatusBadge;
