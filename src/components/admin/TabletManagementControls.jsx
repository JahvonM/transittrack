import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { errorData } from "@/lib/requestError";

const labels = { lock_test: "Test kiosk lock · 10 min", release: "Release test lock", reboot: "Restart tablet" };
export default function TabletManagementControls({ device, onRefresh }) {
  const [open, setOpen] = useState(false), [choice, setChoice] = useState(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const health = device.helper_health || {}, status = device.control_status;
  const pending = status?.state === "waiting" && Date.parse(status.expires_at) > Date.now();
  const available = health.management_available === true;
  const managed = health.management_owner === true;
  const send = async () => {
    if (!choice) return;
    setBusy(true); setError("");
    try {
      const r = await base44.functions.invoke("tabletControl", { operation: "request", device_id: device.id, action: choice });
      if (r.data?.error) throw new Error(r.data.error);
      setChoice(null); await onRefresh?.();
    } catch (e) { setError(errorData(e).error || e?.message || "Request failed. Try again."); }
    finally { setBusy(false); }
  };
  return <>
    <Button variant="outline" size="sm" onClick={() => setOpen(true)}>Tablet controls</Button>
    <Dialog open={open} onOpenChange={v => { setOpen(v); if (!v) { setChoice(null); setError(""); } }}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>Tablet controls · {device.label}</DialogTitle>
          <DialogDescription>Admin controls for the integrated Android kiosk app. Requests expire after two minutes.</DialogDescription></DialogHeader>
        {!available ? <p className="text-sm text-muted-foreground">Requires the new combined kiosk installation. Keep your current helper until final testing.</p>
          : !managed ? <p className="text-sm text-muted-foreground">Android has not granted this app managed-device ownership. Lock and restart remain blocked. No ownership changes are made here.</p>
          : <p className="text-sm">Managed Android controls are available. Last reported lock: {health.management_locked ? "on" : "off"}.</p>}
        {status && <div role="status" className="rounded-lg bg-muted p-3 text-sm space-y-1">
          <p>{labels[status.action] || "Tablet request"} · {pending ? "Waiting for tablet" : status.state === "waiting" ? "Expired without confirmation" : status.state}</p>
          {status.message && <p>{status.message}</p>}
          {status.action === "lock_test" && status.lock_until && <p>Test release deadline: {new Date(status.lock_until).toLocaleTimeString()}.</p>}
          {status.state === "requested" && <p>Restart completion is not confirmed. Last check-in: {device.last_seen ? new Date(device.last_seen).toLocaleString() : "unknown"}.</p>}
        </div>}
        <div className="flex flex-wrap gap-2">{Object.entries(labels).map(([action, label]) =>
          <Button key={action} variant="outline" disabled={busy || pending || !available || !managed || device.paired !== true} onClick={() => { setChoice(action); setError(""); }}>{label}</Button>)}</div>
        {choice && <div className="rounded-lg border p-3 space-y-3">
          <p className="font-medium">{labels[choice]}?</p>
          <p className="text-sm text-muted-foreground">{choice === "reboot"
            ? "Driver tablets must be at the PIN screen with tracking off and no open shift. Boarding tablets must be idle. Saved uploads, unreadable storage, editing or recent activity block restart."
            : choice === "lock_test" ? "Temporarily keeps this app in the foreground. Automatic release runs in Android, with recovery on app restart. Keep the tablet nearby for the first physical test."
            : "Releases only the temporary lock created by this app. Other kiosk apps and Android ownership are unchanged."}</p>
          <Button disabled={busy} onClick={send}>{busy ? "Sending…" : "Send admin request"}</Button>
          <Button variant="ghost" disabled={busy} onClick={() => setChoice(null)}>Cancel</Button>
        </div>}
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <Button variant="ghost" disabled={busy} onClick={() => onRefresh?.()}>Refresh tablet status</Button>
      </DialogContent>
    </Dialog>
  </>;
}
