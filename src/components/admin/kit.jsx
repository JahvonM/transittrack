import React, { createContext, useContext } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";

/**
 * Small building blocks shared by the admin screens so every page has the
 * same header, panels, status chips, filters and empty states. Visual only.
 */

// The shell gives pages a place beside the page title for their main
// actions, and a line under it for a short description.
export const PageSlots = createContext({ actions: null, intro: null });

// Wrap a screen that is shown inside another page (a tab) so its intro and
// actions stay with it instead of moving into the outer page's header.
export function NestedPage({ children }) {
  return <PageSlots.Provider value={{ actions: null, intro: null }}>{children}</PageSlots.Provider>;
}

export function PageActions({ children }) {
  const { actions } = useContext(PageSlots);
  if (!actions) return <div className="mb-4 flex flex-wrap justify-end gap-2">{children}</div>;
  return createPortal(<div className="flex flex-wrap items-center justify-end gap-2">{children}</div>, actions);
}

export function PageIntro({ children }) {
  const { intro } = useContext(PageSlots);
  if (!intro) return <p className="mb-4 text-body-sm text-muted-foreground">{children}</p>;
  return createPortal(<p className="mt-1 max-w-3xl text-body-sm text-muted-foreground">{children}</p>, intro);
}

// "on_trip" -> "On trip"
export function humanize(value) {
  if (value == null || value === "") return "";
  const s = String(value).replace(/[_-]+/g, " ").trim();
  return s.charAt(0).toUpperCase() + s.slice(1);
}

const TONES = {
  success: "bg-success/12 text-success",
  warning: "bg-warning/14 text-warning",
  danger: "bg-danger/12 text-danger",
  info: "bg-info/12 text-info",
  primary: "bg-primary/14 text-foreground",
  neutral: "bg-secondary text-muted-foreground",
};
const DOTS = { success: "bg-success", warning: "bg-warning", danger: "bg-danger", info: "bg-info", primary: "bg-primary", neutral: "bg-offline" };

// The usual meaning of the status words used across TransitTrack records.
const STATUS_TONE = {
  on_trip: "success", active: "success", live: "success", tracking: "success", completed: "success", resolved: "success",
  passed: "success", paired: "success", boarded: "success", signed_in: "success", confirmed: "success", returned: "success", ok: "success",
  on_the_way: "info", arrived: "info", scheduled: "info", in_progress: "info", investigating: "info", found: "info", pending: "warning",
  idle: "neutral", offline: "neutral", inactive: "neutral", cancelled: "neutral", archived: "neutral", off_board: "neutral", closed: "neutral",
  due: "warning", open: "warning", maintenance: "warning", medium: "warning", stale: "warning", reported: "warning", missing: "warning",
  overdue: "danger", failed: "danger", emergency: "danger", critical: "danger", high: "danger", speeding: "danger", revoked: "danger", lost: "danger",
  low: "neutral",
};

export function toneOfStatus(status) {
  return STATUS_TONE[String(status || "").toLowerCase().replace(/\s+/g, "_")] || "neutral";
}

// A quiet status label: a coloured dot and words, never colour alone.
export function StatusChip({ status, tone, children, dot = true, className }) {
  const t = tone || toneOfStatus(status);
  return (
    <span className={cn("inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-caption font-semibold", TONES[t], className)}>
      {dot && <span className={cn("h-1.5 w-1.5 rounded-full", DOTS[t])} aria-hidden="true" />}
      {children ?? humanize(status)}
    </span>
  );
}

export function Panel({ title, description, icon: Icon, actions, children, className, bodyClassName, as: Tag = "section" }) {
  return (
    <Tag className={cn("min-w-0 rounded-2xl border border-border bg-card", className)} aria-label={typeof title === "string" ? title : undefined}>
      {(title || actions) && (
        <div className="flex flex-wrap items-start justify-between gap-3 px-5 pb-1 pt-4">
          <div className="min-w-0">
            {title && (
              <h2 className="flex items-center gap-2 text-title-sm font-bold">
                {Icon && <Icon className="h-[18px] w-[18px] shrink-0 text-muted-foreground" aria-hidden="true" />}
                {title}
              </h2>
            )}
            {description && <p className="mt-0.5 text-body-sm text-muted-foreground">{description}</p>}
          </div>
          {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </div>
      )}
      <div className={cn("p-5", (title || actions) && "pt-3", bodyClassName)}>{children}</div>
    </Tag>
  );
}

export function Toolbar({ children, actions, className }) {
  return (
    <div className={cn("mb-4 flex flex-wrap items-center gap-2", className)}>
      {children}
      {actions && <div className="ml-auto flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

// Pill filters / view switch. options: [{ value, label, count? }]
export function Segmented({ value, onChange, options, label, className, size = "md" }) {
  return (
    <div className={cn("inline-flex max-w-full flex-wrap gap-1 rounded-xl bg-secondary p-1", className)} role="group" aria-label={label}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-lg px-3 font-semibold transition-colors",
            size === "sm" ? "h-8 text-caption" : "h-9 text-body-sm",
            value === o.value ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
          )}
        >
          {o.icon && <o.icon className="h-4 w-4" aria-hidden="true" />}
          {o.label}
          {o.count != null && <span className="tabular-nums opacity-70">{o.count}</span>}
        </button>
      ))}
    </div>
  );
}

