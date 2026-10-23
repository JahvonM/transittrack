import TabletRecordingsViewer from "./TabletRecordingsViewer";
import TabletRemoteViewer from "./TabletRemoteViewer";
import TabletNativeUpdate from "./TabletNativeUpdate";
import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { errorData } from "@/lib/requestError";

const kioskLabels = { kiosk_prepare: "Set recovery PIN", kiosk_enable: "Enable permanent kiosk", kiosk_maintenance: "Unlock maintenance · 10 min", kiosk_disable: "Turn off permanent kiosk" };
const explanations = {
  kiosk_prepare: "Opens private PIN setup on the tablet for two minutes. Set and confirm an 8–12 digit recovery PIN there. Keep it securely; it works offline and is separate from driver PINs. This also lets an administrator replace a forgotten recovery PIN.",
  kiosk_enable: "Locks the tablet to this app, hides Android navigation and notifications, makes it the managed Home app, and restores it after restart. Set the recovery PIN first. Perform the first setup with the tablet nearby and parked.",
  kiosk_maintenance: "Temporarily releases permanent kiosk restrictions for ten minutes. Kiosk mode returns automatically; rebooting ends maintenance immediately.",
  kiosk_disable: "Turns off permanent kiosk mode and restores the previous lock-task policy. Pairing and saved work remain on the tablet."
};
const labels = { ...kioskLabels, lock_test: "Test kiosk lock · 10 min", release: "Release test lock", reboot: "Restart tablet" };
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
      <DialogContent className="max-w-lg max-h-[90dvh] overflow-y-auto">
        <DialogHeader><DialogTitle>Tablet controls · {device.label}</DialogTitle>
          <DialogDescription>Admin controls for the integrated Android kiosk app. Requests expire after two minutes.</DialogDescription></DialogHeader>
        {!available ? <p className="text-sm text-muted-foreground">Requires the new combined kiosk installation. Keep your current helper until final testing.</p>
          : !managed ? <p className="text-sm text-muted-foreground">Android has not granted this app managed-device ownership. Lock and restart remain blocked. No ownership changes are made here.</p>
          : <p className="text-sm">Managed Android controls are available. Last reported lock: {health.management_locked ? "on" : "off"}.</p>}
        {health.kiosk_available ? <div className="rounded-lg border p-3 text-sm space-y-1" aria-label="Managed kiosk status">
          <p>Permanent kiosk: {health.kiosk_enabled ? "enabled" : "off"} · Android lock: {health.kiosk_locked ? "locked" : "unlocked"}</p>
          <p>Recovery PIN: {health.kiosk_recovery_ready ? "ready" : "setup required"} · Startup: {health.kiosk_startup ? "enabled" : "off"}</p>
          <p>Maintenance: {health.kiosk_maintenance ? "temporarily unlocked" : "closed"}</p>
          <p className="text-muted-foreground">Offline access: tap the top-right corner of the kiosk screen seven times within four seconds, then enter the recovery PIN. Status is from the last tablet report.</p>
        </div> : <p className="text-sm text-muted-foreground">Permanent kiosk controls require Android app 1.6 / build 7 or newer. Update the APK, open it, then refresh status.</p>}
        <TabletNativeUpdate device={device} onRefresh={onRefresh} />
        {open && <TabletRemoteViewer device={device} />}
        {open && <TabletRecordingsViewer key={device.id} device={device} />}
        {status && <div role="status" className="rounded-lg bg-muted p-3 text-sm space-y-1">
          <p>{status.action === "app_update" ? "Native app update" : labels[status.action] || "Tablet request"} · {pending ? "Waiting for tablet" : status.state === "waiting" ? "Expired without confirmation" : status.state}</p>
          {status.message && <p>{status.message}</p>}
          {status.action === "lock_test" && status.lock_until && <p>Test release deadline: {new Date(status.lock_until).toLocaleTimeString()}.</p>}
          {status.state === "requested" && status.action === "reboot" && <p>Restart completion is not confirmed. Last check-in: {device.last_seen ? new Date(device.last_seen).toLocaleString() : "unknown"}.</p>}
        </div>}
        <div className="flex flex-wrap gap-2">{Object.entries(labels).map(([action, label]) =>
          <Button key={action} variant="outline" disabled={busy || pending || !available || !managed || device.paired !== true || (action.startsWith("kiosk_") && !health.kiosk_available) || (action === "kiosk_enable" && !health.kiosk_recovery_ready)} onClick={() => { setChoice(action); setError(""); }}>{label}</Button>)}</div>
        {choice && <div className="rounded-lg border p-3 space-y-3">
          <p className="font-medium">{labels[choice]}?</p>
          <p className="text-sm text-muted-foreground">{explanations[choice] || (choice === "reboot"
            ? "Driver tablets must be at the PIN screen with tracking off and no open shift. Boarding tablets must be idle. Saved uploads, unreadable storage, editing or recent activity block restart."
            : choice === "lock_test" ? "Temporarily keeps this app in the foreground. Automatic release runs in Android, with recovery on app restart. Keep the tablet nearby for the first physical test."
            : "Releases only the temporary lock created by this app. Other kiosk apps and Android ownership are unchanged.")}</p>
          <Button disabled={busy} onClick={send}>{busy ? "Sending…" : "Send admin request"}</Button>
          <Button variant="ghost" disabled={busy} onClick={() => setChoice(null)}>Cancel</Button>
        </div>}
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <Button variant="ghost" disabled={busy} onClick={() => onRefresh?.()}>Refresh tablet status</Button>
      </DialogContent>
    </Dialog>
  </>;
}
