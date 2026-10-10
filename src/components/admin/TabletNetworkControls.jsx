import React, { useEffect, useRef, useState } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Wifi, WifiOff, Lock, Radio, Loader2, RefreshCw, CheckCircle2, AlertTriangle, Eye, EyeOff, ChevronLeft } from "lucide-react";
import { toast } from "@/components/ui/use-toast";
import { errorData } from "@/lib/requestError";
import {
  NETWORK_HELPER_VERSION, helperAtLeast, pendingCommand, commandProgress, latestJoin,
  scannedNetworks, wifiPasswordProblem, hotspotAlwaysOn,
} from "@/lib/tabletNetworkAdmin";

// Admin → Kiosk tablets: choose a boarding tablet's Wi-Fi, or keep a driver
// tablet's hotspot on all the time. The command reaches the tablet on its next
// check-in (kioskNetwork → tablet page → TransitTrack Helper 1.9 on the tablet).

function timeAgo(iso) {
  if (!iso) return "";
  const mins = Math.floor((Date.now() - Date.parse(iso)) / 60000);
  if (!Number.isFinite(mins)) return "";
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.floor(mins / 60);
  return hrs < 24 ? `${hrs} h ago` : `${Math.floor(hrs / 24)} d ago`;
}

function Bars({ n = 0 }) {
  return (
    <span className="inline-flex items-end gap-0.5 h-3.5" role="img" aria-label={`Signal ${n} of 4`}>
      {[1, 2, 3, 4].map((i) => (
        <span key={i} className={`w-1 rounded-sm ${i <= n ? "bg-foreground/70" : "bg-muted-foreground/25"}`} style={{ height: `${i * 25}%` }} />
      ))}
    </span>
  );
}

async function sendCommand(device, payload) {
  const res = await base44.functions.invoke("kioskNetwork", { device_id: device.id, ...payload });
  if (res?.data?.error) throw new Error(res.data.error);
  return res.data;
}
const problemText = (e) => errorData(e).error || e?.message || "Try again.";

// While something is on its way, refresh the tablet list so results show up.
function useRefreshWhile(active, onRefresh, ms = 8000) {
  const latest = useRef(onRefresh);
  latest.current = onRefresh;
  useEffect(() => {
    if (!active) return undefined;
    const t = setInterval(() => latest.current?.(), ms);
    return () => clearInterval(t);
  }, [active, ms]);
}

function NeedsHelper() {
  return <span className="text-muted-foreground">needs Helper {NETWORK_HELPER_VERSION}+ on the tablet (run Update in the setup tool)</span>;
}