export function EmptyState({ icon: Icon, title, children, action, className }) {
  return (
    <div className={cn("flex flex-col items-center justify-center rounded-2xl border border-dashed border-border px-6 py-12 text-center", className)}>
      {Icon && (
        <span className="mb-3 grid h-12 w-12 place-items-center rounded-full bg-secondary text-muted-foreground" aria-hidden="true">
          <Icon className="h-6 w-6" />
        </span>
      )}
      {title && <p className="text-title-sm font-semibold">{title}</p>}
      {children && <div className="mt-1 max-w-md text-body-sm text-muted-foreground">{children}</div>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

// A compact number tile for the top of a page.
export function Kpi({ label, value, detail, tone, icon: Icon, className }) {
  const fg = { success: "text-success", warning: "text-warning", danger: "text-danger", info: "text-info" }[tone];
  return (
    <div className={cn("min-w-0 rounded-2xl border border-border bg-card px-4 py-3", className)}>
      <p className="flex items-center gap-1.5 truncate text-caption font-semibold text-muted-foreground">
        {Icon && <Icon className={cn("h-4 w-4 shrink-0", fg)} aria-hidden="true" />}
        {label}
      </p>
      <p className={cn("mt-1 font-display text-[1.75rem] font-semibold leading-none tabular-nums", fg)}>{value}</p>
      {detail && <p className="mt-1 truncate text-caption text-muted-foreground">{detail}</p>}
    </div>
  );
}

export function KpiRow({ children, className }) {
  return <div className={cn("mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4", className)}>{children}</div>;
}

// One row in a list of records: leading visual, text, trailing meta/actions.
export function Row({ lead, title, subtitle, meta, actions, onClick, className, children }) {
  const Inner = onClick ? "button" : "div";
  return (
    <div className={cn("flex min-h-[64px] items-center gap-3 rounded-xl px-3 py-2", onClick && "hover:bg-accent/60", className)}>
      <Inner {...(onClick ? { type: "button", onClick } : {})} className="flex min-w-0 flex-1 items-center gap-3 text-left">
        {lead && <span className="shrink-0">{lead}</span>}
        <span className="min-w-0 flex-1">
          <span className="block truncate font-semibold">{title}</span>
          {subtitle && <span className="block truncate text-body-sm text-muted-foreground">{subtitle}</span>}
          {children}
        </span>
        {meta && <span className="flex shrink-0 flex-col items-end gap-1 text-right">{meta}</span>}
      </Inner>
      {actions && <span className="flex shrink-0 items-center gap-1">{actions}</span>}
    </div>
  );
}

export function LeadIcon({ icon: Icon, tone = "neutral", children }) {
  const bg = { neutral: "bg-secondary text-foreground", success: "bg-success/12 text-success", warning: "bg-warning/14 text-warning", danger: "bg-danger/12 text-danger", info: "bg-info/12 text-info", primary: "bg-primary/14 text-primary" }[tone];
  return (
    <span className={cn("grid h-10 w-10 place-items-center rounded-lg font-display text-title-sm font-semibold tabular-nums", bg)} aria-hidden="true">
      {Icon ? <Icon className="h-5 w-5" /> : children}
    </span>
  );
}

// Table styling shared by the admin's data tables.
export const tableClass = {
  wrap: "overflow-x-auto rounded-2xl border border-border bg-card",
  table: "w-full min-w-[640px] border-collapse text-body-sm",
  th: "border-b border-border px-4 py-3 text-left text-caption font-semibold uppercase tracking-wide text-muted-foreground",
  td: "border-b border-border/60 px-4 py-3 align-middle",
  tr: "hover:bg-accent/40",
};
