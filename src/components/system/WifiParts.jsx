import React from "react";
import { AlertTriangle, CheckCircle2, Loader2 } from "lucide-react";

// Pieces shared by the two Wi-Fi screens: Admin → Kiosk tablets (sends the
// tablet a command) and the tablet's own settings (talks to its helper).

// Signal strength as four bars.
export function SignalBars({ n = 0, label = "Signal" }) {
  return (
    <span className="inline-flex items-end gap-0.5 h-3.5" role="img" aria-label={`${label} ${n} of 4`}>
      {[1, 2, 3, 4].map((i) => (
        <span key={i} className={`w-1 rounded-sm ${i <= n ? "bg-foreground/70" : "bg-muted-foreground/25"}`} style={{ height: `${i * 25}%` }} />
      ))}
    </span>
  );
}

// How the last "join this network" went: joining, connected or failed.
export function JoinStatus({ join, when = "" }) {
  if (!join) return null;
  return (
    <div role="status" className={`flex items-start gap-2 rounded-lg p-3 text-sm ${join.state === "failed" ? "bg-destructive/10 text-destructive" : join.state === "connected" ? "bg-success/10" : "bg-muted"}`}>
      {join.state === "joining" ? <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin" /> : join.state === "connected" ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" /> : <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />}
      <span>{join.message || join.state}{when ? ` · ${when}` : ""}</span>
    </div>
  );
}
