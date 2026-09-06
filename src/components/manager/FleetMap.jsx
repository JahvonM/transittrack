import React, { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import MapboxMap from "@/components/MapboxMap";
import useUserLocation from "@/hooks/useUserLocation";
import { Card, CardContent } from "@/components/ui/card";
import { Siren, Gauge, AlertTriangle } from "lucide-react";

export default function FleetMap({ vehicles }) {
  const { location: userLoc } = useUserLocation();
  const [liveVehicles, setLiveVehicles] = useState(vehicles);

  useEffect(() => {
    setLiveVehicles(vehicles);
    const unsub = base44.entities.Vehicle.subscribe((event) => {
      setLiveVehicles((prev) => {
        if (event.type === "delete") return prev.filter((v) => v.id !== event.id);
        const rec = event.data;
        if (!rec) return prev;
        const idx = prev.findIndex((v) => v.id === event.id);
        return idx === -1 ? [...prev, rec] : prev.map((v) => (v.id === event.id ? rec : v));
      });
    });
    return unsub;
  }, [vehicles]);

  const alerts = liveVehicles.filter((v) => v.status === "speeding" || v.status === "emergency");

  return (
    <div className="space-y-3">
      {alerts.length > 0 && (
        <Card className="border-destructive/50 bg-destructive/5">
          <CardContent className="py-3">
            <div className="flex items-center gap-2 mb-2 text-destructive font-medium">
              <AlertTriangle className="w-5 h-5" /> {alerts.length} vehicle(s) need attention
            </div>
            <div className="flex flex-wrap gap-2">
              {alerts.map((v) => (
                <div key={v.id} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-destructive/10 text-sm">
                  {v.status === "emergency" ? <Siren className="w-3.5 h-3.5 text-destructive" /> : <Gauge className="w-3.5 h-3.5 text-amber-400" />}
                  {v.name}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
      <div className="rounded-2xl overflow-hidden border">
        <MapboxMap vehicles={liveVehicles.filter((v) => v.current_lat != null)} userLocation={userLoc} height="60vh" />
      </div>
    </div>
  );
}