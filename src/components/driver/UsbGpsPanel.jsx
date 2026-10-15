import React, { useEffect, useState } from "react";
import { Satellite, RefreshCw } from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { readUsbGpsState, setUsbGpsEnabled, onUsbGpsState, rescanUsbGps } from "@/lib/driverGps";

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
  return <Card className="max-w-lg mx-auto">
    <CardHeader className="pb-3"><CardTitle className="flex items-center gap-2 text-base"><Satellite className="h-5 w-5" /> USB GPS receiver</CardTitle></CardHeader>
    <CardContent className="space-y-3">
      <div className="flex items-center gap-3">
        <div className="flex-1"><p className="text-sm font-medium">Use GPS directly in TransitTrack</p><p className="text-xs text-muted-foreground">VFAN / supported USB serial receivers</p></div>
        <Switch aria-label="Use integrated USB GPS" checked={state.enabled} disabled={busy} onCheckedChange={toggle} />
      </div>
      <p role="status" className="text-sm">{state.enabled ? state.status : "Using tablet GPS / existing helper"}</p>
      {!state.enabled && <p className="text-xs text-muted-foreground">Before switching on, stop the separate helper so both apps do not compete for the receiver. Keep it installed. Switch this off and restart the helper to go back.</p>}
      {state.enabled && <>
        <p className="text-xs text-muted-foreground">Allow Android USB access when asked. This receiver reconnects automatically while TransitTrack is open. Keep the app on screen while driving.</p>
        <Button variant="outline" className="w-full" onClick={() => { setError(""); rescanUsbGps().catch(() => setError("Could not retry USB GPS.")); }}><RefreshCw className="h-4 w-4 mr-2" /> Check GPS again</Button>
      </>}
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    </CardContent>
  </Card>;
}
