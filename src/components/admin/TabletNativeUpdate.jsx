import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
export default function TabletNativeUpdate({ device, onRefresh }) {
  const [busy, setBusy] = useState(false), [release, setRelease] = useState(null), [message, setMessage] = useState("");
  const h = device.helper_health || {};
  const check = async () => {
    setBusy(true); setRelease(null); setMessage("");
    try {
      const { data } = await base44.functions.invoke("tabletControl", { operation: "release", device_id: device.id });
      if (data?.error) throw new Error(data.error);
      setRelease(data.release || null);
      setMessage(data.release ? "A combined kiosk release is available." : "No approved combined kiosk APK is available yet. Web updates and the separate helper are different.");
    } catch { setMessage("Could not check releases. Try again."); }
    finally { setBusy(false); }
  };
  const send = async () => {
    setBusy(true);
    try {
      const { data } = await base44.functions.invoke("tabletControl", { operation: "request", device_id: device.id, action: "app_update", release_id: release.id });
      if (data?.error) throw new Error(data.error);
      setRelease(null); setMessage("Update requested. Wait for the tablet’s verified result."); await onRefresh?.();
    } catch (e) { setMessage(e.message || "Could not request update."); }
    finally { setBusy(false); }
  };
  const code = h.native_app_code;
  return <section className="rounded-lg border p-3 space-y-2" aria-label="Native kiosk updates">
    <h3 className="font-medium">Installed kiosk app</h3>
    <p className="text-sm">{h.native_app_package === "com.transittrack.app" && code
      ? `${h.native_app_version || "Unknown version"} · build ${code}` : "Not reported by this tablet yet"}</p>
    {h.reported_at && <p className="text-xs text-muted-foreground">Last report: {new Date(h.reported_at).toLocaleString()}</p>}
    <Button variant="outline" size="sm" disabled={busy} onClick={check}>Check native update</Button>
    {message && <p role="status" className="text-sm">{message}</p>}
    {release && <div className="space-y-2 text-sm">
      <p>Available: {release.version_name} · build {release.version_code}</p>
      <p>Requires managed-device ownership, no active shift, no saved uploads and three minutes idle. Package and signing identity are checked on the tablet.</p>
      <Button disabled={busy || !h.native_update_available || !h.management_owner || !code || code >= release.version_code || device.paired !== true} onClick={send}>Request native update</Button>
    </div>}
  </section>;
}
