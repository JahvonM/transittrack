import React, { useEffect, useState } from "react";
import { useParams, useNavigate, Navigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import AppLayout from "@/components/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ArrowLeft, Bus, AlertTriangle, Wrench, ClipboardCheck } from "lucide-react";
import FaultsTab from "@/components/admin/FaultsTab";
import MaintenanceScheduleTab from "@/components/admin/MaintenanceScheduleTab";
import InspectionHistoryTab from "@/components/admin/InspectionHistoryTab";
import AnimatedBus from "@/components/AnimatedBus";

const RESTRICTED_ROLES = ["driver", "staff", "passenger"];

// Dedicated per-vehicle page — port of FleetPilot's VehicleDetail.jsx tabs,
// as a real route rather than only the admin's VehicleHistoryDialog. Reuses
// the same admin tab components (already generic over props) scoped to a
// single vehicle, so create/update actions here go through the same code
// path — and the same RLS — as the fleet-wide admin/mechanic views.
export default function VehicleDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [vehicle, setVehicle] = useState(null);
  const [faults, setFaults] = useState([]);
  const [schedules, setSchedules] = useState([]);
  const [inspectionResults, setInspectionResults] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    const v = await base44.entities.Vehicle.get(id);
    setVehicle(v);
    const [f, s, ir] = await Promise.all([
      base44.entities.Fault.filter({ vehicle_id: id }),
      base44.entities.MaintenanceSchedule.filter({ vehicle_id: id }),
      base44.entities.InspectionResult.filter({ vehicle_id: id }, "-inspection_date", 500),
    ]);
    setFaults(f);
    setSchedules(s);
    setInspectionResults(ir);
    setLoading(false);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  if (user && RESTRICTED_ROLES.includes(user.role)) return <Navigate to="/" replace />;

  if (loading) {
    return (
      <AppLayout title="Vehicle">
        <p className="text-muted-foreground">Loading…</p>
      </AppLayout>
    );
  }

  if (!vehicle) {
    return (
      <AppLayout title="Vehicle">
        <p className="text-muted-foreground">Vehicle not found.</p>
      </AppLayout>
    );
  }

  const info = [
    { label: "Fleet number", value: vehicle.fleet_number || "—" },
    { label: "Plate", value: vehicle.plate_number || "—" },
    { label: "Make / model", value: [vehicle.make, vehicle.model, vehicle.year].filter(Boolean).join(" ") || "—" },
    { label: "VIN", value: vehicle.vin || "—" },
    { label: "Engine", value: vehicle.engine || "—" },
    { label: "Transmission", value: vehicle.transmission || "—" },
    { label: "Odometer", value: `${(vehicle.current_odometer || 0).toLocaleString()} km` },
    { label: "Hours", value: `${(vehicle.hours || 0).toLocaleString()} hrs` },
    { label: "Fuel type", value: vehicle.fuel_type || "—" },
    { label: "Last inspection", value: vehicle.last_inspection_date || "Never" },
  ];

  const openFaultsCount = faults.filter((f) => f.status === "open").length;

  return (
    <AppLayout title={vehicle.name}>
      <div className="max-w-4xl space-y-4">
        <Button variant="ghost" size="sm" onClick={() => navigate(-1)} className="-ml-2">
          <ArrowLeft className="w-4 h-4 mr-1.5" /> Back
        </Button>
        <div className="rounded-2xl border border-border bg-card p-5 pb-0 overflow-hidden">
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-primary/10 grid place-items-center shrink-0">
              <Bus className="w-6 h-6 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-heading font-bold">{vehicle.name}</h1>
              <p className="text-sm text-muted-foreground">{vehicle.company_name}</p>
            </div>
          </div>
          <div className="flex gap-2">
            <Badge variant={vehicle.in_service === false ? "secondary" : "default"}>
              {vehicle.in_service === false ? "Out of service" : "In service"}
            </Badge>
            {openFaultsCount > 0 && (
              <Badge variant="destructive">{openFaultsCount} open fault{openFaultsCount === 1 ? "" : "s"}</Badge>
            )}
          </div>
        </div>
        <div
          className="relative -mx-5 mt-2 h-28 overflow-hidden"
          style={{ background: "radial-gradient(80% 100% at 50% 100%, hsl(var(--primary) / 0.18), transparent 70%)" }}
        >
          <div className="absolute left-1/2 -translate-x-1/2 bottom-1">
            <AnimatedBus mode="arrive" width={220} />
          </div>
        </div>
        </div>

        <Card>
          <CardHeader><CardTitle className="text-base">Vehicle information</CardTitle></CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {info.map((item) => (
                <div key={item.label}>
                  <p className="text-xs text-muted-foreground">{item.label}</p>
                  <p className="text-sm font-medium mt-0.5">{item.value}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Tabs defaultValue="faults">
          <TabsList>
            <TabsTrigger value="faults"><AlertTriangle className="w-4 h-4 mr-1.5" /> Faults</TabsTrigger>
            <TabsTrigger value="maintenance"><Wrench className="w-4 h-4 mr-1.5" /> Maintenance</TabsTrigger>
            <TabsTrigger value="inspections"><ClipboardCheck className="w-4 h-4 mr-1.5" /> Inspections</TabsTrigger>
          </TabsList>
          <TabsContent value="faults" className="mt-4">
            <FaultsTab faults={faults} onChange={load} />
          </TabsContent>
          <TabsContent value="maintenance" className="mt-4">
            <MaintenanceScheduleTab schedules={schedules} vehicles={[vehicle]} onChange={load} />
          </TabsContent>
          <TabsContent value="inspections" className="mt-4">
            <InspectionHistoryTab results={inspectionResults} vehicles={[vehicle]} />
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
}
