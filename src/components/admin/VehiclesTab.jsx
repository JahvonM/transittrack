import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/use-toast";
import { confirmAction } from "@/components/ConfirmHost";
import { FileSpreadsheet, FileText, History, Pencil, Plus, Trash2 } from "lucide-react";
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

  return (
    <div className="space-y-2">
      <div className="flex justify-end gap-2">
        <Button size="sm" onClick={openAdd}><Plus className="w-4 h-4" /> Add vehicle</Button>
        <Button size="sm" variant="outline" onClick={() => exportToCSV("vehicles", VEHICLE_COLS, vehicles)} disabled={!vehicles.length}>
          <FileSpreadsheet className="w-4 h-4" /> Excel
        </Button>
        <Button size="sm" variant="outline" onClick={() => exportToPDF("vehicles", "Vehicle fleet", VEHICLE_COLS, vehicles)} disabled={!vehicles.length}>
          <FileText className="w-4 h-4" /> PDF
        </Button>
      </div>
      {vehicles.length === 0 && (
        <p className="text-sm text-muted-foreground py-8 text-center border rounded-2xl">No vehicles yet. Add your first bus or taxi.</p>
      )}
      {vehicles.map((v) => {
        const details = [v.fleet_number && `No. ${v.fleet_number}`, v.plate_number, km(v.current_odometer), v.vin && `VIN ${v.vin}`].filter(Boolean);
        return (
          <div key={v.id} className="p-3 rounded-2xl border bg-card flex items-center gap-3">
            <div className="rounded-xl bg-muted/50 shrink-0" title={getModel(modelIdFor(v)).label}>
              <VehicleModelThumb model={modelIdFor(v)} size={52} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-medium truncate">{v.name}</div>
              <div className="text-xs text-muted-foreground truncate">{details.join(" · ") || "No details yet"}</div>
              <div className="text-xs text-muted-foreground truncate">
                {v.company_name || "No company"} · Driver: {v.driver_name || v.driver_email || "Unassigned"}
              </div>
            </div>
            <Badge variant={v.status === "on_trip" ? "default" : v.status === "idle" ? "secondary" : "outline"} className="hidden sm:inline-flex">
              {v.status === "on_trip" ? "On trip" : v.status === "idle" ? "Idle" : "Offline"}
            </Badge>
            <Button variant="ghost" size="icon" onClick={() => setHistoryVehicle(v)} aria-label="History"><History className="w-4 h-4" /></Button>
            <Button variant="ghost" size="icon" onClick={() => openEdit(v)} aria-label="Edit"><Pencil className="w-4 h-4" /></Button>
            <Button variant="ghost" size="icon" onClick={() => remove(v)} aria-label="Delete"><Trash2 className="w-4 h-4 text-destructive" /></Button>
          </div>
        );
      })}
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