function WifiPicker({ device, open, onOpenChange, onRefresh }) {
  const wifi = device.helper_health?.wifi || {};
  const networks = scannedNetworks(device);
  const pending = pendingCommand(device);
  const join = latestJoin(device);
  const [chosen, setChosen] = useState(null);
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useRefreshWhile(open, onRefresh);
  useEffect(() => { if (!open) { setChosen(null); setPassword(""); setError(""); setShow(false); } }, [open]);

  const scanning = pending?.type === "wifi_scan";
  const scan = async () => {
    setBusy(true); setError("");
    try { await sendCommand(device, { action: "scan" }); await onRefresh?.(); }
    catch (e) { setError(problemText(e)); }
    finally { setBusy(false); }
  };
  const connect = async () => {
    const problem = wifiPasswordProblem(chosen.lock, password);
    if (problem) { setError(problem); return; }
    setBusy(true); setError("");
    try {
      await sendCommand(device, { action: "join", ssid: chosen.ssid, password: chosen.lock === "open" ? "" : password });
      setPassword("");
      setChosen(null);
      toast({ title: `Sent: join ${chosen.ssid}`, description: "The tablet switches within about a minute. If it can't connect, it goes back to its current Wi-Fi." });
      await onRefresh?.();
    } catch (e) { setError(problemText(e)); }
    finally { setBusy(false); }
  };

  const progress = commandProgress(device);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Wi-Fi for {device.label}</DialogTitle>
          <DialogDescription>
            {wifi.ssid ? <>Connected to <b>{wifi.ssid}</b>.</> : "Not connected to Wi-Fi right now."} Choose a network the tablet can see.
          </DialogDescription>
        </DialogHeader>

        {join && (
          <div role="status" className={`flex items-start gap-2 rounded-lg p-3 text-sm ${join.state === "failed" ? "bg-destructive/10 text-destructive" : join.state === "connected" ? "bg-success/10" : "bg-muted"}`}>
            {join.state === "joining" ? <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin" /> : join.state === "connected" ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" /> : <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />}
            <span>{join.message || join.state}{join.at ? ` · ${timeAgo(join.at)}` : ""}</span>
          </div>
        )}
        {progress && <p role="status" className="text-sm text-muted-foreground">{progress}</p>}
        {error && <p role="alert" className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}

        {chosen ? (
          <div className="space-y-3">
            <button type="button" className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground" onClick={() => { setChosen(null); setPassword(""); setError(""); }}>
              <ChevronLeft className="h-4 w-4" /> All networks
            </button>
            <p className="flex items-center gap-2 font-semibold"><Wifi className="h-4 w-4" /> {chosen.ssid}</p>
            {chosen.lock === "password" ? (
              <div className="space-y-1.5">
                <Label htmlFor="tt-wifi-pass">Wi-Fi password</Label>
                <div className="relative">
                  <Input id="tt-wifi-pass" type={show ? "text" : "password"} autoComplete="off" value={password} onChange={(e) => setPassword(e.target.value)} className="pr-11 h-11" onKeyDown={(e) => { if (e.key === "Enter") connect(); }} />
                  <button type="button" className="absolute right-0 top-0 grid h-11 w-11 place-items-center text-muted-foreground" aria-label={show ? "Hide password" : "Show password"} onClick={() => setShow((v) => !v)}>
                    {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Open network: no password needed.</p>
            )}
            <p className="text-xs text-muted-foreground">
              The password goes to this tablet only and is deleted from the server once the tablet has it.
              If the tablet can't connect within about a minute, it goes back to {wifi.ssid ? <b>{wifi.ssid}</b> : "its current network"}.
            </p>
            <Button className="w-full h-11" disabled={busy} onClick={connect}>
              {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Wifi className="mr-2 h-4 w-4" />} Connect the tablet
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm text-muted-foreground">
                {wifi.scanned_at ? `Networks found ${timeAgo(wifi.scanned_at)}` : "No scan yet."}
              </p>
              <Button size="sm" variant="outline" disabled={busy || scanning} onClick={scan}>
                {scanning ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="mr-1 h-3.5 w-3.5" />}
                {scanning ? "Scanning…" : wifi.scanned_at ? "Scan again" : "Scan for networks"}
              </Button>
            </div>
            {networks.length > 0 ? (
              <ul className="divide-y divide-border rounded-lg border" aria-label="Wi-Fi networks near the tablet">
                {networks.map((n) => {
                  const current = n.ssid === wifi.ssid;
                  const unsupported = n.lock === "unsupported";
                  return (
                    <li key={n.ssid}>
                      <button type="button" disabled={unsupported || current} onClick={() => { setChosen(n); setError(""); }}
                        className="flex min-h-[48px] w-full items-center gap-3 px-3 py-2 text-left hover:bg-accent disabled:cursor-default disabled:hover:bg-transparent">
                        <Bars n={n.bars} />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-medium">{n.ssid}</span>
                          {unsupported && <span className="block text-xs text-muted-foreground">Needs a company log-in; not supported</span>}
                        </span>
                        {current ? <span className="text-xs font-semibold text-success">Connected</span>
                          : n.lock === "password" ? <Lock className="h-4 w-4 text-muted-foreground" aria-label="Needs a password" /> : null}
                      </button>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">Press Scan to see the Wi-Fi networks around the tablet. The list appears within about a minute.</p>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function BoardingWifi({ device, onRefresh }) {
  const [open, setOpen] = useState(false);
  const h = device.helper_health || {};
  const ready = helperAtLeast(h.version);
  const wifi = h.wifi || {};
  const join = latestJoin(device);
  // (The open chooser refreshes on its own.)
  useRefreshWhile(!open && (!!pendingCommand(device) || join?.state === "joining"), onRefresh, 10000);
  return (
    <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
      <span className="flex items-center gap-1.5">
        {wifi.ssid ? <Wifi className="h-3.5 w-3.5" /> : <WifiOff className="h-3.5 w-3.5 text-muted-foreground" />}
        Wi-Fi:{" "}
        {!ready ? <NeedsHelper /> : wifi.ssid ? <><b>{wifi.ssid}</b> <Bars n={wifi.bars} /></> : <span className="text-muted-foreground">not connected</span>}
      </span>
      {ready && (
        <Button size="sm" variant="outline" className="h-8" onClick={() => setOpen(true)}>
          <Wifi className="h-3.5 w-3.5" /> Choose Wi-Fi
        </Button>
      )}
      {join?.state === "failed" && <span className="text-xs text-destructive">{join.message}</span>}
      {ready && <WifiPicker device={device} open={open} onOpenChange={setOpen} onRefresh={onRefresh} />}
    </div>
  );
}

function DriverHotspot({ device, onRefresh }) {
  const h = device.helper_health || {};
  const ready = helperAtLeast(h.version);
  const pending = pendingCommand(device);
  const [busy, setBusy] = useState(false);
  const checked = hotspotAlwaysOn(device);
  useRefreshWhile(pending?.type === "hotspot", onRefresh, 10000);
  const change = async (on) => {
    setBusy(true);
    try {
      await sendCommand(device, { action: "hotspot", always_on: on });
      toast({ title: on ? "Hotspot: always on" : "Hotspot: back to normal", description: on ? "The tablet keeps its hotspot on all the time, also when the bus is off." : "The hotspot is on while the bus runs and off once it's parked." });
      await onRefresh?.();
    } catch (e) {
      toast({ title: "Couldn't change the hotspot", description: problemText(e), variant: "destructive" });
    } finally { setBusy(false); }
  };
  return (
    <div className="mt-2 space-y-1 text-sm">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="flex items-center gap-1.5"><Radio className="h-3.5 w-3.5" /> Hotspot: {h.hotspot || "unknown"}</span>
        {ready ? (
          <label className="flex items-center gap-2">
            <Switch checked={checked} disabled={busy} onCheckedChange={change} aria-label="Keep the hotspot on all the time" />
            <span>Always on</span>
          </label>
        ) : <NeedsHelper />}
      </div>
      {ready && (
        <p className="text-xs text-muted-foreground">
          {checked
            ? "On all the time, also when the bus is off. Pauses below 20% battery when unplugged, so the tablet can't run flat."
            : "Normal: on while the bus runs, off once it's parked."}
          {pending?.type === "hotspot" ? ` ${commandProgress(device)}` : ""}
        </p>
      )}
    </div>
  );
}

export default function TabletNetworkControls({ device, onRefresh }) {
  if (!device?.paired || device.status === "revoked") return null;
  if (device.kiosk_type === "bus_boarding") return <BoardingWifi device={device} onRefresh={onRefresh} />;
  if (device.kiosk_type === "driver") return <DriverHotspot device={device} onRefresh={onRefresh} />;
  return null;
}
