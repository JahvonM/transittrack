import React, { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import MovedToWorkshop from "@/components/admin/MovedToWorkshop";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Bus, AlertTriangle, Wrench, Package, ClipboardCheck, CalendarClock, BookOpen } from "lucide-react";
import FaultsTab from "@/components/admin/FaultsTab";
import PartsTab from "@/components/admin/PartsTab";
import BusLibraryTab from "@/components/admin/BusLibraryTab";
import MaintenanceScheduleTab from "@/components/admin/MaintenanceScheduleTab";
import MaintenanceCalendarTab from "@/components/admin/MaintenanceCalendarTab";
import InspectionHistoryTab from "@/components/admin/InspectionHistoryTab";
import { loadFailed } from "@/lib/loadFailed";
import BusLoader from "@/components/BusLoader";
import { Kpi, KpiRow, NestedPage } from "@/components/admin/kit";

const TAB = "h-9 rounded-lg px-3 text-body-sm font-semibold data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm";
const TABS = ["faults", "schedule", "calendar", "parts", "library", "history"];

// Parts and the Bus library moved into the Workshop. Their tabs say so and
// open it; the old screen is one tap away (Old view) for one release.
function MovedTab({ title, to, open, onOpen, children }) {
  return (
    <>
      <MovedToWorkshop title={title} to={to} note={open ? undefined : "The old view is still here for now."}>
        {!open && <Button variant="outline" onClick={onOpen}>Old view</Button>}
      </MovedToWorkshop>
      {open && children}
    </>
  );
}

// Everything ported from FleetPilot that the mechanic team actually needs to
// see and act on, in one place — reuses the same admin tab components
// (mechanics already have RLS create/update rights on Fault/Part/
// MaintenanceSchedule) rather than duplicating their logic. Vehicle
// creation/editing stays admin-only (dispatch concern, not maintenance).
export default function MechanicDashboardTab() {
  // ?tab=parts opens a tab (the Workshop's Old view links); &old=1 shows its old view.
  const [params] = useSearchParams();
  const startTab = TABS.includes(params.get("tab")) ? params.get("tab") : "faults";
  const [oldView, setOldView] = useState(() => (params.get("old") === "1" ? { [startTab]: true } : {}));
  const [vehicles, setVehicles] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [faults, setFaults] = useState([]);
  const [parts, setParts] = useState([]);
  const [schedules, setSchedules] = useState([]);
  const [inspectionResults, setInspectionResults] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    try {
      const [v, c, f, p, s, ir] = await Promise.all([
        base44.entities.Vehicle.list(),
        base44.entities.Company.list(),
        base44.entities.Fault.list("-created_date", 1000),
        base44.entities.Part.list(),
        base44.entities.MaintenanceSchedule.list(),
        base44.entities.InspectionResult.list("-inspection_date", 500),
      ]);
      setVehicles(v);
      setCompanies(c);
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
    load();
  }, []);

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
          <TabsTrigger value="parts" className={TAB}><Package className="w-4 h-4 mr-1.5" />Parts</TabsTrigger>
          <TabsTrigger value="library" className={TAB}><BookOpen className="w-4 h-4 mr-1.5" />Library</TabsTrigger>
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
        <TabsContent value="parts" className="mt-4">
          <MovedTab title="Parts now lives in the Workshop." to="/workshop/parts" open={!!oldView.parts} onOpen={() => setOldView((v) => ({ ...v, parts: true }))}>
            <PartsTab parts={parts} companies={companies} onChange={load} canDelete={false} />
          </MovedTab>
        </TabsContent>
        <TabsContent value="library" className="mt-4">
          <MovedTab title="The Bus library now lives in the Workshop: each vehicle's specs, service schedule, parts and manuals." to="/workshop" open={!!oldView.library} onOpen={() => setOldView((v) => ({ ...v, library: true }))}>
            <BusLibraryTab vehicles={vehicles} />
          </MovedTab>
        </TabsContent>
        <TabsContent value="history" className="mt-4">
          <InspectionHistoryTab results={inspectionResults} vehicles={vehicles} />
        </TabsContent>
      </Tabs>
      </NestedPage>
    </div>
  );
}
