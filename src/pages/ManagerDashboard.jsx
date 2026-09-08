import React, { useEffect, useState } from "react";
import { Navigate, useParams, useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import AppLayout from "@/components/AppLayout";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import FleetMap from "@/components/manager/FleetMap";
import RouteReplay from "@/components/manager/RouteReplay";
import FleetAnalytics from "@/components/manager/FleetAnalytics";
import { waLink } from "@/lib/mapbox";
import { Megaphone } from "lucide-react";
import { Button } from "@/components/ui/button";

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
      const [v, t] = await Promise.all([
        base44.entities.Vehicle.list(),
        base44.entities.Trip.list(),
      ]);
      setVehicles(v);
      setTrips(t);
      setLoading(false);
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
        <p className="text-muted-foreground">Loading…</p>
      </AppLayout>
    );

  const broadcastLink = waLink(
    null,
    "🚌 Staff Bus Update: There is a delay with today's service. We apologise for the inconvenience and will update shortly."
  );

  return (
    <AppLayout title="Fleet Manager">
      <div className="max-w-4xl space-y-4">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div>
            <h2 className="text-lg font-semibold">Fleet Overview</h2>
            <p className="text-sm text-muted-foreground">{vehicles.length} vehicles · {vehicles.filter(v => v.status !== "offline").length} live</p>
          </div>
          <Button asChild variant="outline">
            <a href={broadcastLink} target="_blank" rel="noopener noreferrer">
              <Megaphone className="w-4 h-4 mr-2" /> Broadcast group delay
            </a>
          </Button>
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
    </AppLayout>
  );
}