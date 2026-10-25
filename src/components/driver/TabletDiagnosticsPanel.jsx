import { TRANSIT_TIME_ZONE } from "@/lib/localTime";
import React, { useEffect, useState } from "react";
import { Activity, RefreshCw, Wifi, Radio } from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/tablet/settingsKit";
import { Button } from "@/components/ui/button";
import { tabletSnapshot, openTabletWifiSettings, openTabletHotspotSettings } from "@/lib/nativeTabletHealth";

export default function TabletDiagnosticsPanel() {
  const [health, setHealth] = useState(null);
  const [error, setError] = useState("");
  const refresh = async () => { const s = await tabletSnapshot(); setHealth(s); };
  useEffect(() => {
    let stopped = false;
    const read = async () => { const s = await tabletSnapshot(); if (!stopped) setHealth(s); };
    void read();
    const timer = setInterval(read, 15000);
    return () => { stopped = true; clearInterval(timer); };
  }, []);
  if (!health?.available) return null;
  const storage = Number.isFinite(health.freeStorageMb) ? (health.freeStorageMb / 1024).toFixed(1) + " GB free" : "Unavailable";
  const temp = Number.isFinite(health.batteryTemperature) ? health.batteryTemperature + "°C" : "Unavailable";
  return <Card>
    <CardHeader className="pb-3"><CardTitle className="flex items-center gap-2 text-base"><Activity className="h-5 w-5" /> Tablet health</CardTitle></CardHeader>
    <CardContent className="space-y-3">
      <p className="text-xs text-muted-foreground">{health.model} · Android {health.androidVersion}</p>
      <dl className="grid grid-cols-2 gap-3 text-sm">
        <div><dt className="text-muted-foreground">Battery</dt><dd>{Number.isFinite(health.battery) ? health.battery + "%" : "Unavailable"} · {health.charging === true ? "Charging" : health.charging === false ? "On battery" : "Unknown"}</dd></div>
        <div><dt className="text-muted-foreground">Temperature</dt><dd>{temp}</dd></div>
        <div><dt className="text-muted-foreground">Storage</dt><dd>{storage}</dd></div>
        <div><dt className="text-muted-foreground">Network</dt><dd>{health.network || "Unknown"}{health.internetValidated === false ? " · Internet unconfirmed" : ""}</dd></div>
        <div><dt className="text-muted-foreground">USB accessories</dt><dd>{health.usbDevices ?? "Unknown"}</dd></div>
        {health.bluetooth && <div className="col-span-2"><dt className="text-muted-foreground">Bluetooth boarding</dt><dd>{health.bluetooth.status || "Unavailable"}</dd></div>}
      </dl>
      {health.battery <= 10 && !health.charging && <p role="alert" className="text-sm text-warning">Battery is low. Check the charger and cable.</p>}
      {health.batteryTemperature >= 45 && <p role="alert" className="text-sm text-warning">Tablet battery is hot. Move it out of direct sunlight.</p>}
      {health.freeStorageMb < 200 && <p role="alert" className="text-sm text-warning">Storage is almost full. Free space before the offline queue fills.</p>}
      <Button variant="outline" className="w-full" onClick={refresh}><RefreshCw className="mr-2 h-4 w-4" /> Refresh tablet health</Button>
      <div className="grid grid-cols-2 gap-2">
        <Button variant="outline" onClick={() => openTabletWifiSettings().catch(() => setError("Open Wi-Fi from Android Settings."))}><Wifi className="mr-2 h-4 w-4" /> Wi-Fi settings</Button>
        <Button variant="outline" onClick={() => openTabletHotspotSettings().catch(() => setError("Open Hotspot from Android Settings."))}><Radio className="mr-2 h-4 w-4" /> Hotspot settings</Button>
      </div>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <details><summary className="cursor-pointer text-sm">Recent diagnostics</summary>
        <ul className="mt-2 space-y-1 text-xs text-muted-foreground">{(health.events || []).slice(-12).reverse().map((event, i) => <li key={i}>{new Date(event.at).toLocaleTimeString([], { timeZone: TRANSIT_TIME_ZONE })} · {event.component}: {event.code.toLowerCase().replace(/_/g, " ")}</li>)}</ul>
      </details>
    </CardContent>
  </Card>;
}
