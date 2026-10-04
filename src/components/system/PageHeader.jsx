import React from "react";
import { ChevronLeft } from "lucide-react";
import { cn } from "@/lib/utils";

// Top of a page: optional back control, icon, eyebrow, title, description and
// actions. Actions wrap under the title on narrow screens.
export function PageHeader({ title, description, eyebrow, icon: Icon, actions, onBack, backLabel = "Back", className, children }) {
  return (
    <header className={cn("flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between", className)}>
      <div className="min-w-0 flex items-start gap-3">
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            aria-label={backLabel}
            className="-ml-2 mt-0.5 grid h-10 w-10 shrink-0 place-items-center rounded-md text-muted-foreground transition-colors duration-fast hover:bg-accent hover:text-foreground"
          >
            <ChevronLeft className="h-5 w-5" aria-hidden="true" />
          </button>
        )}
        {Icon && (
          <span className="mt-0.5 grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-surface-2 text-foreground" aria-hidden="true">
            <Icon className="h-5 w-5" />
          </span>
        )}
        <div className="min-w-0">
          {eyebrow && <p className="text-caption font-semibold uppercase tracking-wider text-muted-foreground">{eyebrow}</p>}
          <h1 className="text-headline text-balance break-words">{title}</h1>
          {description && <p className="mt-1 max-w-prose text-body-sm text-muted-foreground">{description}</p>}
          {children}
        </div>
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2 sm:shrink-0 sm:justify-end">{actions}</div>}
    </header>
  );
}

// Heading for a block inside a page. `as` keeps the document outline right.
export function SectionHeader({ title, description, action, as: Tag = "h2", icon: Icon, className }) {
  return (
    <div className={cn("flex items-end justify-between gap-3", className)}>
      <div className="min-w-0">
        <Tag className="flex items-center gap-2 text-title-sm">
          {Icon && <Icon className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />}
          <span className="truncate">{title}</span>
        </Tag>
        {description && <p className="mt-0.5 text-body-sm text-muted-foreground">{description}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

export default PageHeader;
