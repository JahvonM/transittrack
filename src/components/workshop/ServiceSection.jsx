import React, { useMemo, useState } from "react";
import { base44 } from "@/api/base44Client";
import { useToast } from "@/components/ui/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { StatusChip } from "@/components/admin/kit";
import { guideTitle } from "@/lib/busLibrary";
import {
  SERVICE_NAME_LIMIT, SERVICE_NOTES_LIMIT, STATE_LABEL, STATE_TONE, doneProblem, everyText, fromModelPage, lastText, nextText,
  odometerOf, odometerProblem, odometerValue, odometerWarning, reminderDaysFrom, savedStatus, scheduleData, scheduleForm,
  scheduleProblem, serviceState, servicesFor, todayIso,
} from "@/lib/serviceDue";
import { markServiceDone, raiseOdometer } from "@/components/workshop/serviceSaves";
import { EditSheet, FIELD, Field, Notice, pluralize, useWorkshop } from "@/components/workshop/kit";
import { NewJobSheet } from "@/components/workshop/JobSheets";
import { CalendarCheck, Check, Gauge, Hammer, Pencil, Plus, RefreshCw } from "lucide-react";

// A bus's Service section: its services (oil and filter every so many km or
// months) and when each comes round again, by the bus's odometer and the
// date, whichever comes first. Done records a service; Start a job opens a
// job for it, and marking that job done ticks it off. The model page's
// service intervals can be added in one go. Buses only: the records belong
// to a company, as the daily reminder emails do.

// The state line in the text colours; the chip beside the name carries the colour.
const STATE_TEXT = { overdue: "font-semibold text-foreground", due: "font-semibold text-foreground", ok: "text-foreground", unknown: "text-muted-foreground", unset: "text-muted-foreground", off: "text-muted-foreground" };

// Add a service, or change one; an administrator can delete it.
export function ServiceSheet({ vehicle, editing = null, onClose }) {
  const { toast } = useToast();
  const { put, drop, isAdmin, serviceSettings } = useWorkshop();
  const today = todayIso();
  const [form, setForm] = useState(() => scheduleForm(editing, { today, odometer: odometerOf(vehicle) }));
  const [saving, setSaving] = useState(false);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const problem = scheduleProblem(form, { today });

  const save = async () => {
    setSaving(true);
    try {
      const data = scheduleData(form, editing ? null : vehicle);
      data.status = savedStatus(serviceState({ ...editing, ...data }, { odometer: odometerOf(vehicle), today, reminderDays: reminderDaysFrom(serviceSettings) }).state);
      put("schedules", editing ? await base44.entities.MaintenanceSchedule.update(editing.id, data) : await base44.entities.MaintenanceSchedule.create(data));
      onClose();
    } catch (e) {
      toast({ title: "Couldn't save the service", description: e?.message, variant: "destructive" });
      setSaving(false);
    }
  };
  const remove = async () => {
    setSaving(true);
    try {
      await base44.entities.MaintenanceSchedule.delete(editing.id);
      drop("schedules", editing.id);
      onClose();
    } catch (e) {
      toast({ title: "Couldn't delete the service", description: e?.message, variant: "destructive" });
      setSaving(false);
    }
  };

  return (
    <EditSheet
      open onClose={onClose} title={editing ? "Edit service" : "Add a service"} description={vehicle.name} saving={saving} problem={problem} onSave={save}
      onDelete={editing && isAdmin ? remove : undefined} deleteLabel="Delete this service"
    >
      <Field id="svc-name" label="What">
        <Input id="svc-name" className="h-12 text-body md:text-body" value={form.service_type} onChange={set("service_type")} maxLength={SERVICE_NAME_LIMIT} placeholder="Engine oil and filter" />
      </Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field id="svc-km" label="Every (km)">
          <Input id="svc-km" inputMode="numeric" className="h-12 text-body md:text-body" value={form.every_km} onChange={set("every_km")} placeholder="10000" />
        </Field>
        <Field id="svc-time" label={`Every (${form.time_unit})`}>
          <div className="flex gap-2">
            <Input id="svc-time" inputMode="numeric" className="h-12 min-w-0 flex-1 text-body md:text-body" value={form.every_time} onChange={set("every_time")} placeholder={form.time_unit === "days" ? "180" : "6"} />
            <select aria-label="Months or days" className={`${FIELD} w-auto`} value={form.time_unit} onChange={set("time_unit")}>
              <option value="months">months</option>
              <option value="days">days</option>
            </select>
          </div>
        </Field>
      </div>
      <p className="-mt-2 text-caption text-muted-foreground">Give one or both. With both, it's due at whichever comes first.</p>
      <div className="grid grid-cols-2 gap-3">
        <Field id="svc-last-date" label="Last done">
          <Input id="svc-last-date" type="date" max={today} className="h-12 text-body md:text-body" value={form.last_date} onChange={set("last_date")} />
        </Field>
        <Field id="svc-last-km" label="At (km)">
          <Input id="svc-last-km" inputMode="numeric" className="h-12 text-body md:text-body" value={form.last_km} onChange={set("last_km")} />
        </Field>
      </div>
      <Field id="svc-notes" label="Notes (optional)">
        <Textarea id="svc-notes" rows={3} className="text-body md:text-body" value={form.notes} onChange={set("notes")} maxLength={SERVICE_NOTES_LIMIT} />
      </Field>
    </EditSheet>
  );
}

