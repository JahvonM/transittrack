import React, { useState } from "react";
import { confirmAction } from "@/components/ConfirmHost";
import { base44 } from "@/api/base44Client";
import { useToast } from "@/components/ui/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CalendarClock, CalendarCheck, CheckCircle2, Clock, OctagonAlert, Plus, Trash2, Wrench } from "lucide-react";
import { EmptyState, Kpi, KpiRow, Panel, Segmented, StatusChip } from "@/components/admin/kit";

const STATUS_TONE = { upcoming: "neutral", due: "warning", overdue: "danger", completed: "success" };
const STATUS_ORDER = { overdue: 0, due: 1, upcoming: 2, completed: 3 };
const empty = {
  vehicle_id: "", service_type: "", due_type: "mileage",
  interval_km: 0, interval_days: 0, last_service_mileage: 0, last_service_date: "", notes: "",
};

// Interval-based service tracking (oil changes, filter swaps, etc.) — status
// (upcoming/due/overdue) is kept current by the maintenanceAlerts function on
// its scheduled run, using each vehicle's own current_odometer for mileage
// math rather than a separate mileage field.
export default function MaintenanceScheduleTab({ schedules = [], vehicles = [], onChange }) {
  const { toast } = useToast();
  const [form, setForm] = useState(empty);
  const [saving, setSaving] = useState(false);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const vehicleById = (id) => vehicles.find((v) => v.id === id);

  const create = async () => {
    const vehicle = vehicleById(form.vehicle_id);
    if (!vehicle || !form.service_type.trim()) return;
    setSaving(true);
    try {
      await base44.entities.MaintenanceSchedule.create({
        ...form, vehicle_name: vehicle.name, company_id: vehicle.company_id, company_name: vehicle.company_name,
      });
      setForm(empty);
      onChange();
    } catch (e) {
      toast({ title: "Couldn't create schedule", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const markServiced = async (s) => {
    const vehicle = vehicleById(s.vehicle_id);
    try {
      await base44.entities.MaintenanceSchedule.update(s.id, {
        status: "upcoming",
        last_service_date: new Date().toISOString().slice(0, 10),
        last_service_mileage: vehicle?.current_odometer || s.last_service_mileage || 0,
      });
      onChange();
    } catch (e) {
      toast({ title: "Couldn't update", description: e.message, variant: "destructive" });
    }
  };

  const remove = async (id) => {
    if (!(await confirmAction({ title: "Delete this schedule?", description: "This maintenance schedule will be removed." }))) return;
    try {
      await base44.entities.MaintenanceSchedule.delete(id);
      onChange();
    } catch (e) {
      // Delete is admin/company-only — a mechanic clicking this needs to see
      // why nothing happened, not a silent no-op.
      toast({ title: "Couldn't delete schedule", description: e.message, variant: "destructive" });
    }
  };

  const sorted = [...schedules].sort((a, b) => (STATUS_ORDER[a.status] ?? 4) - (STATUS_ORDER[b.status] ?? 4));

  const n = (st) => schedules.filter((x) => x.status === st).length;
  const field = "space-y-1.5";

  return (
    <div>
      <KpiRow className="xl:grid-cols-3">
        <Kpi label="Overdue" value={n("overdue")} icon={OctagonAlert} tone={n("overdue") ? "danger" : undefined} />
        <Kpi label="Due now" value={n("due")} icon={Clock} tone={n("due") ? "warning" : undefined} />
        <Kpi label="Upcoming" value={n("upcoming")} icon={CalendarCheck} />
      </KpiRow>
      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
        <Panel title="Service schedule" icon={CalendarClock} bodyClassName="p-2 pt-1">
          {sorted.length === 0 ? (
            <EmptyState icon={Wrench} title="No maintenance schedules yet" className="m-2 border-0">Create one with the form.</EmptyState>
          ) : (
            <ul className="divide-y divide-border">
              {sorted.map((s) => (
                <li key={s.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-3 py-3">
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-secondary" aria-hidden="true"><Wrench className="h-5 w-5" /></span>
                  <div className="min-w-0 flex-1 basis-56">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-semibold">{s.service_type}</p>
                      <StatusChip tone={STATUS_TONE[s.status] || "neutral"} status={s.status} />
                    </div>
                    <p className="truncate text-body-sm text-muted-foreground">{[s.vehicle_name, s.company_name].filter(Boolean).join(" · ")}</p>
                    <p className="text-caption text-muted-foreground">
                      {s.due_type === "mileage"
                        ? `Every ${s.interval_km?.toLocaleString() || 0} km · last serviced at ${s.last_service_mileage?.toLocaleString() || 0} km`
                        : `Every ${s.interval_days || 0} days · last serviced ${s.last_service_date || "never"}`}
                    </p>
                    {s.notes && <p className="mt-1 text-body-sm">{s.notes}</p>}
                  </div>
                  <div className="flex items-center gap-1">
                    <Button variant="outline" size="sm" onClick={() => markServiced(s)}>
                      <CheckCircle2 className="h-4 w-4" /> Mark serviced
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => remove(s.id)} aria-label={`Delete ${s.service_type} schedule for ${s.vehicle_name || "this vehicle"}`} title="Delete" className="text-danger hover:text-danger">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Panel>
        <Panel title="New schedule" icon={Plus} className="lg:sticky lg:top-24">
          <div className="space-y-3">
            <div className={field}>
              <Label htmlFor="ms-vehicle">Vehicle</Label>
              <Select value={form.vehicle_id} onValueChange={(v) => set("vehicle_id", v)}>
                <SelectTrigger id="ms-vehicle"><SelectValue placeholder="Choose vehicle" /></SelectTrigger>
                <SelectContent>
                  {vehicles.map((v) => <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className={field}><Label htmlFor="ms-type">Service type</Label><Input id="ms-type" value={form.service_type} onChange={(e) => set("service_type", e.target.value)} placeholder="e.g. Engine oil change" /></div>
            <div className={field}>
              <p className="text-sm font-medium leading-none">Due based on</p>
              <Segmented label="Due based on" value={form.due_type} onChange={(v) => set("due_type", v)} options={[{ value: "mileage", label: "Mileage" }, { value: "days", label: "Days" }]} />
            </div>
            {form.due_type === "mileage" ? (
              <div className="grid grid-cols-2 gap-2">
                <div className={field}><Label htmlFor="ms-ikm">Interval (km)</Label><Input id="ms-ikm" type="number" value={form.interval_km} onChange={(e) => set("interval_km", Number(e.target.value))} /></div>
                <div className={field}><Label htmlFor="ms-lkm">Last service (km)</Label><Input id="ms-lkm" type="number" value={form.last_service_mileage} onChange={(e) => set("last_service_mileage", Number(e.target.value))} /></div>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                <div className={field}><Label htmlFor="ms-idays">Interval (days)</Label><Input id="ms-idays" type="number" value={form.interval_days} onChange={(e) => set("interval_days", Number(e.target.value))} /></div>
                <div className={field}><Label htmlFor="ms-ldate">Last service date</Label><Input id="ms-ldate" type="date" value={form.last_service_date} onChange={(e) => set("last_service_date", e.target.value)} /></div>
              </div>
            )}
            <div className={field}><Label htmlFor="ms-notes">Notes</Label><Input id="ms-notes" value={form.notes} onChange={(e) => set("notes", e.target.value)} /></div>
            <Button className="w-full" onClick={create} disabled={saving || !form.vehicle_id || !form.service_type.trim()}>
              {saving ? "Creating…" : "Create schedule"}
            </Button>
          </div>
        </Panel>
      </div>
    </div>
  );
}
