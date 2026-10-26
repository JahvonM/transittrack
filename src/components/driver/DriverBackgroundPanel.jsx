import { useEffect, useState } from "react";
import { Satellite, Download } from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/tablet/settingsKit";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { backgroundGpsState, setBackgroundGpsEnabled, exportBackgroundGps } from "@/lib/driverBackground";
import { ownDeviceNoun } from "@/lib/driverOwnDevice";

export default function DriverBackgroundPanel({ vehicle, phone = false }) {
 const [state, setState] = useState(null), [busy, setBusy] = useState(false), [error, setError] = useState("");
 useEffect(() => {
  let stopped = false;
  const refresh = () => { void backgroundGpsState().then(s => { if (!stopped) setState({ ...s, setupError: window.__ttBackgroundSetupError || "" }); }).catch(() => {}); };
  refresh(); const timer = setInterval(refresh, 5000);
  return () => { stopped = true; clearInterval(timer); };
 }, []);
 if (!state?.available) return null;
 const toggle = async enabled => {
  setBusy(true); setError("");
  try { await setBackgroundGpsEnabled(enabled); setState(await backgroundGpsState()); }
  catch (e) { setError(e?.message || "Could not change background GPS."); }
  finally { setBusy(false); }
 };
 const download = async () => {
  setBusy(true); setError("");
  try {
   const points = await exportBackgroundGps(vehicle);
   const url = URL.createObjectURL(new Blob([JSON.stringify({ format: "driver-gps-export-v1", exported_at: new Date().toISOString(), points }, null, 2)], { type: "application/json" }));
   const a = document.createElement("a"); a.href = url; a.download = "saved-driver-gps.json"; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 30000);
  } catch (e) { setError(e?.message || "Could not export saved GPS. Nothing was cleared."); }
  finally { setBusy(false); }
 };
 return <Card>
  <CardHeader><CardTitle className="text-base flex items-center gap-2"><Satellite className="w-5 h-5" /> GPS with screen off</CardTitle></CardHeader>
  <CardContent className="space-y-3">
   <div className="flex items-center gap-3"><div className="flex-1"><p className="font-medium text-sm">Keep sharing in the background</p><p className="text-xs text-muted-foreground">{phone ? `Uses this ${ownDeviceNoun()}'s GPS while you share the bus.` : "Uses the selected USB receiver or tablet GPS."}</p></div><Switch aria-label="Keep driver GPS in background" checked={state.enabled === true} disabled={busy} onCheckedChange={toggle} /></div>
   <p className="text-sm">{state.active ? state.status : state.enabled ? "Ready. Starts when this bus is sharing and the driver PIN is verified." : "Background GPS is off. Foreground tracking is unchanged."}</p>
   <p className="text-xs text-muted-foreground">{phone
    ? `While it's on, your ${ownDeviceNoun()} shows that its location is in use (a notification on Android, the location arrow on iPhone and iPad). Points are saved on the ${ownDeviceNoun()} first and keep their bus. It stops when you stop sharing, end the shift or change bus.`
    : "A tracking notification stays visible while active. GPS points are saved on this tablet before upload and keep their original bus/company. Android can still stop the app; reopening restores a valid session. On Android 10, restart recovery also attempts to resume an unexpired session."}</p>
   <p className="text-sm">Saved GPS: {state.pending || 0} waiting · {state.review || 0} need review</p>
   {(state.pending > 0 || state.review > 0) && <Button variant="outline" disabled={busy} onClick={download}><Download className="w-4 h-4 mr-2" /> Export saved GPS</Button>}
   <p className="text-xs text-muted-foreground">Export keeps the originals. Failed points are retained. Exports cover this bus only; records from an old assignment stay private for administrator recovery. Locations are private; share exports only with your transport administrator.</p>
   {state.enabled && !state.active && state.setupError && <p role="alert" className="text-sm text-destructive">{state.setupError}</p>}
   {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
  </CardContent>
 </Card>;
}