// Mark a service done: the day, and the odometer (which moves the bus's up).
function DoneServiceSheet({ vehicle, item, onClose }) {
  const { toast } = useToast();
  const { put, serviceSettings } = useWorkshop();
  const today = todayIso();
  const current = odometerOf(vehicle);
  const [form, setForm] = useState({ date: today, odometer: current ? String(current) : "" });
  const [saving, setSaving] = useState(false);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const problem = doneProblem(form, { today });
  const warning = odometerWarning(form.odometer, current);

  const save = async () => {
    setSaving(true);
    const reading = odometerValue(form.odometer);
    try {
      put("schedules", await markServiceDone(item.schedule, form, { odometer: Math.max(reading, current), reminderDays: reminderDaysFrom(serviceSettings) }));
    } catch (e) {
      toast({ title: "Couldn't mark it done", description: e?.message, variant: "destructive" });
      setSaving(false);
      return;
    }
    try {
      const bus = await raiseOdometer(vehicle, reading);
      if (bus) put("buses", bus);
    } catch {
      toast({ title: "Marked done", description: "Couldn't update the bus's odometer. Update it at the top of Service." });
    }
    onClose();
  };

  return (
    <EditSheet open onClose={onClose} title="Mark done" description={`${item.schedule.service_type} · ${vehicle.name}`} saveLabel="Mark done" saving={saving} problem={problem} onSave={save}>
      <Field id="done-date" label="Done on">
        <Input id="done-date" type="date" max={today} className="h-12 text-body md:text-body" value={form.date} onChange={set("date")} />
      </Field>
      <Field id="done-km" label="Odometer (km)" hint="Filled in from the bus's last reading. A higher one updates the bus.">
        <Input id="done-km" inputMode="numeric" className="h-12 text-body md:text-body" value={form.odometer} onChange={set("odometer")} />
      </Field>
      {warning && <p role="status" className="rounded-xl bg-warning/10 px-3 py-2 text-body-sm">{warning}</p>}
    </EditSheet>
  );
}

// The bus's odometer, as read on its dashboard.
function OdometerSheet({ vehicle, onClose }) {
  const { toast } = useToast();
  const { put } = useWorkshop();
  const current = odometerOf(vehicle);
  const [text, setText] = useState(current ? String(current) : "");
  const [saving, setSaving] = useState(false);
  const problem = odometerProblem(text);
  const warning = odometerWarning(text, current);

  const save = async () => {
    setSaving(true);
    try {
      const reading = odometerValue(text);
      const saved = await base44.entities.Vehicle.update(vehicle.id, { current_odometer: reading });
      put("buses", { ...vehicle.record, ...(saved?.id ? saved : {}), current_odometer: reading });
      onClose();
    } catch (e) {
      toast({ title: "Couldn't save the odometer", description: e?.message, variant: "destructive" });
      setSaving(false);
    }
  };

  return (
    <EditSheet open onClose={onClose} title="Odometer" description={vehicle.name} saving={saving} problem={problem} onSave={save}>
      <Field id="odo-reading" label="Reading (km)" hint="As the dashboard shows it now. The services by km count from it.">
        <Input id="odo-reading" inputMode="numeric" className="h-12 text-body md:text-body" value={text} onChange={(e) => setText(e.target.value)} />
      </Field>
      {warning && <p role="status" className="rounded-xl bg-warning/10 px-3 py-2 text-body-sm">{warning}</p>}
    </EditSheet>
  );
}

