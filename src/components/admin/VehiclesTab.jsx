import React, { useMemo, useState } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";
import { confirmAction } from "@/components/ConfirmHost";
import { Bus, FileSpreadsheet, FileText, History, OctagonAlert, Pencil, Plus, Search, Trash2, Wrench } from "lucide-react";
import { EmptyState, PageActions, Segmented, StatusChip } from "@/components/admin/kit";
import { exportToCSV, exportToPDF } from "@/lib/exporters";
import VehicleHistoryDialog from "./VehicleHistoryDialog";
import VehicleFormDialog from "@/components/VehicleFormDialog";
import { VehicleModelThumb } from "@/components/VehicleModelPicker";
import { getModel, modelIdFor } from "@/lib/vehicleModels";

const VEHICLE_COLS = [
  { key: "name", label: "Name" },
  { key: "fleet_number", label: "Vehicle no." },
  { key: "plate_number", label: "Plate" },
  { key: "vin", label: "Chassis (VIN)" },
  { key: "current_odometer", label: "Mileage (km)" },
  { key: "type", label: "Type" },
  { key: "company_name", label: "Company" },
  { key: "driver_name", label: "Driver" },
  { key: "status", label: "Status" },
  { key: "capacity", label: "Seats" },
  { key: "created_date", label: "Created" },
];

const km = (n) => (n == null || n === "" ? null : `${Number(n).toLocaleString()} km`);

