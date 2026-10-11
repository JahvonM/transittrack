import React from "react";
import { toast } from "@/components/ui/use-toast";
import { ToastAction } from "@/components/ui/toast";

// Backend reads already retry rate limits. Offer an explicit retry after they
// finish; automatically reloading here would start another retry cycle.
let lastNotice = 0;

export function loadFailed(retry) {
  const now = Date.now();
  if (now - lastNotice < 4000) return;
  lastNotice = now;
  toast({
    variant: "destructive",
    title: "Couldn't load everything",
    description: "Some information may be missing. We're still showing the last information received.",
    action: (
      <ToastAction altText="Retry" onClick={() => (retry ? retry() : window.location.reload())}>
        Retry
      </ToastAction>
    ),
  });
}
