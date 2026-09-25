import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useToast } from "@/components/ui/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CalendarClock, Plus, CheckCircle2, Trash2 } from "lucide-react";

const STATUS_VARIANT = { upcoming: "secondary", due: "default", overdue: "destructive", completed: "secondary" };
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
    if (!window.confirm("Delete this schedule?")) return;
    await base44.entities.MaintenanceSchedule.delete(id);
    onChange();
  };

  const sorted = [...schedules].sort((a, b) => (STATUS_ORDER[a.status] ?? 4) - (STATUS_ORDER[b.status] ?? 4));

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <CalendarClock className="w-5 h-5 text-primary" />
        <h2 className="text-lg font-semibold">Maintenance schedule</h2>
      </div>
      <div className="grid lg:grid-cols-[1fr_360px] gap-4">
        <div className="space-y-2">
          {sorted.length === 0 && (
            <Card><CardContent className="py-8 text-center text-sm text-muted-foreground">No maintenance schedules yet.</CardContent></Card>
          )}
          {sorted.map((s) => (
            <Card key={s.id}>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between gap-2">
                  <CardTitle className="text-base">{s.service_type}</CardTitle>
                  <Badge variant={STATUS_VARIANT[s.status] || "outline"} className="capitalize">{s.status}</Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="text-sm text-muted-foreground">{s.vehicle_name} · {s.company_name}</div>
                <div className="text-xs text-muted-foreground">
                  {s.due_type === "mileage"
                    ? `Every ${s.interval_km?.toLocaleString() || 0} km · last serviced at ${s.last_service_mileage?.toLocaleString() || 0} km`
                    : `Every ${s.interval_days || 0} days · last serviced ${s.last_service_date || "never"}`}
                </div>
                {s.notes && <div className="text-sm">{s.notes}</div>}
                <div className="flex gap-2 pt-1">
                  <Button variant="outline" size="sm" onClick={() => markServiced(s)}>
                    <CheckCircle2 className="w-3.5 h-3.5 mr-1.5" /> Mark serviced
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => remove(s.id)}>
                    <Trash2 className="w-3.5 h-3.5 text-destructive" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
        <Card>
          <CardHeader><CardTitle className="text-base flex items-center gap-2"><Plus className="w-4 h-4" /> New schedule</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1.5">
              <Label>Vehicle</Label>
              <Select value={form.vehicle_id} onValueChange={(v) => set("vehicle_id", v)}>
                <SelectTrigger><SelectValue placeholder="Choose vehicle" /></SelectTrigger>
                <SelectContent>
                  {vehicles.map((v) => <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5"><Label>Service type</Label><Input value={form.service_type} onChange={(e) => set("service_type", e.target.value)} placeholder="e.g. Engine oil change" /></div>
            <div className="space-y-1.5">
              <Label>Due based on</Label>
              <div className="flex gap-2">
                {["mileage", "days"].map((t) => (
                  <button key={t} type="button" onClick={() => set("due_type", t)} className={`px-3 py-2 rounded-lg text-sm border capitalize transition-colors ${form.due_type === t ? "bg-primary text-primary-foreground border-primary" : "border-border hover:bg-accent"}`}>
                    {t}
                  </button>
                ))}
              </div>
            </div>
            {form.due_type === "mileage" ? (
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1.5"><Label>Interval (km)</Label><Input type="number" value={form.interval_km} onChange={(e) => set("interval_km", Number(e.target.value))} /></div>
                <div className="space-y-1.5"><Label>Last service (km)</Label><Input type="number" value={form.last_service_mileage} onChange={(e) => set("last_service_mileage", Number(e.target.value))} /></div>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1.5"><Label>Interval (days)</Label><Input type="number" value={form.interval_days} onChange={(e) => set("interval_days", Number(e.target.value))} /></div>
                <div className="space-y-1.5"><Label>Last service date</Label><Input type="date" value={form.last_service_date} onChange={(e) => set("last_service_date", e.target.value)} /></div>
              </div>
            )}
            <div className="space-y-1.5"><Label>Notes</Label><Input value={form.notes} onChange={(e) => set("notes", e.target.value)} /></div>
            <Button className="w-full" onClick={create} disabled={saving || !form.vehicle_id || !form.service_type.trim()}>
              {saving ? "Creating…" : "Create schedule"}
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
