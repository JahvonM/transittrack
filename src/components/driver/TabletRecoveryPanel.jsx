import { useEffect, useState } from "react";
import { Home } from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
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
  return <Card className="max-w-lg mx-auto">
    <CardHeader><CardTitle className="text-base flex items-center gap-2"><Home className="w-5 h-5" /> Startup &amp; recovery</CardTitle></CardHeader>
    <CardContent className="space-y-3">
      {state.localKioskSettings && <>
        <Button className="w-full" onClick={() => openLocalKioskSettings().catch(() => setError("Could not open kiosk settings."))}>Kiosk lock &amp; exit code</Button>
        <p className="text-xs text-muted-foreground">Set the exit code and turn kiosk mode on or off on this device. Tapping the top-right corner of the screen 5 times also opens these settings, even offline.</p>
      </>}
      {state.screenRecovery?.available && <p className="text-sm">Screen recovery is ready. If Android closes the app’s display, the kiosk reopens it, with a limit to prevent repeated restarts. Saved pairing and records stay on this tablet.</p>}
      {state.screenControl ? <div className="flex items-center justify-between gap-3 rounded-xl border p-3">
        <div><label htmlFor="tablet-keep-screen-on" className="text-sm font-medium">Keep screen on</label>
          <p className="text-xs text-muted-foreground">{state.keepScreenOn ? "Stays awake while the kiosk is open, on battery or charger." : "Uses Android’s normal screen timeout."}</p></div>
        <Switch id="tablet-keep-screen-on" checked={state.keepScreenOn} disabled={saving} onCheckedChange={changeScreen} />
      </div> : <p className="text-sm">Screen stays awake while the kiosk is visible. Install the latest kiosk update to add the on/off switch.</p>}
      <p className="text-xs text-muted-foreground">Saved for this tablet after restart. The power button still works. Rear-camera recording keeps its screen awake while open; background GPS has its own switch.</p>
      <p role="status" className="text-sm">{state.defaultHome ? "McSween Kiosk is the tablet's Home app." : "Android Home app has not been set to McSween Kiosk."}</p>
      <p className="text-xs text-muted-foreground">Optional: choose McSween Kiosk (called TransitTrack Kiosk before the rename) as the Home app to open it when Android starts its home screen after unlock. This replaces the current Home app, including FreeKiosk if selected. You can change it back in Android settings.</p>
      <Button variant="outline" className="w-full" onClick={() => openTabletHomeSettings().catch(e => setError(e?.message || "Open Default apps → Home app in Android settings."))}>Open Android Home settings</Button>
      <p className="text-xs text-muted-foreground">USB readers reconnect while this app is open. Android may ask which app should open for an attached reader or GPS receiver; choose McSween Transport Kiosk only when ready to switch from the helper.</p>
      <p className="text-xs text-muted-foreground">USB GPS pauses at 5% battery when unplugged. It resumes when charging or at 8%. The card reader stays active while the boarding screen is ready. Background tracking needs the separate “GPS with screen off” setting in driver mode.</p>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    </CardContent>
  </Card>;
}
