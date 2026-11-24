import React, { useEffect, useState } from "react";
import { Navigate, useSearchParams } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Bus, AlertTriangle, Wrench, Package, ClipboardCheck, CalendarClock } from "lucide-react";
import FaultsTab from "@/components/admin/FaultsTab";
import MaintenanceScheduleTab from "@/components/admin/MaintenanceScheduleTab";
import MaintenanceCalendarTab from "@/components/admin/MaintenanceCalendarTab";
import InspectionHistoryTab from "@/components/admin/InspectionHistoryTab";
import { loadFailed } from "@/lib/loadFailed";
import BusLoader from "@/components/BusLoader";
import { Kpi, KpiRow, NestedPage } from "@/components/admin/kit";

const TAB = "h-9 rounded-lg px-3 text-body-sm font-semibold data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm";
const TABS = ["faults", "schedule", "calendar", "history"];
// Parts and the Bus library live in the Workshop now; an old link to their
// tabs (?tab=parts) opens the Workshop instead.
const MOVED = { parts: "/workshop/parts", library: "/workshop" };

// Everything ported from FleetPilot that the mechanic team actually needs to
// see and act on, in one place — reuses the same admin tab components
// (mechanics already have RLS create/update rights on Fault/Part/
// MaintenanceSchedule) rather than duplicating their logic. Vehicle
// creation/editing stays admin-only (dispatch concern, not maintenance).
export default function MechanicDashboardTab() {
  const [params] = useSearchParams();
  const moved = MOVED[params.get("tab")] || "";
  const startTab = TABS.includes(params.get("tab")) ? params.get("tab") : "faults";
  const [vehicles, setVehicles] = useState([]);
  const [faults, setFaults] = useState([]);
  const [parts, setParts] = useState([]);
  const [schedules, setSchedules] = useState([]);
  const [inspectionResults, setInspectionResults] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    try {
      const [v, f, p, s, ir] = await Promise.all([
        base44.entities.Vehicle.list(),
        base44.entities.Fault.list("-created_date", 1000),
        base44.entities.Part.list(),
        base44.entities.MaintenanceSchedule.list(),
        base44.entities.InspectionResult.list("-inspection_date", 500),
      ]);
      setVehicles(v);
      setFaults(f);
      setParts(p);
      setSchedules(s);
      setInspectionResults(ir);
    } catch {
      loadFailed(load);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!moved) load();
  }, [moved]);

  if (moved) return <Navigate to={moved} replace />;
  if (loading) {
    return <BusLoader className="py-8" />;
  }

  const openFaultsCount = faults.filter((f) => f.status === "open").length;
  const maintenanceDueCount = schedules.filter((s) => s.status === "due" || s.status === "overdue").length;

  return (
    <div className="space-y-4">
      <KpiRow className="mb-0">
        <Kpi icon={Bus} label="Vehicles" value={vehicles.length} />
        <Kpi icon={AlertTriangle} label="Open faults" value={openFaultsCount} tone={openFaultsCount ? "danger" : undefined} />
        <Kpi icon={CalendarClock} label="Maintenance due" value={maintenanceDueCount} tone={maintenanceDueCount ? "warning" : undefined} />
        <Kpi icon={Package} label="Parts" value={parts.length} />
      </KpiRow>
      <NestedPage>
      <Tabs defaultValue={startTab}>
        <TabsList className="h-auto max-w-full flex-wrap justify-start gap-1 rounded-xl bg-secondary p-1">
          <TabsTrigger value="faults" className={TAB}><AlertTriangle className="w-4 h-4 mr-1.5" />Faults</TabsTrigger>
          <TabsTrigger value="schedule" className={TAB}><Wrench className="w-4 h-4 mr-1.5" />Schedule</TabsTrigger>
          <TabsTrigger value="calendar" className={TAB}><CalendarClock className="w-4 h-4 mr-1.5" />Calendar</TabsTrigger>
          <TabsTrigger value="history" className={TAB}><ClipboardCheck className="w-4 h-4 mr-1.5" />Inspections</TabsTrigger>
        </TabsList>
        <TabsContent value="faults" className="mt-4">
          <FaultsTab faults={faults} onChange={load} />
        </TabsContent>
        <TabsContent value="schedule" className="mt-4">
          <MaintenanceScheduleTab schedules={schedules} vehicles={vehicles} onChange={load} />
        </TabsContent>
        <TabsContent value="calendar" className="mt-4">
          <MaintenanceCalendarTab schedules={schedules} vehicles={vehicles} />
        </TabsContent>
        <TabsContent value="history" className="mt-4">
          <InspectionHistoryTab results={inspectionResults} vehicles={vehicles} />
        </TabsContent>
      </Tabs>
      </NestedPage>
    </div>
  );
}
