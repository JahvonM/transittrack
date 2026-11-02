import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { toneOf } from "@/components/system/status";
import { cn } from "@/lib/utils";

// Building blocks for office displays (/display). Sized in rem: the page sets
// the root text size from the screen's size and its Text size setting.

export function useNow(ms = 15_000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return now;
}

// A status shown with an icon and words, never colour alone.
export function Chip({ tone = "neutral", icon, children, className }) {
  const t = toneOf(tone);
  const Icon = icon || t.icon;
  return (
    <span className={cn("inline-flex max-w-full items-center gap-[0.35em] rounded-full border px-[0.6em] py-[0.15em] font-semibold", t.soft, t.text, className)}>
      <Icon className={cn("h-[1em] w-[1em] shrink-0", t.fg)} aria-hidden="true" />
      <span className="truncate">{children}</span>
    </span>
  );
}

export function Panel({ title, count, tone, children, className, compact }) {
  const t = tone ? toneOf(tone) : null;
  return (
    <section className={cn("flex min-h-0 flex-col rounded-2xl border border-border bg-card", compact ? "p-3" : "p-4", className)} aria-label={title}>
      <header className="mb-2 flex shrink-0 items-baseline justify-between gap-3">
        <h2 className="flex items-center gap-2 text-[1.15rem] font-semibold leading-tight">
          {t && <t.icon className={cn("h-[1.05em] w-[1.05em]", t.fg)} aria-hidden="true" />}
          {title}
        </h2>
        {count != null && <span className="font-display text-[1.6rem] font-bold leading-none tabular-nums">{count}</span>}
      </header>
      <div className="flex min-h-0 flex-1 flex-col">{children}</div>
    </section>
  );
}

// A list that never scrolls: it shows the rows that fit whole and says how
// many more there are, so nothing is cut in half or hidden below the fold.
export function FitList({ items, render, itemKey = (x) => x.id, empty, gap = "gap-2", className, row = false }) {
  const ref = useRef(null);
  const [fit, setFit] = useState(items.length);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const measure = () => {
      const limit = el.clientHeight + 1;
      let n = 0;
      for (const child of el.children) {
        if (child.offsetTop + child.offsetHeight <= limit) n += 1;
        else break;
      }
      setFit(n);
    };
    measure();
    if (typeof ResizeObserver === "undefined") return undefined;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [items]);
  if (!items.length) return <p className="py-2 text-[1rem] text-muted-foreground">{empty}</p>;
  const hidden = Math.max(0, items.length - fit);
  return (
    <div className={cn("flex min-h-0 flex-1 flex-col", className)}>
      <ul ref={ref} className={cn("relative flex min-h-0 flex-1 overflow-hidden", row ? "flex-row flex-wrap content-start" : "flex-col", gap)}>
        {items.map((item, i) => (
          <li key={itemKey(item)} className={i >= fit ? "invisible" : undefined} aria-hidden={i >= fit || undefined}>{render(item)}</li>
        ))}
      </ul>
      <p className="h-[1.6em] shrink-0 pt-1 text-[0.95rem] font-semibold text-muted-foreground" aria-live="polite">
        {hidden > 0 ? `+${hidden} more not shown` : ""}
      </p>
    </div>
  );
}

export function Stat({ label, value, tone }) {
  const t = tone ? toneOf(tone) : null;
  return (
    <div className="min-w-0 rounded-2xl border border-border bg-card px-3 py-2.5">
      <p className="font-display text-[2.4rem] font-bold leading-none tabular-nums">{value}</p>
      <p className={cn("mt-1 flex items-center gap-1 text-[0.95rem] font-semibold leading-tight", t ? t.text : "text-muted-foreground")}>
        {t && <t.icon className={cn("h-[1em] w-[1em] shrink-0", t.fg)} aria-hidden="true" />}
        {label}
      </p>
    </div>
  );
}

// Whole-screen message: loading, disconnected, ended, not set up.
export function ScreenMessage({ icon: Icon, title, children, tone = "neutral", action }) {
  const t = toneOf(tone);
  return (
    <div className="grid h-full place-items-center p-8">
      <div className="max-w-[46rem] text-center">
        {Icon && <Icon className={cn("mx-auto mb-5 h-[3.5rem] w-[3.5rem]", t.fg)} aria-hidden="true" />}
        <h1 className="text-[2.4rem] font-bold leading-tight">{title}</h1>
        {children && <div className="mt-3 text-[1.25rem] leading-relaxed text-muted-foreground">{children}</div>}
        {action && <div className="mt-6 flex flex-wrap justify-center gap-3">{action}</div>}
      </div>
    </div>
  );
}

export function BigButton({ children, onClick, variant = "primary" }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "min-h-[3rem] rounded-xl px-6 text-[1.15rem] font-semibold focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-ring",
        variant === "primary" ? "bg-primary text-primary-foreground" : "border border-border bg-card text-foreground",
      )}
    >
      {children}
    </button>
  );
}
