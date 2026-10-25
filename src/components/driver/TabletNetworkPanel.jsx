import { nativeTabletHealthAvailable } from "@/lib/nativeTabletHealth";
import React, { useEffect, useRef, useState } from "react";
import { Wifi, WifiOff, Signal, Radio, Lock, Loader2, RefreshCw, Eye, EyeOff, ChevronLeft } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/tablet/settingsKit";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { helperAtLeast, wifiPasswordProblem } from "@/lib/tabletNetworkAdmin";
import { LOCAL_NETWORK_HELPER_VERSION, helperKey, localCommandId, sendLocalCommand } from "@/lib/tabletNetwork";
import { wifiStatus, mobileStatus, hotspotStatus, freshNetworks, joinFor } from "@/lib/tabletNetworkStatus";
import { JoinStatus, SignalBars as Bars } from "@/components/system/WifiParts";

// A tablet's own Internet settings: driver tablet → Tablet settings (behind
// the driver's PIN); boarding tablet → hold the top bar, then the bus PIN.
// Wi-Fi on/off and choosing a network go straight to the TransitTrack Helper
// on this tablet (Helper 1.12); the password never leaves the tablet. Mobile
// data is shown only: Android lets just its own settings switch it.

// The helper writes its status into the page (window.__ttHelperHealth); read it
// again every second while this screen is open.
function useHelperStatus() {
  const read = () => (typeof window !== "undefined" ? window.__ttHelperHealth || null : null);
  const [h, setH] = useState(read);
  useEffect(() => {
    let last = read()?.at;
    const t = setInterval(() => {
      const now = read();
      if (now?.at !== last) { last = now?.at; setH(now); }
    }, 1000);
    return () => clearInterval(t);
  }, []);
  return h;
}

function Row({ icon: Icon, title, detail, children }) {
  return (
    <div className="flex items-center gap-3 rounded-lg border bg-card p-3">
      <Icon className="h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium">{title}</div>
        <div className="text-xs text-muted-foreground">{detail}</div>
      </div>
      {children}
    </div>
  );
}

