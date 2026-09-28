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

  return (
    <AppLayout title="Fleet Manager">
      <div className="max-w-4xl space-y-4">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div>
            <h2 className="text-lg font-semibold">Fleet Overview</h2>
            <p className="text-sm text-muted-foreground">{vehicles.length} vehicles · {vehicles.filter(v => v.status !== "offline").length} live</p>
          </div>
          <DelayBroadcast />
        </div>

        <Tabs value={tab} onValueChange={(v) => navigate("/manager/" + v)} className="grid md:grid-cols-[200px_1fr] gap-4 items-start">
          <TabsList className="flex flex-col justify-start h-auto gap-1 p-2">
            <TabsTrigger value="live" className="justify-start w-full">Live fleet</TabsTrigger>
            <TabsTrigger value="replay" className="justify-start w-full">Route replay</TabsTrigger>
            <TabsTrigger value="analytics" className="justify-start w-full">Analytics</TabsTrigger>
          </TabsList>
          <div>
            <TabsContent value="live">
              <FleetMap vehicles={vehicles} />
            </TabsContent>
            <TabsContent value="replay">
              <RouteReplay vehicles={vehicles} />
            </TabsContent>
            <TabsContent value="analytics">
              <FleetAnalytics trips={trips} vehicles={vehicles} />
            </TabsContent>
          </div>
        </Tabs>
      </div>
      {user?.role === "company" && <CompanyMessages vehicles={vehicles} />}
    </AppLayout>
  );
}