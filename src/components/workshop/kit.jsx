import React, { createContext, useContext, useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { ChevronLeft, ChevronRight, Loader2, Trash2 } from "lucide-react";

// The Workshop's building blocks, the same on every screen: a bar with Back,
// the title and one main button; big tiles to tap; and one full-height sheet
// for all editing, with Cancel and Save at the top.

export const WorkshopContext = createContext(null);
export const useWorkshop = () => useContext(WorkshopContext);

export const FIELD = "h-12 w-full rounded-xl border border-input bg-background px-3 text-body";
export const pluralize = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
export const hostOf = (link) => {
  try { return new URL(link).hostname.replace(/^www\./, ""); } catch { return ""; }
};

export function ScreenBar({ back, backLabel = "Back", title, subtitle, children }) {
  return (
    <div className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-2">
      {back && (
        <Button asChild variant="ghost" className="-ml-2 h-12 rounded-xl px-2 text-body">
          <Link to={back}><ChevronLeft className="mr-0.5 h-5 w-5" aria-hidden="true" />{backLabel}</Link>
        </Button>
      )}
      <div className="min-w-0 flex-1 basis-56">
        <h2 className="truncate text-title font-semibold">{title}</h2>
        {subtitle && <p className="truncate text-body-sm text-muted-foreground">{subtitle}</p>}
      </div>
      {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
    </div>
  );
}

const TILE = "group flex min-h-[7.5rem] w-full items-start gap-4 rounded-2xl border border-border bg-card p-5 text-left transition-colors hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:scale-[0.99]";

// A big tile: a link (to) or a button (onClick).
export function Tile({ to, onClick, icon: Icon, title, lines = [], badge, className }) {
  const body = (
    <>
      {Icon && <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-primary/15 text-primary"><Icon className="h-6 w-6" aria-hidden="true" /></span>}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-title-sm font-semibold">{title}</span>
        {lines.filter(Boolean).map((line, i) => <span key={i} className="block break-words text-body-sm text-muted-foreground">{line}</span>)}
        {badge && <span className="mt-2 block">{badge}</span>}
      </span>
      <ChevronRight className="mt-3 h-5 w-5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
    </>
  );
  return to
    ? <Link to={to} className={cn(TILE, className)}>{body}</Link>
    : <button type="button" onClick={onClick} className={cn(TILE, className)}>{body}</button>;
}

export function Notice({ children, action, tone = "neutral" }) {
  return (
    <div role={tone === "danger" ? "alert" : undefined} className={cn("mb-4 flex flex-wrap items-center gap-3 rounded-2xl border p-4", tone === "warning" ? "border-warning/40 bg-warning/10" : tone === "danger" ? "border-danger/40 bg-danger/10" : "border-border bg-card")}>
      <div className="min-w-[200px] flex-1 text-body-sm">{children}</div>
      {action}
    </div>
  );
}

export function Field({ id, label, hint, children }) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-body-sm font-semibold">{label}</label>
      {children}
      {hint && <p className="text-caption text-muted-foreground">{hint}</p>}
    </div>
  );
}

// All editing happens here: a full-height sheet, Cancel and Save always in
// view at the top, and Delete (when offered) at the bottom, which asks once
// more on the button itself.
export function EditSheet({ open, onClose, title, description, saving = false, problem = "", saveLabel = "Save", onSave, onDelete, deleteLabel = "Delete", children }) {
  const [confirming, setConfirming] = useState(false);
  const close = () => { if (!saving) { setConfirming(false); onClose(); } };
  const submit = (e) => {
    e.preventDefault();
    if (!saving && !problem) onSave();
  };
  return (
    <Sheet open={open} onOpenChange={(next) => { if (!next) close(); }}>
      <SheetContent side="right" className="flex h-[100dvh] w-full flex-col gap-0 p-0 sm:max-w-xl [&>button]:hidden" onOpenAutoFocus={(e) => e.preventDefault()}>
        <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col" noValidate>
          <div className="safe-area-top flex items-center gap-2 border-b border-border px-4 py-3">
            <Button type="button" variant="ghost" className="h-12 rounded-xl px-3 text-body" onClick={close} disabled={saving}>Cancel</Button>
            <div className="min-w-0 flex-1 text-center">
              <SheetTitle className="truncate text-body font-semibold">{title}</SheetTitle>
              <SheetDescription className={description ? "truncate text-caption" : "sr-only"}>{description || title}</SheetDescription>
            </div>
            <Button type="submit" className="h-12 min-w-[5.5rem] rounded-xl text-body" disabled={saving || !!problem}>
              {saving && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" aria-hidden="true" />}{saveLabel}
            </Button>
          </div>
          <fieldset disabled={saving} className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 pb-[calc(1.5rem+env(safe-area-inset-bottom))] pt-4">
            {problem && <p className="rounded-xl bg-secondary px-3 py-2 text-body-sm" aria-live="polite">{problem}</p>}
            {children}
            {onDelete && (
              <div className="border-t border-border pt-4">
                <Button
                  type="button" variant={confirming ? "destructive" : "ghost"} className="h-12 rounded-xl text-body"
                  onClick={() => { if (confirming) { setConfirming(false); onDelete(); } else setConfirming(true); }}
                >
                  <Trash2 className="mr-1.5 h-4 w-4" aria-hidden="true" />{confirming ? "Tap again to delete" : deleteLabel}
                </Button>
              </div>
            )}
          </fieldset>
        </form>
      </SheetContent>
    </Sheet>
  );
}
