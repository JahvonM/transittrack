import React, { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import AppLayout from "@/components/AppLayout";
import MapboxMap from "@/components/MapboxMap";
import { Badge } from "@/components/ui/badge";
import { Route as RouteIcon } from "lucide-react";

export default function RouteExplorer() {
  const [routes, setRoutes] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [active, setActive] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([base44.entities.Route.list(), base44.entities.Vehicle.list()]).then(([r, v]) => {
      setRoutes(r.filter((x) => x.active)); setVehicles(v); setLoading(false);
    });
  }, []);

  const allStops = routes.flatMap((r) => (r.stops || []).map((s) => ({ ...s, name: `${s.name} (${r.name})` })));
  const shownVehicles = active ? vehicles.filter((v) => v.route_id === active) : vehicles;

  return (
    <AppLayout title="Route explorer">
      {loading ? <p className="text-muted-foreground">Loading…</p> : (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <button onClick={() => setActive(null)} className={`px-3 py-1.5 rounded-lg text-sm border transition-colors ${!active ? "bg-primary text-primary-foreground border-primary" : "border-border hover:bg-accent"}`}>All routes</button>
            {routes.map((r) => (
              <button key={r.id} onClick={() => setActive(r.id)} className={`px-3 py-1.5 rounded-lg text-sm border transition-colors flex items-center gap-1.5 ${active === r.id ? "bg-primary text-primary-foreground border-primary" : "border-border hover:bg-accent"}`}>
                <RouteIcon className="w-3.5 h-3.5" /> {r.name}
              </button>
            ))}
          </div>
          <div className="rounded-xl overflow-hidden border border-border">
            <MapboxMap vehicles={shownVehicles} stops={active ? (routes.find((r) => r.id === active)?.stops || []) : allStops} height="48vh" />
          </div>
          <div className="flex flex-wrap gap-2">
            {shownVehicles.map((v) => (
              <Badge key={v.id} variant="secondary">{v.name} · {v.status}</Badge>
            ))}
          </div>
        </div>
      )}
    </AppLayout>
  );
}