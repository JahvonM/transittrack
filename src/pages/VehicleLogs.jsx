import React, { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import AppLayout from "@/components/AppLayout";
import PullToRefresh from "@/components/PullToRefresh";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Activity, Radio } from "lucide-react";

export default function VehicleLogs() {
  const [vehicles, setVehicles] = useState([]);
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = () =>
    base44.entities.Vehicle.list().then((v) => {
      setVehicles(v.sort((a, b) => new Date(b.last_location_update || 0) - new Date(a.last_location_update || 0)));
      setLoading(false);
    });

  useEffect(() => {
    load();
    const unsub = base44.entities.Vehicle.subscribe((ev) => {
      const stamp = new Date().toLocaleTimeString();
      setEvents((cur) => [{ stamp, ...ev }].slice(0, 50));
    });
    return unsub;
  }, []);

  return (
    <AppLayout title="Vehicle live logs">
      <PullToRefresh onRefresh={load}>
      {loading ? <p className="text-muted-foreground">Loading…</p> : (
        <div className="grid lg:grid-cols-2 gap-4">
          <div>
            <h2 className="text-sm font-semibold mb-2 flex items-center gap-2"><Activity className="w-4 h-4 text-primary" /> Latest updates</h2>
            <div className="space-y-2">
              {vehicles.map((v) => (
                <Card key={v.id}><CardContent className="py-2.5 text-sm flex items-center justify-between">
                  <div>
                    <div className="font-medium">{v.name} · {v.plate_number}</div>
                    <div className="text-muted-foreground text-xs">
                      {v.last_location_update ? new Date(v.last_location_update).toLocaleString() : "no update yet"}
                      {v.current_lat != null && ` · ${v.current_lat.toFixed(4)}, ${v.current_lng.toFixed(4)}`}
                    </div>
                  </div>
                  <Badge variant={v.status === "offline" ? "secondary" : "default"}>{v.status}</Badge>
                </CardContent></Card>
              ))}
              {vehicles.length === 0 && <p className="text-sm text-muted-foreground">No vehicles.</p>}
            </div>
          </div>
          <div>
            <h2 className="text-sm font-semibold mb-2 flex items-center gap-2"><Radio className="w-4 h-4 text-emerald-400" /> Live event stream</h2>
            <Card><CardContent className="py-2.5 text-xs space-y-1 max-h-[60vh] overflow-y-auto">
              {events.length === 0 ? <p className="text-muted-foreground">Waiting for live updates…</p> :
                events.map((e, i) => (
                  <div key={i} className="border-b border-border/40 pb-1 last:border-0">
                    <span className="text-muted-foreground">{e.stamp}</span> · <Badge variant="secondary" className="mx-1">{e.type}</Badge>
                    {e.data?.name || e.data?.id}
                  </div>
                ))}
            </CardContent></Card>
          </div>
        </div>
      )}
      </PullToRefresh>
    </AppLayout>
  );
}