// The model page's service intervals, added in one go. Each starts from
// today and the odometer now unless its real last date and km are known.
function SetupSheet({ vehicle, guide, offers, onClose }) {
  const { toast } = useToast();
  const { put, serviceSettings } = useWorkshop();
  const today = todayIso();
  const odometer = odometerOf(vehicle);
  const [rows, setRows] = useState(() => offers.map((o) => ({ ...o, use: true, last_date: today, last_km: odometer ? String(odometer) : "" })));
  const [saving, setSaving] = useState(false);
  const change = (key, k, value) => setRows((list) => list.map((r) => (r.key === key ? { ...r, [k]: value } : r)));
  const formOf = (r) => ({ service_type: r.service_type, every_km: r.interval_km ? String(r.interval_km) : "", every_time: r.interval_days ? String(r.interval_days) : "", time_unit: "days", last_date: r.last_date, last_km: r.last_km, notes: "" });
  const chosen = rows.filter((r) => r.use);
  const firstProblem = chosen.map((r) => [r, scheduleProblem(formOf(r), { today })]).find(([, p]) => p);
  const problem = !chosen.length ? "Tick at least one." : firstProblem ? `${firstProblem[0].service_type}: ${firstProblem[1]}` : "";

  const save = async () => {
    setSaving(true);
    let added = 0;
    try {
      for (const r of chosen) {
        const data = scheduleData(formOf(r), vehicle);
        data.status = savedStatus(serviceState(data, { odometer, today, reminderDays: reminderDaysFrom(serviceSettings) }).state);
        put("schedules", await base44.entities.MaintenanceSchedule.create(data));
        added += 1;
      }
      toast({ title: `${pluralize(added, "service")} added` });
      onClose();
    } catch (e) {
      toast({ title: added ? `Added ${added}, then couldn't add the rest` : "Couldn't add them", description: e?.message, variant: "destructive" });
      setSaving(false);
    }
  };

  return (
    <EditSheet open onClose={onClose} title="Service schedule" description={`${guideTitle(guide)} · ${vehicle.name}`} saveLabel={chosen.length ? `Add ${chosen.length}` : "Add"} saving={saving} problem={problem} onSave={save}>
      <p className="rounded-xl bg-secondary px-3 py-2 text-body-sm">
        Each starts from today and the odometer now. If you know when one was really last done, change it, so one that's overdue doesn't look fine.
      </p>
      <ul className="space-y-3">
        {rows.map((r) => (
          <li key={r.key} className="rounded-xl border border-border bg-card p-3">
            <label className="flex min-h-[2.75rem] items-center gap-3">
              <input type="checkbox" className="h-5 w-5" checked={r.use} onChange={(e) => change(r.key, "use", e.target.checked)} />
              <span className="min-w-0 flex-1">
                <span className="block font-semibold">{r.service_type}</span>
                <span className="block text-body-sm text-muted-foreground">{everyText(r)}</span>
              </span>
            </label>
            {r.use && (
              <div className="mt-2 grid grid-cols-2 gap-3">
                <Field id={`setup-date-${r.key}`} label="Last done">
                  <Input id={`setup-date-${r.key}`} type="date" max={today} aria-label={`${r.service_type}: last done`} className="h-12 text-body md:text-body" value={r.last_date} onChange={(e) => change(r.key, "last_date", e.target.value)} />
                </Field>
                <Field id={`setup-km-${r.key}`} label="At (km)">
                  <Input id={`setup-km-${r.key}`} inputMode="numeric" aria-label={`${r.service_type}: at km`} className="h-12 text-body md:text-body" value={r.last_km} onChange={(e) => change(r.key, "last_km", e.target.value)} />
                </Field>
              </div>
            )}
          </li>
        ))}
      </ul>
    </EditSheet>
  );
}

function ServiceRow({ item, onDone, onStart, onEdit }) {
  const s = item.schedule;
  const next = nextText(item);
  return (
    <li className="rounded-lg border border-border bg-card p-3 shadow-sm">
      <div className="flex flex-wrap items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className="font-semibold">{s.service_type}</p>
          <p className="text-body-sm text-muted-foreground">{everyText(s)} · {lastText(s)}</p>
          {next && <p className="text-body-sm text-muted-foreground">{next}</p>}
          {s.notes && <p className="mt-1 whitespace-pre-line text-body-sm">{s.notes}</p>}
        </div>
        <StatusChip tone={STATE_TONE[item.state]}>{STATE_LABEL[item.state]}</StatusChip>
      </div>
      <p className={`mt-1 text-body ${STATE_TEXT[item.state]}`}>{item.text}</p>
      <div className="mt-2 flex flex-wrap gap-2">
        <Button className="h-11 rounded-lg" onClick={onDone} aria-label={`Done: ${s.service_type}`}><Check className="mr-1.5 h-4 w-4" aria-hidden="true" />Done</Button>
        <Button variant="outline" className="h-11 rounded-lg bg-card" onClick={onStart} aria-label={`Start a job: ${s.service_type}`}><Hammer className="mr-1.5 h-4 w-4" aria-hidden="true" />Start a job</Button>
        <Button variant="ghost" className="h-11 rounded-lg" onClick={onEdit} aria-label={`Edit: ${s.service_type}`}><Pencil className="mr-1.5 h-4 w-4" aria-hidden="true" />Edit</Button>
      </div>
    </li>
  );
}