export default function VehiclesTab({ vehicles, companies, routes, onChange, faults = [], schedules = [], inspectionResults = [] }) {
  const { toast } = useToast();
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [historyVehicle, setHistoryVehicle] = useState(null);

  const openAdd = () => { setEditing(null); setFormOpen(true); };
  const openEdit = (v) => { setEditing(v); setFormOpen(true); };

  const remove = async (v) => {
    if (!(await confirmAction({ title: `Delete ${v.name}?`, description: "Its live tracking stops and it disappears from maps. Trip and inspection history stay." }))) return;
    try {
      await base44.entities.Vehicle.delete(v.id);
      onChange();
    } catch (e) {
      toast({ title: "Couldn't delete vehicle", description: e.message, variant: "destructive" });
    }
  };

  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const routeName = (id) => routes?.find((r) => r.id === id)?.name;
  const openFaults = useMemo(() => {
    const out = {};
    faults.filter((f) => f.status !== "resolved").forEach((f) => { out[f.vehicle_id] = (out[f.vehicle_id] || 0) + 1; });
    return out;
  }, [faults]);
  const serviceDue = useMemo(() => {
    const out = {};
    schedules.filter((x) => x.status === "due" || x.status === "overdue").forEach((x) => { if (out[x.vehicle_id] !== "overdue") out[x.vehicle_id] = x.status; });
    return out;
  }, [schedules]);
  const bucket = (v) => (v.status === "on_trip" ? "on_trip" : v.status === "idle" ? "idle" : "offline");
  const count = (b) => vehicles.filter((v) => bucket(v) === b).length;
  const q = query.trim().toLowerCase();
  const shown = vehicles
    .filter((v) => status === "all" || bucket(v) === status)
    .filter((v) => !q || [v.name, v.plate_number, v.fleet_number, v.vin, v.company_name, v.driver_name, v.driver_email].some((x) => String(x || "").toLowerCase().includes(q)))
    .sort((a, b) => String(a.name).localeCompare(String(b.name), undefined, { numeric: true }));

  return (
    <div>
      <PageActions>
        <Button variant="outline" size="sm" onClick={() => exportToCSV("vehicles", VEHICLE_COLS, vehicles)} disabled={!vehicles.length}>
          <FileSpreadsheet className="h-4 w-4" /> Excel
        </Button>
        <Button variant="outline" size="sm" onClick={() => exportToPDF("vehicles", "Vehicle fleet", VEHICLE_COLS, vehicles)} disabled={!vehicles.length}>
          <FileText className="h-4 w-4" /> PDF
        </Button>
        <Button size="sm" onClick={openAdd}><Plus className="h-4 w-4" /> Add bus</Button>
      </PageActions>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <label className="relative min-w-[220px] flex-1 sm:max-w-sm">
          <span className="sr-only">Search buses</span>
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Name, plate, VIN, company or driver"
            className="h-10 w-full rounded-xl border border-input bg-card pl-9 pr-3 text-body-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" />
        </label>
        <Segmented label="Filter by status" value={status} onChange={setStatus} options={[
          { value: "all", label: "All", count: vehicles.length },
          { value: "on_trip", label: "On trip", count: count("on_trip") },
          { value: "idle", label: "Idle", count: count("idle") },
          { value: "offline", label: "Offline", count: count("offline") },
        ]} />
      </div>

      {vehicles.length === 0 ? (
        <EmptyState icon={Bus} title="No buses yet" action={<Button size="sm" onClick={openAdd}><Plus className="h-4 w-4" /> Add your first bus</Button>}>
          Add a bus or taxi to start tracking it.
        </EmptyState>
      ) : shown.length === 0 ? (
        <EmptyState icon={Search} title="No buses match">Try another search or filter.</EmptyState>
      ) : (
        <ul className="grid grid-cols-1 gap-3 md:grid-cols-2 2xl:grid-cols-3">
          {shown.map((v) => {
            const details = [v.fleet_number && `No. ${v.fleet_number}`, v.plate_number, km(v.current_odometer)].filter(Boolean);
            const nFaults = openFaults[v.id] || 0;
            const due = serviceDue[v.id];
            return (
              <li key={v.id} className="flex flex-col rounded-2xl border border-border bg-card">
                <div className="flex items-start gap-3 p-4">
                  <div className="shrink-0 rounded-xl bg-secondary" title={getModel(modelIdFor(v)).label}>
                    <VehicleModelThumb model={modelIdFor(v)} size={60} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <h2 className="truncate text-title-sm font-bold">{v.name}</h2>
                      <StatusChip status={bucket(v)} tone={bucket(v) === "on_trip" ? "success" : "neutral"} />
                    </div>
                    <p className="truncate text-body-sm text-muted-foreground">{details.join(" · ") || "No details yet"}</p>
                    {v.vin && <p className="truncate text-caption text-muted-foreground">VIN {v.vin}</p>}
                  </div>
                </div>
                <dl className="grid grid-cols-3 gap-3 border-t border-border px-4 py-3 text-body-sm">
                  {[["Company", v.company_name || "None"], ["Driver", v.driver_name || v.driver_email || "Unassigned"], ["Route", routeName(v.route_id) || "None"]].map(([k, val]) => (
                    <div key={k} className="min-w-0">
                      <dt className="text-caption text-muted-foreground">{k}</dt>
                      <dd className="truncate font-semibold">{val}</dd>
                    </div>
                  ))}
                </dl>
                <div className="mt-auto flex flex-wrap items-center gap-2 border-t border-border px-3 py-2">
                  {nFaults > 0 && <StatusChip tone="danger" dot={false}><OctagonAlert className="h-3.5 w-3.5" aria-hidden="true" />{nFaults} open fault{nFaults === 1 ? "" : "s"}</StatusChip>}
                  {due && <StatusChip tone={due === "overdue" ? "danger" : "warning"} dot={false}><Wrench className="h-3.5 w-3.5" aria-hidden="true" />Service {due}</StatusChip>}
                  <span className="ml-auto flex items-center">
                    <Button variant="ghost" size="icon" onClick={() => setHistoryVehicle(v)} aria-label={`History of ${v.name}`} title="History"><History className="h-4 w-4" /></Button>
                    <Button variant="ghost" size="icon" onClick={() => openEdit(v)} aria-label={`Edit ${v.name}`} title="Edit"><Pencil className="h-4 w-4" /></Button>
                    <Button variant="ghost" size="icon" onClick={() => remove(v)} aria-label={`Delete ${v.name}`} title="Delete" className="text-danger hover:text-danger"><Trash2 className="h-4 w-4" /></Button>
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <VehicleFormDialog open={formOpen} onOpenChange={setFormOpen} vehicle={editing} companies={companies} routes={routes} onSaved={onChange} />
      <VehicleHistoryDialog
        vehicle={historyVehicle}
        open={!!historyVehicle}
        onOpenChange={(o) => !o && setHistoryVehicle(null)}
        faults={faults}
        schedules={schedules}
        inspectionResults={inspectionResults}
      />
    </div>
  );
}
