import React, { useEffect, useState } from "react";
import { Satellite, RefreshCw } from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/tablet/settingsKit";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { readUsbGpsState, setUsbGpsEnabled, onUsbGpsState, rescanUsbGps, openUsbAutoAcceptSettings } from "@/lib/driverGps";

export default function UsbGpsPanel() {
  const [state, setState] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    let cancelled = false;
    const stop = onUsbGpsState(s => { if (!cancelled) setState(s); });
    readUsbGpsState().then(s => { if (!cancelled) setState(s); });
    return () => { cancelled = true; stop(); };
  }, []);
  if (!state?.available) return null;
  const toggle = async enabled => {
    setBusy(true); setError("");
    try { setState(await setUsbGpsEnabled(enabled)); }
    catch { setError("Could not change GPS source. Keep using the helper and try again."); }
    finally { setBusy(false); }
  };
  return <Card>
    <CardHeader className="pb-3"><CardTitle className="flex items-center gap-2 text-base"><Satellite className="h-5 w-5" /> USB GPS receiver</CardTitle></CardHeader>
    <CardContent className="space-y-3">
      <div className="flex items-center gap-3">
        <div className="flex-1"><p className="text-sm font-medium">Use the USB GPS receiver</p><p className="text-xs text-muted-foreground">VFAN and other USB receivers plugged into this tablet.</p></div>
        <Switch aria-label="Use integrated USB GPS" checked={state.enabled} disabled={busy} onCheckedChange={toggle} />
      </div>
      <p role="status" className="text-sm">{state.enabled ? state.status : "Off. Using the tablet's own GPS."}</p>
      {!state.enabled && <p className="text-xs text-muted-foreground">If the old McSween Helper is still installed, stop it first so both apps don't use the receiver.</p>}
      {state.enabled && <>
        <p className="text-xs text-muted-foreground">Allow USB access when Android asks. The receiver reconnects by itself. Turn on GPS with screen off to keep sharing when the app is in the background.</p>
        <Button variant="outline" className="w-full" onClick={() => { setError(""); rescanUsbGps().catch(() => setError("Could not retry USB GPS.")); }}><RefreshCw className="h-4 w-4 mr-2" /> Check the receiver</Button>
      </>}
      <div className="space-y-2 border-t border-border pt-3">
        <p className="text-sm font-medium">Answer USB questions by itself: {state.autoAcceptEnabled ? "On" : "Off"}</p>
        <p className="text-xs text-muted-foreground">Android asks before the app can use the receiver. This says yes for you. Turn it on once in Android's Accessibility settings.</p>
        <Button variant="outline" className="w-full" onClick={() => { setError(""); openUsbAutoAcceptSettings().catch(() => setError("Open tablet Settings → Accessibility → McSween USB auto-accept (TransitTrack USB auto-accept on older versions).")); }}>{state.autoAcceptEnabled ? "Open Accessibility settings" : "Turn it on"}</Button>
      </div>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    </CardContent>
  </Card>;
}
