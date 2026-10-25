import React, { useEffect, useState } from "react";
import { CreditCard, RefreshCw } from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/tablet/settingsKit";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { nativeNfcState, setNativeNfcEnabled, onNativeNfcState, retryNativeNfc } from "@/lib/nativeNfc";
import { openUsbAutoAcceptSettings } from "@/lib/driverGps";

export default function UsbNfcPanel() {
  const [state, setState] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    let cancelled = false;
    const stop = onNativeNfcState(s => { if (!cancelled) setState(s); });
    nativeNfcState().then(s => { if (!cancelled) setState(s); });
    return () => { cancelled = true; stop(); };
  }, []);
  if (!state?.available) return null;
  const toggle = async enabled => {
    setBusy(true); setError("");
    try { setState(await setNativeNfcEnabled(enabled)); }
    catch { setError("Could not change the reader. Keep using the existing helper and retry."); }
    finally { setBusy(false); }
  };
  return <Card>
    <CardHeader className="pb-3"><CardTitle className="flex items-center gap-2 text-base"><CreditCard className="h-5 w-5" /> USB card reader</CardTitle></CardHeader>
    <CardContent className="space-y-3">
      <div className="flex items-center gap-3"><div className="flex-1">
        <p className="text-sm font-medium">Read cards in this app</p>
        <p className="text-xs text-muted-foreground">The ACR122U reader plugged into this device.</p>
      </div><Switch aria-label="Use integrated USB card reader" checked={state.enabled} disabled={busy} onCheckedChange={toggle} /></div>
      <p role="status" className="text-sm">{state.enabled ? state.status : "Off. Cards are read by the old helper app, if it is installed."}</p>
      <p className="text-xs text-muted-foreground">If the old McSween Helper is still installed, stop it first so both don't use the reader. Cards are read while the boarding screen is open.</p>
      {state.enabled && <>
        <p className="text-xs text-muted-foreground">{state.delivery || "No tap yet"}</p>
        <Button variant="outline" className="w-full" onClick={() => retryNativeNfc().catch(() => setError("Could not retry the reader."))}><RefreshCw className="mr-2 h-4 w-4" /> Check the reader</Button>
      </>}
      <Button variant="outline" className="w-full" onClick={() => openUsbAutoAcceptSettings().catch(() => setError("Open tablet Settings → Accessibility → McSween USB auto-accept (TransitTrack USB auto-accept on older versions)."))}>{state.autoAcceptEnabled ? "Answer USB questions by itself: on" : "Answer USB questions by itself"}</Button>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    </CardContent>
  </Card>;
}
