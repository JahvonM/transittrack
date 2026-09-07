import React, { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import AppLayout from "@/components/AppLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Bus, Car, Wrench, Route as RouteIcon } from "lucide-react";

export default function VehicleRegistry() {
  const [vehicles, setVehicles] = useState([]);
  const [inspections, setInspections] = useState([]);
  const [routes, setRoutes] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      base44.entities.Vehicle.list("-created_date", 200),
      base44.entities.Inspection.list("-created_date", 200),
      base44.entities.Route.list("-created_date", 100),
    ])
      .then(([v, i, r]) => { setVehicles(v); setInspections(i); setRoutes(r); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const lastInspection = (vehicleId) =>
    inspections
      .filter((i) => i.vehicle_id === vehicleId)
      .sort((a, b) => new Date(b.date) - new Date(a.date))[0];

  const routeName = (routeId) => routes.find((r) => r.id === routeId)?.name || "—";

  return (
    <AppLayout title="Vehicle Registry">
      <div className="space-y-2 max-w-5xl">
        {loading && <p className="text-muted-foreground">Loading fleet…</p>}
        {!loading && vehicles.length === 0 && (
          <p className="text-muted-foreground py-12 text-center">No vehicles registered.</p>
        )}
        {vehicles.map((v) => {
          const insp = lastInspection(v.id);
          return (
            <Card key={v.id}>
              <CardContent className="p-4">
                <div className="flex items-center gap-4 mb-3">
                  <div className="w-11 h-11 rounded-xl bg-primary/10 grid place-items-center shrink-0">
                    {v.type === "taxi" ? <Car className="w-5 h-5 text-primary" /> : <Bus className="w-5 h-5 text-primary" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate">
                      {v.name} <span className="text-xs text-muted-foreground font-normal">· {v.plate_number}</span>
                    </div>
                    <div className="text-xs text-muted-foreground">{v.company_name} · {v.driver_name || "Unassigned"}</div>
                  </div>
                  <Badge variant={v.status === "on_trip" ? "default" : v.status === "idle" ? "secondary" : "outline"}>
                    {v.status}
                  </Badge>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                  <div className="flex items-center gap-2">
                    <RouteIcon className="w-4 h-4 text-muted-foreground" />
                    <span className="text-muted-foreground">Route:</span>
                    <span className="font-medium">{routeName(v.route_id)}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Wrench className="w-4 h-4 text-muted-foreground" />
                    <span className="text-muted-foreground">Last service:</span>
                    <span className="font-medium">{insp ? `${insp.date} (${insp.status})` : "None"}</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </AppLayout>
  );
}