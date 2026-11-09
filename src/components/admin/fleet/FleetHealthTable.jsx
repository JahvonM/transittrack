import React, { useState } from "react";
import { Activity, AlertTriangle, BatteryLow, Bus, CloudUpload, CreditCard, MapPinOff, RefreshCw, Satellite, TabletSmartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import RequestHealth from "@/components/admin/RequestHealth";
import { APP_BUILD } from "@/lib/appHealth";
import { healthTotals } from "@/lib/fleetHealth";

const TONE = {
  ok: { dot: "bg-success", text: "text-foreground" },
  warn: { dot: "bg-warning", text: "text-warning" },
  bad: { dot: "bg-danger", text: "text-danger" },
  idle: { dot: "bg-muted-foreground/50", text: "text-muted-foreground" },
};
const ICON = { live: Activity, gps: MapPinOff, tablets: TabletSmartphone, reader: CreditCard, module: Satellite, waiting: CloudUpload, errors: AlertTriangle };

// One health reading: a coloured dot, what it is, and a detail line.
export function HealthCell({ s }) {
  if (!s) return <span className="text-xs text-muted-foreground">—</span>;
  const t = TONE[s.tone] || TONE.idle;
  return (
    <div className="min-w-0">
      <p className={`flex items-center gap-1.5 text-sm font-medium ${t.text}`}><span className={`h-2 w-2 shrink-0 rounded-full ${t.dot}`} />{s.text}</p>
      {s.sub && <p className="truncate pl-3.5 text-xs text-muted-foreground">{s.sub}</p>}
    </div>
  );
}

// Admin → Live fleet → Fleet health: every bus's GPS, tablets, GPS module,
// card reader, uploads waiting and app errors, in one table. A bus name
// opens that bus's panel.
export default function FleetHealthTable({ rows, devices, errors, loadedAt, busy, onRefresh, onOpenBus }) {
  const [problemsOnly, setProblemsOnly] = useState(false);
  const shown = problemsOnly ? rows.filter((r) => r.problem) : rows;
  return (
    <div className="space-y-4">
      <RequestHealth devices={devices} />
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-body-sm text-muted-foreground">Updated {loadedAt ? loadedAt.toLocaleTimeString([], { hour: "numeric", minute: "2-digit", second: "2-digit" }) : "…"} · refreshes every 30 s · current version {APP_BUILD}</span>
        <div className="ml-auto flex items-center gap-3">
          <label className="flex items-center gap-2 text-sm"><Switch checked={problemsOnly} onCheckedChange={setProblemsOnly} aria-label="Problems only" /> Problems only</label>
          <Button variant="ghost" size="icon" onClick={onRefresh} disabled={busy} aria-label="Refresh"><RefreshCw className={`h-4 w-4 ${busy ? "animate-spin" : ""}`} /></Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {healthTotals(rows, errors).map((t) => {
          const Icon = ICON[t.key];
          const alert = t.value > 0 && t.tone !== "ok";
          return (
            <div key={t.key} className={`rounded-2xl border p-3 ${alert ? (t.tone === "warn" ? "border-warning/50 bg-warning/10" : "border-danger/50 bg-danger/10") : "bg-card"}`}>
              <p className="flex items-center gap-1.5 text-xs text-muted-foreground"><Icon className="h-3.5 w-3.5" /> {t.label}</p>
              <p className="mt-0.5 text-2xl font-bold tabular-nums">{t.value}</p>
            </div>
          );
        })}
      </div>

      <div className="overflow-x-auto rounded-2xl border bg-card" tabIndex={0} role="region" aria-label="Fleet health table">
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-muted-foreground">
            <tr className="border-b">
              <th className="px-3 py-2 font-medium">Bus</th>
              <th className="px-3 py-2 font-medium">GPS</th>
              <th className="px-3 py-2 font-medium">Driver tablet</th>
              <th className="px-3 py-2 font-medium">Boarding tablet</th>
              <th className="px-3 py-2 font-medium">GPS module</th>
              <th className="px-3 py-2 font-medium">Card reader</th>
              <th className="px-3 py-2 font-medium">Waiting</th>
              <th className="px-3 py-2 font-medium">Errors 24 h</th>
            </tr>
          </thead>
          <tbody>
            {shown.length === 0 && (
              <tr><td colSpan={8} className="px-3 py-10 text-center text-muted-foreground">{problemsOnly ? "No problems right now." : "No buses yet."}</td></tr>
            )}
            {shown.map((r) => (
              <tr key={r.v.id} className={`border-b align-top last:border-0 ${r.problem ? "" : "opacity-90"}`}>
                <td className="min-w-[150px] px-3 py-2.5">
                  <p className="flex items-center gap-1.5 whitespace-nowrap font-medium"><Bus className="h-4 w-4 shrink-0 text-muted-foreground" /><button type="button" onClick={() => onOpenBus(r.v.id)} aria-label={`Open ${r.v.name}`} className="underline-offset-4 hover:underline">{r.v.name}</button></p>
                  <p className="max-w-[180px] truncate pl-5 text-xs text-muted-foreground">{[r.v.fleet_number, r.v.driver_name].filter(Boolean).join(" · ")}</p>
                </td>
                <td className="px-3 py-2.5"><HealthCell s={r.cells.gps} /></td>
                <td className="px-3 py-2.5"><HealthCell s={r.cells.driver} /></td>
                <td className="px-3 py-2.5"><HealthCell s={r.cells.boarding} /></td>
                <td className="px-3 py-2.5"><HealthCell s={r.cells.gpsModule} /></td>
                <td className="px-3 py-2.5"><HealthCell s={r.cells.reader} /></td>
                <td className="px-3 py-2.5">
                  {r.waiting > 0
                    ? <HealthCell s={{ tone: "warn", text: `${r.waiting} item${r.waiting === 1 ? "" : "s"}`, sub: "saved offline, will upload" }} />
                    : <span className="text-xs text-muted-foreground">Nothing</span>}
                  {r.lowBattery && <p className="mt-1 flex items-center gap-1 text-xs text-danger"><BatteryLow className="h-3.5 w-3.5" /> Low battery</p>}
                </td>
                <td className="px-3 py-2.5">
                  {r.errs > 0 ? <HealthCell s={{ tone: "bad", text: `${r.errs}`, sub: "see Admin → App errors" }} /> : <span className="text-xs text-muted-foreground">0</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted-foreground">
        Battery and card-reader details come from the McSween Helper app on each tablet; uploads waiting and app version come from McSween Transport itself.
        A tablet showing “older version” picks up the new one next time it reloads with internet.
      </p>
    </div>
  );
}
