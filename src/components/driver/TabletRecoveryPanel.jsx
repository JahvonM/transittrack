import { useEffect, useState } from "react";
import { Home } from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/tablet/settingsKit";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { tabletRecoveryState, openTabletHomeSettings, setTabletKeepScreenOn, openLocalKioskSettings } from "@/lib/tabletRecovery";

export default function TabletRecoveryPanel() {
  const [state, setState] = useState(null), [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const changeScreen = async enabled => {
    setSaving(true); setError("");
    try { const result = await setTabletKeepScreenOn(enabled); setState(old => ({ ...old, keepScreenOn: result.keepScreenOn })); }
    catch { setError("Could not change the screen setting. Try again."); }
    finally { setSaving(false); }
  };
  useEffect(() => {
    let stopped = false;
    const refresh = () => { void tabletRecoveryState().then(value => { if (!stopped) setState(value); }); };
    refresh();
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => { stopped = true; window.removeEventListener("focus", refresh); document.removeEventListener("visibilitychange", refresh); };
  }, []);
  if (!state?.available) return null;
  return <Card>
    <CardHeader><CardTitle className="text-base flex items-center gap-2"><Home className="w-5 h-5" /> Startup</CardTitle></CardHeader>
    <CardContent className="space-y-3">
      {state.localKioskSettings && <>
        <Button className="w-full" onClick={() => openLocalKioskSettings().catch(() => setError("Could not open kiosk settings."))}>Kiosk lock &amp; exit code</Button>
        <p className="text-xs text-muted-foreground">Set the exit code and turn kiosk mode on or off on this device. Tapping the top-right corner of the screen 5 times also opens these settings, even offline.</p>
      </>}
      {state.screenRecovery?.available && <p className="text-sm">If the app's screen stops, it reopens by itself. Pairing and saved work stay on the device.</p>}
      {state.screenControl ? <div className="flex items-center justify-between gap-3 rounded-xl border p-3">
        <div><label htmlFor="tablet-keep-screen-on" className="text-sm font-medium">Keep screen on</label>
          <p className="text-xs text-muted-foreground">{state.keepScreenOn ? "Stays awake while the kiosk is open, on battery or charger." : "Uses Android’s normal screen timeout."}</p></div>
        <Switch id="tablet-keep-screen-on" checked={state.keepScreenOn} disabled={saving} onCheckedChange={changeScreen} />
      </div> : <p className="text-sm">Screen stays awake while the kiosk is visible. Install the latest kiosk update to add the on/off switch.</p>}
            <p role="status" className="text-sm">{state.defaultHome ? "McSween Kiosk opens when the device starts." : "McSween Kiosk isn't the Home app yet."}</p>
      <p className="text-xs text-muted-foreground">With kiosk mode on, this happens by itself. Without it, choose McSween Kiosk as the Home app so it opens after a restart.</p>
      <Button variant="outline" className="w-full" onClick={() => openTabletHomeSettings().catch(e => setError(e?.message || "Open Default apps → Home app in Android settings."))}>Choose the Home app</Button>
                  {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    </CardContent>
  </Card>;
}
