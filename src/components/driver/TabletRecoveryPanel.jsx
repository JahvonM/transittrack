import { useEffect, useState } from "react";
import { Home } from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { tabletRecoveryState, openTabletHomeSettings } from "@/lib/tabletRecovery";

export default function TabletRecoveryPanel() {
  const [state, setState] = useState(null), [error, setError] = useState("");
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
      <p className="text-sm">Screen stays awake while TransitTrack is visible, on battery or charger.</p>
      <p role="status" className="text-sm">{state.defaultHome ? "TransitTrack is the tablet's Home app." : "Android Home app has not been set to TransitTrack."}</p>
      <p className="text-xs text-muted-foreground">Optional: choose TransitTrack Kiosk as the Home app to open it when Android starts its home screen after unlock. This replaces the current Home app, including FreeKiosk if selected. You can change it back in Android settings.</p>
      <Button variant="outline" className="w-full" onClick={() => openTabletHomeSettings().catch(e => setError(e?.message || "Open Default apps → Home app in Android settings."))}>Open Android Home settings</Button>
      <p className="text-xs text-muted-foreground">USB readers reconnect while this app is open. Android may ask which app should open for an attached reader or GPS receiver; choose TransitTrack Kiosk only when ready to switch from the helper.</p>
      <p className="text-xs text-muted-foreground">USB GPS pauses at 5% battery when unplugged. It resumes when charging or at 8%. The card reader and visible screen stay active. Tracking does not continue in the background.</p>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    </CardContent>
  </Card>;
}
