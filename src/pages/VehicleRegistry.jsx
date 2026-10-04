import React, { useEffect, useState } from "react";
import { StatusChip } from "@/components/admin/kit";
import { base44 } from "@/api/base44Client";
import AppLayout from "@/components/AppLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/components/ui/use-toast";
import { Bus, Car, Wrench, Route as RouteIcon, Pencil, ChevronDown, ChevronUp, ClipboardCheck } from "lucide-react";

// The single place to manage a vehicle AND its assigned driver together — this
// used to be split across a read-only Vehicle Registry (no editing at all) and
// separate "Driver Profiles" / "Driver Schedule" pages that were actually
// self-service views filtered to whichever user was logged in. Since an admin
// clicking those from the nav is not a driver, they just showed empty data —
// so that split has been removed in favor of managing both here, together.
export default function VehicleRegistry() {
  const [vehicles, setVehicles] = useState([]);
  const [inspections, setInspections] = useState([]);
  const [routes, setRoutes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState(null);
  const [expandedId, setExpandedId] = useState(null);
  const [form, setForm] = useState({ driver_name: "", driver_email: "", route_id: "" });
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  const load = () => {
    Promise.all([
      base44.entities.Vehicle.list("-created_date", 200),
      base44.entities.Inspection.list("-created_date", 500),
      base44.entities.Route.list("-created_date", 100),
    ])
      .then(([v, i, r]) => { setVehicles(v); setInspections(i); setRoutes(r); })
      .catch(() => {})
      .finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, []);

  const vehicleInspections = (vehicleId) =>
    inspections.filter((i) => i.vehicle_id === vehicleId).sort((a, b) => new Date(b.date) - new Date(a.date));

  const routeName = (routeId) => routes.find((r) => r.id === routeId)?.name || "—";

  const startEdit = (v) => {
    setEditingId(v.id);
    setForm({ driver_name: v.driver_name || "", driver_email: v.driver_email || "", route_id: v.route_id || "none" });
  };

  const saveEdit = async (v) => {
    setSaving(true);
    try {
      await base44.entities.Vehicle.update(v.id, {
        driver_name: form.driver_name,
        driver_email: form.driver_email,
        route_id: form.route_id === "none" ? null : form.route_id,
      });
      toast({ title: "Saved" });
      setEditingId(null);
      load();
    } catch (e) {
      toast({ title: "Couldn't save", description: e.message, variant: "destructive" });
    }
    setSaving(false);
  };

  return (
    <AppLayout title="Vehicles & Drivers">
      <div className="space-y-2 max-w-5xl">
        {loading && <p className="text-muted-foreground">Loading fleet…</p>}
        {!loading && vehicles.length === 0 && (
          <p className="text-muted-foreground py-12 text-center">No vehicles registered.</p>
        )}
        {vehicles.map((v) => {
          const insp = vehicleInspections(v.id);
          const latest = insp[0];
          const isEditing = editingId === v.id;
          const isExpanded = expandedId === v.id;
          return (
            <Card key={v.id}>
              <CardContent className="p-4">
                <div className="flex items-center gap-4 mb-3">
                  <div className="w-11 h-11 rounded-xl bg-primary/10 grid place-items-center shrink-0">
                    {v.type === "taxi" ? <Car className="w-5 h-5 text-primary" /> : <Bus className="w-5 h-5 text-primary" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate">
                      {v.name} <span className="text-xs text-muted-foreground font-normal">· {v.plate_number}</span>
                    </div>
                    <div className="text-xs text-muted-foreground">{v.company_name} · {v.driver_name || "Unassigned"}</div>
                  </div>
                  <StatusChip status={v.status}>{v.status}</StatusChip>
                  {!isEditing && (
                    <Button size="icon" variant="ghost" onClick={() => startEdit(v)} title="Edit driver / route">
                      <Pencil className="w-4 h-4" />
                    </Button>
                  )}
                </div>

                {isEditing ? (
                  <div className="grid sm:grid-cols-3 gap-3 mb-3 p-3 rounded-lg border bg-muted/30">
                    <div className="space-y-1">
                      <Label className="text-xs">Driver name</Label>
                      <Input value={form.driver_name} onChange={(e) => setForm({ ...form, driver_name: e.target.value })} placeholder="Driver name" />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Driver email</Label>
                      <Input value={form.driver_email} onChange={(e) => setForm({ ...form, driver_email: e.target.value })} placeholder="driver@email.com" />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Route</Label>
                      <Select value={form.route_id} onValueChange={(r) => setForm({ ...form, route_id: r })}>
                        <SelectTrigger><SelectValue placeholder="No route" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">No route</SelectItem>
                          {routes.filter((r) => r.company_id === v.company_id).map((r) => (
                            <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="sm:col-span-3 flex gap-2 justify-end">
                      <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}>Cancel</Button>
                      <Button size="sm" onClick={() => saveEdit(v)} disabled={saving}>{saving ? "Saving…" : "Save"}</Button>
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm mb-2">
                    <div className="flex items-center gap-2">
                      <RouteIcon className="w-4 h-4 text-muted-foreground" />
                      <span className="text-muted-foreground">Route:</span>
                      <span className="font-medium">{routeName(v.route_id)}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Wrench className="w-4 h-4 text-muted-foreground" />
                      <span className="text-muted-foreground">Last service:</span>
                      <span className="font-medium">{latest ? `${latest.date} (${latest.status})` : "None"}</span>
                    </div>
                  </div>
                )}

                <button
                  type="button"
                  onClick={() => setExpandedId(isExpanded ? null : v.id)}
                  className="flex items-center gap-1.5 text-xs text-primary hover:underline"
                >
                  <ClipboardCheck className="w-3.5 h-3.5" />
                  {isExpanded ? "Hide" : "Show"} inspection history ({insp.length})
                  {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                </button>
                {isExpanded && (
                  <div className="mt-2 space-y-1.5 pt-2 border-t">
                    {insp.length === 0 && <p className="text-xs text-muted-foreground">No inspections recorded.</p>}
                    {insp.map((i) => (
                      <div key={i.id} className="flex items-center justify-between text-xs">
                        <span>{i.date ? new Date(i.date).toLocaleDateString() : "—"} · {i.driver_name}</span>
                        <StatusChip tone={i.needs_service || i.status !== "passed" ? "danger" : "success"}>{i.needs_service ? "Needs service" : i.status}</StatusChip>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </AppLayout>
  );
}
