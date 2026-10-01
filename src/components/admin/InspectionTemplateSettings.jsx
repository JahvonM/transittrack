import React from "react";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Send, Smartphone, Wrench, Users, Plus, X, Bus } from "lucide-react";
import { TRIGGERS, DAY_LABELS, formatTime } from "@/lib/driverInspections";
import { DEFAULT_LAYOUT } from "@/lib/busZones";

export const AUDIENCES = [
  { id: "mechanic", label: "Mechanics", icon: Wrench },
  { id: "driver", label: "Drivers", icon: Smartphone },
  { id: "both", label: "Both", icon: Users },
];

export function audienceSummary(t) {
  const a = t.audience || "mechanic";
  if (a === "mechanic") return "Mechanics";
  const trigId = t.driver_trigger || "start_of_day";
  const times = Array.isArray(t.driver_times) ? [...t.driver_times].sort() : [];
  const trig = trigId === "at_times" && times.length
    ? `At ${times.map(formatTime).join(", ")}`
    : TRIGGERS.find((x) => x.id === trigId)?.label || "";
  const buses = Array.isArray(t.driver_vehicle_ids) && t.driver_vehicle_ids.length ? ` · ${t.driver_vehicle_ids.length} bus${t.driver_vehicle_ids.length === 1 ? "" : "es"}` : "";
  return `${a === "both" ? "Drivers + mechanics" : "Drivers"} · ${trig}${buses}`;
}

export function metaFrom(t) {
  return {
    audience: t?.audience || "mechanic",
    driver_trigger: t?.driver_trigger || "start_of_day",
    driver_days: Array.isArray(t?.driver_days) ? t.driver_days : [],
    driver_from_time: t?.driver_from_time || "",
    driver_required: t?.driver_required !== false,
    driver_times: Array.isArray(t?.driver_times) ? t.driver_times : [],
    driver_vehicle_ids: Array.isArray(t?.driver_vehicle_ids) ? t.driver_vehicle_ids : [],
    xray_layout: t?.xray_layout || DEFAULT_LAYOUT,
  };
}

// Times of day for the "At set times" trigger.
function TimesEditor({ times, onChange }) {
  const [next, setNext] = React.useState("");
  const add = () => {
    if (!/^\d{2}:\d{2}$/.test(next) || times.includes(next)) return;
    onChange([...times, next].sort());
    setNext("");
  };
  return (
    <div className="space-y-1.5">
      <p className="text-xs font-medium text-muted-foreground">Times it should show up (each one is a separate check)</p>
      <div className="flex flex-wrap items-center gap-1.5">
        {times.map((x) => (
          <span key={x} className="inline-flex items-center gap-1 h-9 pl-3 pr-1 rounded-md border border-primary bg-primary/10 text-sm font-semibold">
            {formatTime(x)}
            <button type="button" className="w-7 h-7 grid place-items-center rounded hover:bg-background/60" onClick={() => onChange(times.filter((y) => y !== x))} aria-label={`Remove ${formatTime(x)}`}>
              <X className="w-3.5 h-3.5" />
            </button>
          </span>
        ))}
        <Input type="time" value={next} onChange={(e) => setNext(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }} className="h-9 w-32" aria-label="Add a time" />
        <Button type="button" variant="outline" size="sm" className="h-9" onClick={add} disabled={!next}><Plus className="w-4 h-4" /> Add time</Button>
      </div>
      {!times.length && <p className="text-xs text-amber-600 dark:text-amber-400">Add at least one time, e.g. 07:00.</p>}
    </div>
  );
}

// Which buses get it (none picked = every bus).
function BusPicker({ vehicles, selected, onChange }) {
  const all = !selected.length;
  const toggle = (id) => onChange(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);
  return (
    <div className="space-y-1.5">
      <p className="text-xs font-medium text-muted-foreground">Which buses get it?</p>
      <div className="flex flex-wrap gap-1.5">
        <button type="button" aria-pressed={all} onClick={() => onChange([])}
          className={`h-9 px-3 rounded-md border text-xs font-semibold ${all ? "border-primary bg-primary text-primary-foreground" : "border-border text-muted-foreground"}`}>
          All buses
        </button>
        {vehicles.map((v) => (
          <button key={v.id} type="button" aria-pressed={selected.includes(v.id)} onClick={() => toggle(v.id)}
            className={`h-9 px-3 rounded-md border text-xs font-semibold inline-flex items-center gap-1.5 ${selected.includes(v.id) ? "border-primary bg-primary text-primary-foreground" : "border-border text-muted-foreground hover:text-foreground"}`}>
            <Bus className="w-3.5 h-3.5" /> {v.name}{v.fleet_number ? ` (${v.fleet_number})` : ""}
          </button>
        ))}
        {!vehicles.length && <span className="text-xs text-muted-foreground self-center">No buses yet.</span>}
      </div>
    </div>
  );
}

