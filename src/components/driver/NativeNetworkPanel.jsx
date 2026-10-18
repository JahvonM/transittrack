import { useEffect, useState } from "react";
import { Wifi, Radio } from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { nativeNetworkState, onNativeNetworkState, enableNativeNetwork, requestNetworkScanAccess, executeNativeNetwork, nativeNetworkResultText, nativeNetworkSuccess, openHotspotPermission } from "@/lib/nativeTabletNetwork";
import { openTabletWifiSettings, openTabletHotspotSettings } from "@/lib/nativeTabletHealth";
import { localCommandId } from "@/lib/tabletNetwork";

export default function NativeNetworkPanel({ boarding = false }) {
  const [state, setState] = useState(null), [busy, setBusy] = useState(false), [message, setMessage] = useState("");
  const [selected, setSelected] = useState(null), [password, setPassword] = useState("");
  useEffect(() => {
    let stopped = false;
    const read = () => { void nativeNetworkState().then(s => { if (!stopped) setState(s); }); };
    read();
    const stop = onNativeNetworkState(s => { if (!stopped) setState(s); });
    window.addEventListener("focus", read); document.addEventListener("visibilitychange", read);
    return () => { stopped = true; stop(); window.removeEventListener("focus", read); document.removeEventListener("visibilitychange", read); };
  }, []);
  if (!state?.available) return null;
  const cap = state.capabilities || {}, wifi = state.wifi || {};
  const run = async task => {
    setBusy(true); setMessage("");
    try {
      const result = await task();
      if (result?.code) setMessage(nativeNetworkResultText(result.code));
      if (result?.available) setState(result);
    } catch { setMessage("Network action could not complete. Check Android settings and retry."); }
    finally { setBusy(false); }
  };
  const command = value => run(() => executeNativeNetwork({ id: localCommandId(), ...value }));
  const connect = () => {
    const ssid = selected?.ssid, pass = selected?.lock === "open" ? "" : password;
    setPassword(""); setSelected(null);
    void command({ type: "wifi_join", ssid, password: pass });
  };
  return <Card className="max-w-lg mx-auto">
    <CardHeader><CardTitle className="text-base flex gap-2 items-center"><Wifi className="w-5 h-5" /> Integrated Internet controls</CardTitle></CardHeader>
    <CardContent className="space-y-4">
      <label className="flex items-center gap-3 text-sm"><span className="flex-1">Use network controls in this app</span><Switch checked={!!state.enabled} disabled={busy} onCheckedChange={on => run(() => enableNativeNetwork(on))} aria-label="Use integrated network controls" /></label>
      <p className="text-xs text-muted-foreground">Stop network automation in the old helper before enabling this. Keep the helper installed. Some Android controls need managed-device access or special permission.</p>
      {state.enabled && <>
        <p className="text-sm">{wifi.ssid ? "Wi-Fi: " + wifi.ssid : wifi.enabled ? "Wi-Fi on; network name unavailable or disconnected." : "Wi-Fi off or unavailable."}</p>
        {!cap.managedWifi && <p className="text-xs text-muted-foreground">Direct joining and Wi-Fi power changes are blocked by Android on this setup. You can scan here, then connect in Android settings. The current helper remains an alternative.</p>}
        {!cap.scanPermission && <Button variant="outline" className="w-full" disabled={busy} onClick={() => run(requestNetworkScanAccess)}>Allow Wi-Fi scan access</Button>}
        {!cap.locationOn && <p className="text-xs text-muted-foreground">Turn Android Location on before scanning.</p>}
        <div className="flex gap-2">
          <Button variant="outline" disabled={busy || !cap.scanPermission} onClick={() => command({ type: "wifi_scan" })}>Scan nearby Wi-Fi</Button>
          <Button variant="outline" onClick={() => run(openTabletWifiSettings)}>Android Wi-Fi settings</Button>
        </div>
        {cap.managedWifi && <label className="flex items-center gap-3 text-sm"><span className="flex-1">Wi-Fi power</span><Switch checked={!!wifi.enabled} disabled={busy} aria-label="Integrated Wi-Fi power" onCheckedChange={on => command({ type: "wifi_power", on })} /></label>}
        {(wifi.networks || []).length > 0 && <ul aria-label="Integrated nearby Wi-Fi" className="divide-y rounded-xl border">
          {wifi.networks.map(n => <li key={n.ssid}><button className="p-3 w-full text-left text-sm disabled:opacity-60" disabled={busy || !cap.managedWifi || n.lock === "unsupported" || n.ssid === wifi.ssid} onClick={() => { setSelected(n); setPassword(""); }}>
            {n.ssid} · {n.bars}/4 · {n.lock}{n.ssid === wifi.ssid ? " · Connected" : ""}
          </button></li>)}
        </ul>}
        {selected && <div className="space-y-2">
          <p className="text-sm font-medium">Connect to {selected.ssid}</p>
          {selected.lock === "password" && <Input aria-label="Integrated Wi-Fi password" type="password" autoComplete="off" value={password} onChange={e => setPassword(e.target.value)} />}
          <p className="text-xs text-muted-foreground">If Android already saved this network, its saved credentials are used. Update those credentials in Android settings. Joining can interrupt this connection.</p>
          <Button disabled={busy || (selected.lock === "password" && (password.length < 8 || password.length > 63))} onClick={connect}>Connect selected Wi-Fi</Button>
          <Button variant="ghost" onClick={() => { setSelected(null); setPassword(""); }}>Cancel</Button>
        </div>}
        {!boarding && <div className="border-t pt-3 space-y-3">
          <p className="text-sm flex gap-2 items-center"><Radio className="w-4 h-4" />Hotspot: {state.hotspot || "Unknown"}</p>
          <label className="flex items-center gap-3 text-sm"><span className="flex-1">Keep hotspot on while this driver app is open</span><Switch aria-label="Integrated keep hotspot on" checked={!!state.hotspot_always} disabled={busy} onCheckedChange={always_on => command({ type: "hotspot", always_on })} /></label>
          <p className="text-xs text-muted-foreground">Android 10 firmware support is checked when used. Hotspot changes can disconnect Wi-Fi. Below 5% unplugged, the app tries to stop a hotspot it manages; it resumes on power or at 8%. Turning this switch off stops automation and leaves hotspot power unchanged.</p>
          {!cap.writeSettings && <Button variant="outline" className="w-full" onClick={() => run(openHotspotPermission)}>Open Modify system settings permission</Button>}
          <Button variant="outline" className="w-full" onClick={() => run(openTabletHotspotSettings)}>Android hotspot settings</Button>
        </div>}
        {busy && <p role="status" className="text-sm">Waiting for Android. Joining can take up to 45 seconds.</p>}
      </>}
      {message && <p role="status" className="text-sm">{message}</p>}
      {!message && state.last_code && !nativeNetworkSuccess(state.last_code) && <p role="status" className="text-sm">{nativeNetworkResultText(state.last_code)}</p>}
    </CardContent>
  </Card>;
}
