import { useEffect, useState } from "react";
import { Bluetooth } from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/tablet/settingsKit";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { boardingBluetoothState, enableBoardingBluetooth, onBoardingBluetoothState, retryBoardingBluetooth, openBoardingBluetoothSettings } from "@/lib/nativeBoardingBluetooth";

export default function BoardingBluetoothPanel() {
  const [state, setState] = useState(null), [busy, setBusy] = useState(false), [error, setError] = useState("");
  useEffect(() => {
    let stopped = false;
    const stop = onBoardingBluetoothState(value => { if (!stopped) setState(value); });
    void boardingBluetoothState().then(value => { if (!stopped) setState(value); });
    return () => { stopped = true; stop(); };
  }, []);
  if (!state?.available) return null;
  const run = async action => {
    setBusy(true); setError("");
    try { const next = await action(); if (next?.available) setState(next); }
    catch (e) { setError(e?.message || "Bluetooth could not start. Use NFC, QR or your code."); }
    finally { setBusy(false); }
  };
  return <Card>
    <CardHeader><CardTitle className="text-base flex items-center gap-2"><Bluetooth className="h-5 w-5" /> Bluetooth boarding</CardTitle></CardHeader>
    <CardContent className="space-y-3">
      <div className="flex items-center gap-3">
        <p className="text-sm flex-1">Let passengers send their boarding QR code from their phone.</p>
        <Switch aria-label="Use integrated Bluetooth boarding" checked={!!state.enabled} disabled={busy} onCheckedChange={enabled => run(() => enableBoardingBluetooth(enabled))} />
      </div>
      <p role="status" className="text-sm">{state.status || "Off"}</p>
      <p className="text-xs text-muted-foreground">Android may ask for Nearby devices permission. While this is on, the device's Bluetooth name is the bus name.</p>
      <p className="text-xs text-muted-foreground">Works while this boarding screen is open. A sent code still needs verification and Boarding or Exiting confirmation.</p>
      {state.enabled && <Button className="w-full" variant="outline" disabled={busy} onClick={() => run(retryBoardingBluetooth)}>Retry Bluetooth boarding</Button>}
      <Button className="w-full" variant="outline" disabled={busy} onClick={() => run(openBoardingBluetoothSettings)}>Open Android Bluetooth settings</Button>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    </CardContent>
  </Card>;
}