export default function ServiceSection({ vehicle, guide = null }) {
  const { schedules, serviceSettings, facts, missing, reload } = useWorkshop();
  const reminderDays = reminderDaysFrom(serviceSettings);
  const items = useMemo(() => servicesFor(schedules, vehicle, { reminderDays }), [schedules, vehicle, reminderDays]);
  const offers = useMemo(() => (guide && !missing.facts && !missing.schedules ? fromModelPage(facts, guide.id, items.map((i) => i.schedule)) : []), [guide, facts, items, missing.facts, missing.schedules]);
  const [editing, setEditing] = useState(null);
  const [doing, setDoing] = useState(null);
  const [starting, setStarting] = useState("");
  const [settingUp, setSettingUp] = useState(false);
  const [reading, setReading] = useState(false);
  const odometer = odometerOf(vehicle);

  return (
    <section aria-labelledby="service-title">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h3 id="service-title" className="flex-1 text-title-sm font-semibold">Service</h3>
        <Button className="h-12 rounded-lg text-body" onClick={() => setEditing({})} disabled={missing.schedules}><Plus className="mr-1.5 h-5 w-5" aria-hidden="true" />Add a service</Button>
      </div>

      <div role="group" aria-label="Odometer" className="mb-4 flex flex-wrap items-center gap-3 rounded-lg border border-border bg-card px-4 py-3 shadow-sm">
        <Gauge className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden="true" />
        <p className="min-w-0 flex-1 text-body">
          <span className="text-muted-foreground">Odometer </span>
          <span className="font-semibold tabular-nums">{odometer ? `${odometer.toLocaleString("en")} km` : "Not recorded"}</span>
        </p>
        <Button variant="outline" className="h-11 rounded-lg bg-card" onClick={() => setReading(true)} aria-label="Update the odometer">Update</Button>
      </div>

      {missing.schedules && (
        <Notice tone="danger" action={<Button variant="outline" className="h-12 rounded-lg bg-card" onClick={reload}><RefreshCw className="mr-1.5 h-4 w-4" aria-hidden="true" />Try again</Button>}>
          Couldn't load the services. Check the connection.
        </Notice>
      )}

      {offers.length > 0 && (
        <Notice action={<Button className="h-12 rounded-lg" onClick={() => setSettingUp(true)}><CalendarCheck className="mr-1.5 h-4 w-4" aria-hidden="true" />{offers.length === 1 ? "Add it" : `Add the model's ${offers.length} services`}</Button>}>
          <p className="font-semibold">The {guideTitle(guide)} model page has {pluralize(offers.length, "service interval")} {vehicle.name} doesn't have yet.</p>
          <p className="text-muted-foreground">{offers.map((o) => o.service_type).join(", ")}</p>
        </Notice>
      )}

      {!missing.schedules && items.length === 0 && offers.length === 0 && (
        <Notice>
          No services set up for {vehicle.name} yet. Tap Add a service{guide ? "" : ", or give it a model page for the maker's intervals"}.
        </Notice>
      )}

      {items.length > 0 && (
        <ul aria-label="Services" className="space-y-3">
          {items.map((item) => (
            <ServiceRow
              key={item.schedule.id} item={item}
              onDone={() => setDoing(item)} onStart={() => setStarting(item.schedule.service_type)} onEdit={() => setEditing(item.schedule)}
            />
          ))}
        </ul>
      )}

      {editing && <ServiceSheet key={editing.id || "new"} vehicle={vehicle} editing={editing.id ? editing : null} onClose={() => setEditing(null)} />}
      {doing && <DoneServiceSheet vehicle={vehicle} item={doing} onClose={() => setDoing(null)} />}
      {reading && <OdometerSheet vehicle={vehicle} onClose={() => setReading(false)} />}
      {settingUp && <SetupSheet vehicle={vehicle} guide={guide} offers={offers} onClose={() => setSettingUp(false)} />}
      {starting && <NewJobSheet vehicle={vehicle} title={starting} onClose={() => setStarting("")} />}
    </section>
  );
}
