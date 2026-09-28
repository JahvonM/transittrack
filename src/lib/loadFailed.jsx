import React from "react";
import { toast } from "@/components/ui/use-toast";
import { ToastAction } from "@/components/ui/toast";

// Shown when a screen's data fails to load, so it never sits on a spinner forever.
let last = 0;
export function loadFailed(retry) {
  const now = Date.now();
  if (now - last < 4000) return;
  last = now;
  toast({
    variant: "destructive",
    title: "Couldn't load everything",
    description: "Check your connection. Some information may be missing.",
    action: (
      <ToastAction altText="Retry" onClick={() => (retry ? retry() : window.location.reload())}>
        Retry
      </ToastAction>
    ),
  });
}
