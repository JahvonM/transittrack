import React, { useEffect, useState } from "react";
import { Activity, ClipboardCopy, RefreshCw, ShieldCheck, Volume2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/tablet/settingsKit";
import { Button } from "@/components/ui/button";
import { TRANSIT_TIME_ZONE } from "@/lib/localTime";
import { helperLink } from "@/lib/helperHealth";
import { hasExternalReader } from "@/hooks/useNfcTap";
import { oldestQueuedAt, queueLength, queueSyncError } from "@/lib/offlineQueue";
import { boardingDirectoryInfo } from "@/lib/boardingDirectory";
import { APP_BUILD } from "@/lib/appHealth";
import { tabletRecoveryState } from "@/lib/tabletRecovery";
import { READ_METHOD_TEXT, cameraCount, diagnostics } from "@/lib/boardingDiagnostics";
import { playTone } from "@/lib/kioskSound";
import { protectionState } from "@/lib/kioskProtection";

// Boarding tablet → Tablet settings (bus PIN) → Diagnostics. What works on
// this device right now, in plain words, for whoever is setting it up or
// fixing it. Nothing secret: no card numbers, codes, names or device keys.

const when = (iso) => (iso ? new Date(iso).toLocaleString([], { timeZone: TRANSIT_TIME_ZONE, day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }) : "Never");
const MODE_TEXT = { both: "Boarding and getting off (asks each time)", boarding: "Boarding only", exit: "Getting off only" };

function Row({ label, value, warn = false }) {
  return <div className="grid grid-cols-[minmax(0,40%)_1fr] gap-3 py-1.5 text-sm"><dt className="text-muted-foreground">{label}</dt><dd className={warn ? "font-semibold text-warning" : ""}>{value}</dd></div>;
}

export function readerSummary(now = Date.now()) {
  const native = typeof window !== "undefined" ? window.__ttNativeHealth : null;
  const link = helperLink(now);
  const webNfc = typeof window !== "undefined" && "NDEFReader" in window;
  const reader = native?.reader;
  const own = reader?.builtIn;
  const usbOk = reader?.enabled && /^connected/i.test(reader.status || "");
  if (!usbOk && own?.available && own.enabled) {
    if (own.nfcOn === false) return { text: "This device's NFC is switched off in Android settings. Turn it on under Card reader below.", ok: false };
    return { text: `This device's NFC: ${own.on ? "ready for cards" : (own.status || "on")}`, ok: true };
  }
  if (reader?.enabled) return { text: `USB card reader (read by this app): ${reader.status || "on"}`, ok: true };
  if (hasExternalReader()) return link === "lost" ? { text: "USB card reader set up, but its helper hasn't reported for 3 minutes. Cards may not reach this screen.", ok: false } : { text: "USB card reader: connected", ok: true };
  if (webNfc) return { text: "Phone NFC (browser): available after the screen is unlocked", ok: true };
  return { text: "No card reader found on this device. Passengers can use the keypad or QR.", ok: false };
}

export default function BoardingDiagnosticsPanel({ device, online = true }) {
  const [tick, setTick] = useState(0);
  const [cameras, setCameras] = useState(null);
  const [recovery, setRecovery] = useState(null);
  const [copied, setCopied] = useState("");
  useEffect(() => {
    let alive = true;
    cameraCount().then((n) => { if (alive) setCameras(n); });
    tabletRecoveryState().then((s) => { if (alive) setRecovery(s); });
    const t = setInterval(() => setTick((n) => n + 1), 15000);
    return () => { alive = false; clearInterval(t); };
  }, [tick]);
  const d = diagnostics();
  const reader = readerSummary();
  const list = boardingDirectoryInfo();
  const listExpired = list?.expires && Date.parse(list.expires) <= Date.now();
  let waiting = 0, oldest = null, syncError = "";
  try { waiting = queueLength(); oldest = oldestQueuedAt(); syncError = queueSyncError(); } catch (e) { syncError = e.message; }
  const native = typeof window !== "undefined" ? window.__ttNativeHealth : null;
  const protection = protectionState(recovery);
  const rows = [
    ["Card reader", reader.text, !reader.ok],
    ["Last card or code read", d.last_read_at ? `${when(d.last_read_at)} · ${READ_METHOD_TEXT[d.last_read_method] || d.last_read_method || "unknown"}` : "None since this tablet was set up"],
    ["QR scanner (dedicated)", "None supported yet. A built-in scanner like the T10's needs the maker's software, which we don't have. The camera is used for QR instead."],
    ["Camera for QR", cameras == null ? "Unknown" : cameras === 0 ? "No camera found. Passengers can use the keypad or a card." : `${cameras} camera${cameras === 1 ? "" : "s"} found`, cameras === 0],
    ["Lights on the reader", hasExternalReader() ? "USB reader flashes green or red and beeps for each tap" : "No light control on this device"],
    ["Bus", device?.vehicle_name || "Not assigned", !device?.vehicle_name],
    ["Reader records", MODE_TEXT[device?.reader_mode || "both"]],
    ["Needs an open driver shift", device?.require_active_trip ? "Yes" : "No"],
    ["Passenger list on this tablet", list ? `${list.count} card${list.count === 1 ? "" : "s"} · downloaded ${when(list.updated)}${listExpired ? " · expired, connect to refresh" : ""}` : "Not downloaded yet. Connect to WiFi.", !list || listExpired],
    ["Taps waiting to send", waiting ? `${waiting} · oldest saved ${when(oldest)}` : "None", waiting > 0 && !online],
    ...(syncError ? [["Last sync problem", syncError, true]] : []),
    ["Connection", online ? "Online" : "Offline: taps are saved on this tablet and sent later", !online],
    ["Last sent to the server", when(d.last_sync_at)],
    ["Kiosk protection", protection.text, protection.tone !== "ok"],
    ["Device", native?.model ? `${native.model}${native.androidVersion ? ` · Android ${native.androidVersion}` : ""}` : "Web browser (no device details)"],
    ["App version", `${APP_BUILD}${native?.appVersion ? ` · kiosk app ${native.appVersion}` : ""}`],
    ...(d.last_problem ? [["Last problem", `${d.last_problem} · ${when(d.last_problem_at)}`]] : []),
  ];
  const copy = async () => {
    const text = rows.map(([k, v]) => `${k}: ${v}`).join("\n");
    try { await navigator.clipboard.writeText(text); setCopied("Copied. Paste it into a message to support."); }
    catch { setCopied("Couldn't copy on this device. Take a photo of this screen instead."); }
  };
  return (
    <Card>
      <CardHeader className="pb-3"><CardTitle className="flex items-center gap-2 text-base"><Activity className="h-5 w-5" /> Diagnostics</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <dl className="divide-y divide-border" aria-label="Boarding tablet diagnostics">
          {rows.map(([k, v, warn]) => <Row key={k} label={k} value={v} warn={!!warn} />)}
        </dl>
        <div className="grid grid-cols-2 gap-2">
          <Button variant="outline" onClick={() => { playTone("test"); }}><Volume2 className="mr-2 h-4 w-4" />Test sound</Button>
          <Button variant="outline" onClick={() => setTick((n) => n + 1)}><RefreshCw className="mr-2 h-4 w-4" />Check again</Button>
          <Button variant="outline" className="col-span-2" onClick={copy}><ClipboardCopy className="mr-2 h-4 w-4" />Copy for support</Button>
        </div>
        {copied && <p role="status" className="text-sm">{copied}</p>}
        <p className="flex items-start gap-2 text-xs text-muted-foreground"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />No card numbers, codes or names are shown or copied here.</p>
      </CardContent>
    </Card>
  );
}
