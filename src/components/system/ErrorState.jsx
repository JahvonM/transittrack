import React from "react";
import { CircleAlert, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// Something failed to load. Says what happened in plain words and offers a
// retry that calls the screen's existing reload function.
export function ErrorState({ title = "Couldn't load this", description = "Check your connection and try again.", onRetry, retrying = false, retryLabel = "Try again", compact = false, className, children }) {
  return (
    <div role="alert" className={cn("flex flex-col items-center justify-center text-center", compact ? "gap-2 py-6" : "gap-3 py-12", className)}>
      <span className={cn("grid place-items-center rounded-full border border-danger/40 bg-danger/12 text-danger", compact ? "h-10 w-10" : "h-12 w-12")} aria-hidden="true">
        <CircleAlert className={compact ? "h-5 w-5" : "h-6 w-6"} />
      </span>
      <div className="space-y-1">
        <p className="text-title-sm">{title}</p>
        {description && <p className="mx-auto max-w-sm text-body-sm text-muted-foreground">{description}</p>}
      </div>
      {onRetry && (
        <Button variant="outline" size="sm" onClick={onRetry} loading={retrying}>
          {!retrying && <RefreshCw aria-hidden="true" />} {retryLabel}
        </Button>
      )}
      {children}
    </div>
  );
}

export default ErrorState;