function WifiChooser({ open, onOpenChange, h, current }) {
  const [since, setSince] = useState(0);
  const [chosen, setChosen] = useState(null);
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [error, setError] = useState("");
  const [joinId, setJoinId] = useState("");
  const networks = since ? freshNetworks(h, since) : null;
  const join = joinFor(h, joinId);
  const scanning = !!since && networks === null && Date.now() - since < 25000;

  const scan = async () => {
    setError("");
    const started = Date.now();
    setSince(started);
    const r = await sendLocalCommand("/wifi/scan", { id: localCommandId() });
    if (r !== "sent") setError("The tablet's helper didn't answer. Try again.");
  };
  useEffect(() => {
    if (open) scan();
    else { setChosen(null); setPassword(""); setShow(false); setError(""); setSince(0); }
    // Scan once each time the list opens.
  }, [open]);
  // Re-render while waiting so "still looking" turns into a message.
  const [, tick] = useState(0);
  useEffect(() => {
    if (!scanning && join?.state !== "joining") return undefined;
    const t = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, [scanning, join?.state]);

  const connect = async (network, pass) => {
    const problem = wifiPasswordProblem(network.lock, pass);
    if (problem) { setError(problem); return; }
    setError("");
    const id = localCommandId();
    const r = await sendLocalCommand("/wifi/join", { id, ssid: network.ssid, pass: network.lock === "open" ? "" : pass });
    setPassword("");
    if (r !== "sent") { setError("The tablet's helper didn't answer. Try again."); return; }
    setJoinId(id);
    setChosen(null);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Choose Wi-Fi</DialogTitle>
          <DialogDescription>
            {current ? <>Connected to <b>{current}</b>.</> : "Not connected to Wi-Fi."} The password stays on this tablet.
          </DialogDescription>
        </DialogHeader>

        <JoinStatus join={join} />
        {joinId && !join && <p role="status" className="text-sm text-muted-foreground"><Loader2 className="mr-1 inline h-3.5 w-3.5 animate-spin" />Connecting…</p>}
        {error && <p role="alert" className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}

        {chosen ? (
          <div className="space-y-3">
            <button type="button" className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground" onClick={() => { setChosen(null); setPassword(""); setError(""); }}>
              <ChevronLeft className="h-4 w-4" /> All networks
            </button>
            <p className="flex items-center gap-2 font-semibold"><Wifi className="h-4 w-4" /> {chosen.ssid}</p>
            <div className="space-y-1.5">
              <Label htmlFor="tt-tablet-wifi-pass">Wi-Fi password</Label>
              <div className="relative">
                <Input id="tt-tablet-wifi-pass" type={show ? "text" : "password"} autoComplete="off" autoFocus value={password}
                  onChange={(e) => setPassword(e.target.value)} className="h-12 pr-12 text-base"
                  onKeyDown={(e) => { if (e.key === "Enter") connect(chosen, password); }} />
                <button type="button" className="absolute right-0 top-0 grid h-12 w-12 place-items-center text-muted-foreground" aria-label={show ? "Hide password" : "Show password"} onClick={() => setShow((v) => !v)}>
                  {show ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                </button>
              </div>
            </div>
            <Button className="h-12 w-full text-base" onClick={() => connect(chosen, password)}>
              <Wifi className="mr-2 h-4 w-4" /> Connect
            </Button>
            <p className="text-xs text-muted-foreground">If it can't connect within about a minute, the tablet goes back to {current ? <b>{current}</b> : "how it was"}.</p>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm text-muted-foreground">{scanning ? "Looking for networks…" : networks ? `${networks.length} network${networks.length === 1 ? "" : "s"} found` : "Couldn't get the list."}</p>
              <Button size="sm" variant="outline" disabled={scanning} onClick={scan}>
                {scanning ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="mr-1 h-3.5 w-3.5" />} Scan again
              </Button>
            </div>
            {networks && networks.length > 0 && (
              <ul className="divide-y divide-border rounded-lg border" aria-label="Wi-Fi networks near this tablet">
                {networks.map((n) => {
                  const isCurrent = n.ssid === current;
                  const unsupported = n.lock === "unsupported";
                  return (
                    <li key={n.ssid}>
                      <button type="button" disabled={unsupported || isCurrent}
                        onClick={() => { setError(""); if (n.lock === "open") connect(n, ""); else setChosen(n); }}
                        className="flex min-h-[52px] w-full items-center gap-3 px-3 py-2 text-left hover:bg-accent disabled:cursor-default disabled:hover:bg-transparent">
                        <Bars n={n.bars} />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-medium">{n.ssid}</span>
                          {unsupported && <span className="block text-xs text-muted-foreground">Needs a company log-in; not supported</span>}
                        </span>
                        {isCurrent ? <span className="text-xs font-semibold text-success">Connected</span>
                          : n.lock === "password" ? <Lock className="h-4 w-4 text-muted-foreground" aria-label="Needs a password" /> : null}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
            {networks && networks.length === 0 && <p className="text-sm text-muted-foreground">No networks found. Move closer to the Wi-Fi and scan again.</p>}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

const clockTime = (iso) => {
  const t = Date.parse(iso || "");
  return Number.isFinite(t) ? new Date(t).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "";
};

export default function TabletNetworkPanel({ boarding = false, className = "" }) {
  const h = useHelperStatus();
  const [nativeEnabled, setNativeEnabled] = useState(() => window.__ttNativeNetwork?.enabled === true);
  useEffect(() => {
    const read = () => setNativeEnabled(window.__ttNativeNetwork?.enabled === true);
    window.addEventListener("tt-native-network", read);
    return () => window.removeEventListener("tt-native-network", read);
  }, []);
  const ready = !!h && helperAtLeast(h.version, LOCAL_NETWORK_HELPER_VERSION) && !!helperKey();
  const wifi = wifiStatus(h);
  const mobile = mobileStatus(h);
  const hotspot = hotspotStatus(h);
  const [wanted, setWanted] = useState(null);     // Wi-Fi switch moved, waiting for the tablet
  const [problem, setProblem] = useState("");
  const [chooserOpen, setChooserOpen] = useState(false);
  const wantedAt = useRef(0);

  // Fresh status as soon as the screen opens.
  useEffect(() => { if (ready) sendLocalCommand("/health"); }, [ready]);
  // The switch shows the new position until the tablet reports it (or 20 s).
  useEffect(() => {
    if (wanted === null) return undefined;
    if (wifi.enabled === wanted) { setWanted(null); return undefined; }
    const t = setTimeout(() => {
      setWanted(null);
      setProblem(wanted ? "Wi-Fi didn't switch on. Try again." : "Wi-Fi didn't switch off. Try again.");
    }, Math.max(0, 20000 - (Date.now() - wantedAt.current)));
    return () => clearTimeout(t);
  }, [wanted, wifi.enabled]);

  const alwaysHotspot = hotspot?.always === true;
  const setWifi = async (on) => {
    setProblem("");
    setWanted(on);
    wantedAt.current = Date.now();
    const r = await sendLocalCommand("/wifi/power", { on });
    if (r !== "sent") { setWanted(null); setProblem("The tablet's helper didn't answer. Try again."); }
  };

  const switchOn = wanted ?? wifi.enabled;
  const offUntil = !wifi.enabled && wanted === null ? clockTime(h?.wifi?.off_until) : "";
  const wifiDetail = wanted !== null ? (wanted ? "Switching on…" : "Switching off…") : offUntil ? `Off until ${offUntil}` : wifi.text;
  const hasMobile = !!h?.mobile;
  // The native health card shows the real connection and Android settings.
  // Do not render a disabled, misleading "Wi-Fi off" legacy-helper card.
  if (nativeEnabled || (!h && nativeTabletHealthAvailable())) return null;

  return (
    <Card className={className}>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Internet</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {!h && <p className="text-sm text-muted-foreground">The McSween Helper on this tablet isn't reporting yet. Wi-Fi can't be changed here until it does.</p>}
        {h && !ready && (
          <p className="rounded-lg bg-muted p-3 text-sm">
            To change Wi-Fi here, update the McSween Helper on this tablet to {LOCAL_NETWORK_HELPER_VERSION} or newer: plug it into the computer and run Update in the setup tool.
          </p>
        )}

        <Row icon={switchOn ? Wifi : WifiOff} title="Wi-Fi" detail={<span className="inline-flex items-center gap-2">{wifiDetail}{wifi.ssid && wanted === null ? <Bars n={wifi.bars} label="Wi-Fi signal" /> : null}</span>}>
          {wanted !== null && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" aria-hidden="true" />}
          <Switch checked={!!switchOn} disabled={!ready || alwaysHotspot || wanted !== null} onCheckedChange={setWifi} aria-label="Wi-Fi" />
        </Row>
        {alwaysHotspot && <p className="text-xs text-muted-foreground">The hotspot is set to Always on in Admin, so this tablet can't use Wi-Fi. Change it in Admin → Kiosk tablets.</p>}
        {!alwaysHotspot && ready && !wifi.enabled && hotspot?.text === "On" && (
          <p className="text-xs text-muted-foreground">Switching Wi-Fi on stops the hotspot, so the boarding tablet loses internet. The hotspot comes back by itself if no Wi-Fi connects within about 3 minutes.</p>
        )}
        {boarding && ready && (offUntil || (wifi.enabled && wanted === null)) && (
          <p className="text-xs text-muted-foreground">
            {offUntil
              ? `Card taps still work from the saved list. Wi-Fi comes back on by itself at ${offUntil}, so the tablet doesn't stay offline.`
              : "If you switch Wi-Fi off, it comes back on by itself after 30 minutes. A network chosen here is used now; the tablet still goes back to the bus hotspot when it's around."}
          </p>
        )}
        {problem && <p role="alert" className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{problem}</p>}
        {ready && wifi.enabled && !alwaysHotspot && wanted === null && (
          <Button variant="outline" className="h-12 w-full justify-start text-base" onClick={() => setChooserOpen(true)}>
            <Wifi className="mr-2 h-4 w-4" /> {wifi.ssid ? "Change Wi-Fi network" : "Choose a Wi-Fi network"}
          </Button>
        )}

        {(hasMobile || !boarding) && (
          <Row icon={Signal} title="Mobile data" detail={mobile.text}>
            {mobile.bars !== null && mobile.tone === "ok" && <Bars n={mobile.bars} label="Mobile signal" />}
          </Row>
        )}
        {hotspot && (
          <Row icon={Radio} title="Hotspot for the boarding tablet" detail={`${hotspot.text}${hotspot.always ? " · Always on (set in Admin)" : ""}`} />
        )}
        {(hasMobile || !boarding) && <p className="text-xs text-muted-foreground">Mobile data can only be switched on or off in Android's own settings; the setup tool's Update switches it on.</p>}
      </CardContent>
      {ready && <WifiChooser open={chooserOpen} onOpenChange={setChooserOpen} h={h} current={wifi.ssid} />}
    </Card>
  );
}
