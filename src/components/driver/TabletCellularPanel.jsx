import { useEffect, useState } from "react";
import { Signal } from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { nativeTabletHealthAvailable, tabletSnapshot } from "@/lib/nativeTabletHealth";
import { cellularSummary } from "@/lib/tabletHealthSummary";

export default function TabletCellularPanel() {
  const [health, setHealth] = useState(null);
  useEffect(() => {
    if (!nativeTabletHealthAvailable()) return undefined;
    let stopped = false;
    const update = value => { if (!stopped) setHealth(value); };
    const changed = () => update(window.__ttNativeHealth);
    void tabletSnapshot().then(update);
    window.addEventListener("tt-native-health", changed);
    return () => { stopped = true; window.removeEventListener("tt-native-health", changed); };
  }, []);
  if (!health?.cellular) return null;
  const { cellular } = health;
  return <Card className="max-w-lg mx-auto">
    <CardHeader><CardTitle className="text-base flex items-center gap-2"><Signal className="w-5 h-5" /> Mobile connection</CardTitle></CardHeader>
    <CardContent className="space-y-2 text-sm">
      <p role="status">{cellularSummary({ cellular_state: cellular.state, cellular_carrier: cellular.carrier, cellular_bars: cellular.bars })}</p>
      <p>Using: {health.network === "mobile" ? "mobile data" : health.network === "wifi" ? "Wi-Fi" : health.network === "offline" ? "no network" : "another or unknown network"}</p>
      <p>{health.internetValidated === true ? "Android reports Internet access." : "Internet access has not been verified by Android."}</p>
      <p className="text-xs text-muted-foreground">Signal is the modem’s last available reading. A SIM or signal bars alone do not confirm Internet access.</p>
    </CardContent>
  </Card>;
}
