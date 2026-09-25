import React, { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Bus, AlertTriangle, Wrench, Package, ClipboardCheck, CalendarClock } from "lucide-react";
import FaultsTab from "@/components/admin/FaultsTab";
import PartsTab from "@/components/admin/PartsTab";
import MaintenanceScheduleTab from "@/components/admin/MaintenanceScheduleTab";
import MaintenanceCalendarTab from "@/components/admin/MaintenanceCalendarTab";
import InspectionHistoryTab from "@/components/admin/InspectionHistoryTab";

function StatCard({ icon: Icon, label, value, accent = "text-primary" }) {
  return (
    <div className="rounded-xl border bg-card p-4">
      <Icon className={`w-5 h-5 mb-2 ${accent}`} />
      <div className="text-2xl font-bold leading-none">{value}</div>
      <div className="text-xs text-muted-foreground mt-1.5">{label}</div>
    </div>
  );
}

// Everything ported from FleetPilot that the mechanic team actually needs to
// see and act on, in one place — reuses the same admin tab components
// (mechanics already have RLS create/update rights on Fault/Part/
// MaintenanceSchedule) rather than duplicating their logic. Vehicle
// creation/editing stays admin-only (dispatch concern, not maintenance).
export default function MechanicDashboardTab() {
  const [vehicles, setVehicles] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [faults, setFaults] = useState([]);
  const [parts, setParts] = useState([]);
  const [schedules, setSchedules] = useState([]);
  const [inspectionResults, setInspectionResults] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    const [v, c, f, p, s, ir] = await Promise.all([
      base44.entities.Vehicle.list(),
      base44.entities.Company.list(),
      base44.entities.Fault.list(),
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
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  if (loading) {
    return <p className="text-muted-foreground">Loading…</p>;
  }

  const openFaultsCount = faults.filter((f) => f.status === "open").length;
  const maintenanceDueCount = schedules.filter((s) => s.status === "due" || s.status === "overdue").length;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard icon={Bus} label="Vehicles" value={vehicles.length} />
        <StatCard icon={AlertTriangle} label="Open faults" value={openFaultsCount} accent="text-destructive" />
        <StatCard icon={CalendarClock} label="Maintenance due" value={maintenanceDueCount} accent="text-amber-500" />
        <StatCard icon={Package} label="Parts" value={parts.length} />
      </div>
      <Tabs defaultValue="faults">
        <TabsList className="w-full justify-start overflow-x-auto h-auto py-1">
          <TabsTrigger value="faults"><AlertTriangle className="w-4 h-4 mr-1.5" />Faults</TabsTrigger>
          <TabsTrigger value="schedule"><Wrench className="w-4 h-4 mr-1.5" />Schedule</TabsTrigger>
          <TabsTrigger value="calendar"><CalendarClock className="w-4 h-4 mr-1.5" />Calendar</TabsTrigger>
          <TabsTrigger value="parts"><Package className="w-4 h-4 mr-1.5" />Parts</TabsTrigger>
          <TabsTrigger value="history"><ClipboardCheck className="w-4 h-4 mr-1.5" />Inspections</TabsTrigger>
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
          <PartsTab parts={parts} companies={companies} onChange={load} />
        </TabsContent>
        <TabsContent value="history" className="mt-4">
          <InspectionHistoryTab results={inspectionResults} vehicles={vehicles} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
