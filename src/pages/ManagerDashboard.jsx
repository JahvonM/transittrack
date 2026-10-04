import React, { useEffect, useState } from "react";
import { Navigate, useParams, useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import AppLayout from "@/components/AppLayout";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import FleetMap from "@/components/manager/FleetMap";
import RouteReplay from "@/components/manager/RouteReplay";
import FleetAnalytics from "@/components/manager/FleetAnalytics";
import DelayBroadcast from "@/components/manager/DelayBroadcast";
import CompanyMessages from "@/components/manager/CompanyMessages";
import { loadFailed } from "@/lib/loadFailed";
import BusLoader from "@/components/BusLoader";
import { Kpi, KpiRow, PageActions } from "@/components/admin/kit";
import { fleetStatus } from "@/components/admin/AdminOverview";
import { Bus, CalendarClock, Radio, SatelliteDish } from "lucide-react";

export default function ManagerDashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { tab: urlTab } = useParams();
  const tab = urlTab || "live";
  const [vehicles, setVehicles] = useState([]);
  const [trips, setTrips] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const [v, t] = await Promise.all([
          base44.entities.Vehicle.list(),
          base44.entities.Trip.list("-created_date", 1000),
        ]);
        setVehicles(v);
        setTrips(t);
      } catch {
        loadFailed(load);
      } finally {
        setLoading(false);
      }
    };
    load();
    const unsub = base44.entities.Vehicle.subscribe(() => {
      base44.entities.Vehicle.list().then(setVehicles);
    });
    return unsub;
  }, []);

  if (user && user.role !== "admin" && user.role !== "company") return <Navigate to="/" replace />;
  if (loading)
    return (
      <AppLayout>
        <BusLoader className="py-8" />
      </AppLayout>
    );

  const now = Date.now();
  const st = vehicles.map((v) => fleetStatus(v, now).key);
  const today = new Date().toDateString();
  const tripsToday = trips.filter((t) => t.scheduled_time && new Date(t.scheduled_time).toDateString() === today).length;
  const TAB = "h-9 rounded-lg px-4 text-body-sm font-semibold data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm";

  return (
    <AppLayout title="Fleet manager">
      <PageActions>
        <DelayBroadcast />
      </PageActions>
      <KpiRow>
        <Kpi label="Vehicles" value={vehicles.length} icon={Bus} />
        <Kpi label="On route now" value={st.filter((k) => ["live", "stale", "speed"].includes(k)).length} icon={Radio} tone="success" />
        <Kpi label="Signal issues" value={st.filter((k) => k === "lost" || k === "stale").length} icon={SatelliteDish} tone={st.some((k) => k === "lost" || k === "stale") ? "warning" : undefined} detail="GPS late or lost" />
        <Kpi label="Trips today" value={tripsToday} icon={CalendarClock} />
      </KpiRow>

      <Tabs value={tab} onValueChange={(v) => navigate("/manager/" + v)}>
        <TabsList className="mb-4 h-auto gap-1 rounded-xl bg-secondary p-1">
          <TabsTrigger value="live" className={TAB}>Live fleet</TabsTrigger>
          <TabsTrigger value="replay" className={TAB}>Route replay</TabsTrigger>
          <TabsTrigger value="analytics" className={TAB}>Analytics</TabsTrigger>
        </TabsList>
        <TabsContent value="live" className="mt-0">
          <FleetMap vehicles={vehicles} />
        </TabsContent>
        <TabsContent value="replay" className="mt-0">
          <RouteReplay vehicles={vehicles} />
        </TabsContent>
        <TabsContent value="analytics" className="mt-0">
          <FleetAnalytics trips={trips} vehicles={vehicles} />
        </TabsContent>
      </Tabs>
      {user?.role === "company" && <CompanyMessages vehicles={vehicles} />}
    </AppLayout>
  );
}