// "Who does it and when" panel of the template editor.
export default function InspectionTemplateSettings({ meta, onChange, sentAt, onSendNow, sending, vehicles = [] }) {
  const set = (p) => onChange({ ...meta, ...p });
  const toDriver = meta.audience === "driver" || meta.audience === "both";
  const toggleDay = (d) => set({ driver_days: meta.driver_days.includes(d) ? meta.driver_days.filter((x) => x !== d) : [...meta.driver_days, d].sort() });

  return (
    <div className="border rounded-xl p-3 space-y-4">
      <div className="space-y-2">
        <p className="text-sm font-semibold">Who does this inspection?</p>
        <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Who does this inspection">
          {AUDIENCES.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={meta.audience === id}
              onClick={() => set({ audience: id })}
              className={`flex items-center justify-center gap-2 min-h-[44px] rounded-lg border text-sm font-medium transition-colors ${meta.audience === id ? "border-primary bg-primary/10 text-foreground" : "border-border text-muted-foreground hover:text-foreground"}`}
            >
              <Icon className="w-4 h-4" /> {label}
            </button>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">
          {meta.audience === "mechanic" && "Shows on the mechanics' Run Inspection page."}
          {meta.audience === "driver" && "Sent to the driver app on the bus tablets, as an X-ray walk-around."}
          {meta.audience === "both" && "Mechanics can run it, and it's also sent to the driver app."}
        </p>
      </div>

      {toDriver && (
        <>
          <div className="space-y-2">
            <p className="text-sm font-semibold">When should it appear in the driver app?</p>
            <div className="grid sm:grid-cols-2 gap-2" role="radiogroup" aria-label="When it appears">
              {TRIGGERS.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  role="radio"
                  aria-checked={meta.driver_trigger === t.id}
                  onClick={() => set({ driver_trigger: t.id })}
                  className={`text-left rounded-lg border p-2.5 transition-colors ${meta.driver_trigger === t.id ? "border-primary bg-primary/10" : "border-border hover:bg-muted/40"}`}
                >
                  <span className="block text-sm font-medium">{t.label}</span>
                  <span className="block text-xs text-muted-foreground">{t.hint}</span>
                </button>
              ))}
            </div>
          </div>

          {meta.driver_trigger === "at_times" && (
            <TimesEditor times={meta.driver_times || []} onChange={(driver_times) => set({ driver_times })} />
          )}

          {meta.driver_trigger !== "on_demand" && (
            <div className="grid sm:grid-cols-[1fr_auto] gap-3 items-end">
              <div className="space-y-1.5">
                <p className="text-xs font-medium text-muted-foreground">Days (none picked = every day)</p>
                <div className="flex flex-wrap gap-1.5">
                  {DAY_LABELS.map((l, d) => (
                    <button
                      key={l}
                      type="button"
                      aria-pressed={meta.driver_days.includes(d)}
                      onClick={() => toggleDay(d)}
                      className={`w-11 h-9 rounded-md border text-xs font-semibold ${meta.driver_days.includes(d) ? "border-primary bg-primary text-primary-foreground" : "border-border text-muted-foreground"}`}
                    >
                      {l}
                    </button>
                  ))}
                </div>
              </div>
              {meta.driver_trigger !== "at_times" && (
                <div className="space-y-1.5">
                  <label htmlFor="tpl-from" className="text-xs font-medium text-muted-foreground">Not before (optional)</label>
                  <Input id="tpl-from" type="time" value={meta.driver_from_time} onChange={(e) => set({ driver_from_time: e.target.value })} className="h-9 w-32" />
                </div>
              )}
            </div>
          )}

          <BusPicker vehicles={vehicles} selected={meta.driver_vehicle_ids || []} onChange={(driver_vehicle_ids) => set({ driver_vehicle_ids })} />

          <label className="flex items-center justify-between gap-3">
            <span>
              <span className="block text-sm font-medium">Must be finished before driving</span>
              <span className="block text-xs text-muted-foreground">Off: the driver can skip it and do it later.</span>
            </span>
            <Switch checked={meta.driver_required} onCheckedChange={(v) => set({ driver_required: v })} />
          </label>

          <div className="flex flex-wrap items-center gap-3 border-t pt-3">
            <Button variant="outline" onClick={onSendNow} disabled={sending}>
              <Send className="w-4 h-4" /> {sending ? "Sending…" : "Send to drivers now"}
            </Button>
            <span className="text-xs text-muted-foreground">
              {sentAt ? `Last sent ${new Date(sentAt).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}. ` : ""}
              Pops up on the chosen buses' tablets straight away, until each driver has done it.
            </span>
          </div>
        </>
      )}
    </div>
  );
}
