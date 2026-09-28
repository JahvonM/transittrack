import React, { useEffect, useState } from "react";
import EmptyState from "@/components/EmptyState";
import { base44 } from "@/api/base44Client";
import AppLayout from "@/components/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TrendingUp, Clock, MapPin } from "lucide-react";
import { loadFailed } from "@/lib/loadFailed";
import BusLoader from "@/components/BusLoader";

function avgMs(trips) {
  const durs = trips
    .filter((t) => t.started_at && t.completed_at)
    .map((t) => new Date(t.completed_at).getTime() - new Date(t.started_at).getTime())
    .filter((d) => d > 0);
  if (!durs.length) return null;
  return Math.round(durs.reduce((a, b) => a + b, 0) / durs.length);
}
function fmtDur(ms) {
  if (ms == null) return "—";
  const m = Math.round(ms / 60000);
  return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m`;
}

export default function RouteAnalytics() {
  const [routes, setRoutes] = useState([]);
  const [trips, setTrips] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([base44.entities.Route.list(), base44.entities.Trip.list("-updated_date", 500)]).then(([r, t]) => {
      setRoutes(r); setTrips(t); setLoading(false);
    }).catch(() => { setLoading(false); loadFailed(); });
  }, []);

  return (
    <AppLayout title="Route analytics">
      {loading ? <BusLoader className="py-8" /> : (
        <div className="grid md:grid-cols-2 gap-3">
          {routes.map((r) => {
            const rt = trips.filter((t) => t.route_id === r.id);
            const stops = (r.stops || []).length;
            const completed = rt.filter((t) => t.status === "completed").length;
            const cancelled = rt.filter((t) => t.status === "cancelled").length;
            return (
              <Card key={r.id}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex items-center justify-between">
                    <span className="flex items-center gap-2"><MapPin className="w-4 h-4 text-primary" /> {r.name}</span>
                    <Badge variant="secondary">{r.type}</Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent className="grid grid-cols-2 gap-3 text-sm">
                  <div className="flex items-center gap-2"><Clock className="w-4 h-4 text-muted-foreground" /> Avg time: <b>{fmtDur(avgMs(rt))}</b></div>
                  <div className="flex items-center gap-2"><MapPin className="w-4 h-4 text-muted-foreground" /> Stops: <b>{stops}</b></div>
                  <div className="flex items-center gap-2"><TrendingUp className="w-4 h-4 text-emerald-400" /> Completed: <b>{completed}</b></div>
                  <div className="flex items-center gap-2"><TrendingUp className="w-4 h-4 text-amber-400" /> Cancelled: <b>{cancelled}</b></div>
                </CardContent>
              </Card>
            );
          })}
          {routes.length === 0 && <EmptyState text="No routes yet." />}
        </div>
      )}
    </AppLayout>
  );
}