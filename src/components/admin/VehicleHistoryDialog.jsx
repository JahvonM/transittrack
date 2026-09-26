import React from "react";
import { Link } from "react-router-dom";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AlertTriangle, Wrench, ClipboardCheck, ExternalLink } from "lucide-react";

// Per-vehicle rollup — port of FleetPilot's VehicleDetail.jsx tabs (faults /
// maintenance / inspections for one vehicle), shown as a dialog from the
// Vehicles admin tab rather than a dedicated /vehicles/:id route, since this
// app manages vehicles from a flat list, not per-vehicle pages.
export default function VehicleHistoryDialog({ vehicle, open, onOpenChange, faults = [], schedules = [], inspectionResults = [] }) {
  if (!vehicle) return null;
  const vFaults = faults.filter((f) => f.vehicle_id === vehicle.id);
  const vSchedules = schedules.filter((s) => s.vehicle_id === vehicle.id);
  const vInspections = inspectionResults.filter((i) => i.vehicle_id === vehicle.id);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
        <DialogHeader className="flex flex-row items-center justify-between gap-2 pr-6">
          <DialogTitle>{vehicle.name} — history</DialogTitle>
          <Button asChild variant="outline" size="sm">
            <Link to={`/vehicle/${vehicle.id}`}><ExternalLink className="w-3.5 h-3.5 mr-1.5" /> Full page</Link>
          </Button>
        </DialogHeader>
        <Tabs defaultValue="faults">
          <TabsList className="w-full">
            <TabsTrigger value="faults" className="flex-1"><AlertTriangle className="w-3.5 h-3.5 mr-1" /> Faults ({vFaults.length})</TabsTrigger>
            <TabsTrigger value="maintenance" className="flex-1"><Wrench className="w-3.5 h-3.5 mr-1" /> Maintenance ({vSchedules.length})</TabsTrigger>
            <TabsTrigger value="inspections" className="flex-1"><ClipboardCheck className="w-3.5 h-3.5 mr-1" /> Inspections ({vInspections.length})</TabsTrigger>
          </TabsList>
          <TabsContent value="faults" className="space-y-2 mt-3">
            {vFaults.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">No faults recorded.</p>
            ) : vFaults.map((f) => (
              <div key={f.id} className="flex items-center justify-between p-2.5 border rounded-lg text-sm gap-2">
                <div className="min-w-0">
                  <p className="font-medium truncate">{f.title}</p>
                  <p className="text-xs text-muted-foreground truncate">{f.description}</p>
                </div>
                <Badge variant={f.status === "open" ? "destructive" : "secondary"} className="text-xs capitalize shrink-0">{f.status}</Badge>
              </div>
            ))}
          </TabsContent>
          <TabsContent value="maintenance" className="space-y-2 mt-3">
            {vSchedules.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">No maintenance schedules.</p>
            ) : vSchedules.map((s) => (
              <div key={s.id} className="flex items-center justify-between p-2.5 border rounded-lg text-sm gap-2">
                <div className="min-w-0">
                  <p className="font-medium truncate">{s.service_type}</p>
                  <p className="text-xs text-muted-foreground truncate">
                    {s.due_type === "mileage" ? `Every ${s.interval_km?.toLocaleString() || 0} km` : `Every ${s.interval_days || 0} days`}
                  </p>
                </div>
                <Badge variant="outline" className="text-xs capitalize shrink-0">{s.status}</Badge>
              </div>
            ))}
          </TabsContent>
          <TabsContent value="inspections" className="space-y-2 mt-3">
            {vInspections.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">No inspections recorded.</p>
            ) : vInspections.slice(0, 50).map((i) => (
              <div key={i.id} className="flex items-center justify-between p-2.5 border rounded-lg text-sm gap-2">
                <div className="min-w-0">
                  <p className="font-medium truncate">{i.section_name}: {i.inspection_item}</p>
                  <p className="text-xs text-muted-foreground truncate">
                    {i.inspection_name} · {i.inspection_date ? new Date(i.inspection_date).toLocaleDateString() : ""}
                  </p>
                </div>
                <Badge variant={i.condition === "FAILED" ? "destructive" : i.condition === "WARNING" ? "secondary" : "outline"} className="text-xs shrink-0">
                  {i.condition}
                </Badge>
              </div>
            ))}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
