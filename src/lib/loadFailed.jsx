import React from "react";
import { toast } from "@/components/ui/use-toast";
import { ToastAction } from "@/components/ui/toast";

// Shown when a screen's data fails to load, so it never sits on a spinner forever.
// Almost all of these are a momentary hiccup, so the screen's own reload is tried
// once quietly first: the screen keeps whatever it already had, and if that try
// works nobody is told anything at all.
let lastNotice = 0;
let quietTried = false;

function notify(retry) {
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

export function loadFailed(retry) {
  if (!retry) return notify(retry);
  if (quietTried) return notify(retry);
  quietTried = true;
  // One quiet try of the screen's own reload. If it works the screen simply
  // shows its data again; if it fails, the screen calls us back and we say so.
  setTimeout(() => { Promise.resolve().then(retry).catch(() => {}); }, 1000);
  setTimeout(() => { quietTried = false; }, 10000);
}