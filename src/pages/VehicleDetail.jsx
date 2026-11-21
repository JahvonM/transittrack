import React, { useEffect, useState } from "react";
import { useParams, useSearchParams, Navigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import AppLayout from "@/components/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { NestedPage } from "@/components/admin/kit";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { AlertTriangle, Wrench, ClipboardCheck, Box } from "lucide-react";
import FaultsTab from "@/components/admin/FaultsTab";
import MaintenanceScheduleTab from "@/components/admin/MaintenanceScheduleTab";
import InspectionHistoryTab from "@/components/admin/InspectionHistoryTab";
import Bus3DStudio from "@/components/vehicle3d/Bus3DStudio";
import { loadFailed } from "@/lib/loadFailed";
import BusLoader from "@/components/BusLoader";
import "@/pages/busHero.css";

// The picture at the top of a bus's page: its own, else the van at sunset.
const HERO_FALLBACK = "/images/van-side.webp";

const RESTRICTED_ROLES = ["driver", "staff", "passenger"];

// Dedicated per-vehicle page — port of FleetPilot's VehicleDetail.jsx tabs,
// as a real route rather than only the admin's VehicleHistoryDialog. Reuses
// the same admin tab components (already generic over props) scoped to a
// single vehicle, so create/update actions here go through the same code
// path — and the same RLS — as the fleet-wide admin/mechanic views.
export default function VehicleDetail() {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const { user } = useAuth();
  const [vehicle, setVehicle] = useState(null);
  const [faults, setFaults] = useState([]);
  const [schedules, setSchedules] = useState([]);
  const [inspectionResults, setInspectionResults] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    try {
      const v = await base44.entities.Vehicle.get(id);
      setVehicle(v);
      const [f, s, ir] = await Promise.all([
        base44.entities.Fault.filter({ vehicle_id: id }, "-created_date", 500),
        base44.entities.MaintenanceSchedule.filter({ vehicle_id: id }),
        base44.entities.InspectionResult.filter({ vehicle_id: id }, "-inspection_date", 500),
      ]);
      setFaults(f);
      setSchedules(s);
      setInspectionResults(ir);
    } catch {
      loadFailed(load);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  if (user && RESTRICTED_ROLES.includes(user.role)) return <Navigate to="/" replace />;

  if (loading) {
    return (
      <AppLayout title="Vehicle">
        <BusLoader className="py-8" />
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
      <div className="mx-auto max-w-5xl space-y-4">
        <section className="tt-bus-hero" aria-labelledby="tt-bus-name">
          <img className="tt-bus-hero-photo" src={vehicle.image_url || HERO_FALLBACK} onError={(e) => { if (!e.currentTarget.src.endsWith(HERO_FALLBACK)) e.currentTarget.src = HERO_FALLBACK; }} alt="" decoding="async" />
          <div>
            <div className="tt-bus-hero-tags">
              <span className="tt-bus-hero-tag" data-tone={vehicle.in_service === false ? "warning" : undefined}>{vehicle.in_service === false ? "Out of service" : "In service"}</span>
              {openFaultsCount > 0 && <span className="tt-bus-hero-tag" data-tone="danger">{openFaultsCount} open fault{openFaultsCount === 1 ? "" : "s"}</span>}
            </div>
            <h2 id="tt-bus-name" className="tt-bus-hero-name">{vehicle.name}</h2>
            <p className="tt-bus-hero-sub">{[[vehicle.make, vehicle.model, vehicle.year].filter(Boolean).join(" "), vehicle.company_name].filter(Boolean).join(", ") || "No make or company recorded yet."}</p>
          </div>
          <dl className="tt-bus-hero-chips">
            <div><dt>Fleet number</dt><dd>{vehicle.fleet_number || "—"}</dd></div>
            <div><dt>Plate</dt><dd>{vehicle.plate_number || "—"}</dd></div>
            <div><dt>Odometer</dt><dd>{(vehicle.current_odometer || 0).toLocaleString()} km</dd></div>
            <div><dt>Last inspection</dt><dd>{vehicle.last_inspection_date || "Never"}</dd></div>
          </dl>
        </section>

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

        <NestedPage>
        <Tabs defaultValue={searchParams.get("tab") === "studio" ? "studio" : "faults"}>
          <TabsList className="h-auto gap-1 rounded-xl bg-secondary p-1">
            <TabsTrigger value="faults" className="h-9 rounded-lg px-3 text-body-sm font-semibold data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm"><AlertTriangle className="w-4 h-4 mr-1.5" /> Faults</TabsTrigger>
            <TabsTrigger value="maintenance" className="h-9 rounded-lg px-3 text-body-sm font-semibold data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm"><Wrench className="w-4 h-4 mr-1.5" /> Maintenance</TabsTrigger>
            <TabsTrigger value="inspections" className="h-9 rounded-lg px-3 text-body-sm font-semibold data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm"><ClipboardCheck className="w-4 h-4 mr-1.5" /> Inspections</TabsTrigger>
            <TabsTrigger value="studio" className="h-9 rounded-lg px-3 text-body-sm font-semibold data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm"><Box className="w-4 h-4 mr-1.5" /> 360° View</TabsTrigger>
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
          <TabsContent value="studio" className="mt-4">
            <Bus3DStudio vehicle={vehicle} />
          </TabsContent>
        </Tabs>
        </NestedPage>
      </div>
    </AppLayout>
  );
}
