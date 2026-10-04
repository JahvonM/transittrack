import React, { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import AppLayout from "@/components/AppLayout";
import PullToRefresh from "@/components/PullToRefresh";
import { Card, CardContent } from "@/components/ui/card";
import { StatusChip } from "@/components/admin/kit";
import { Bus, Calendar, Clock, MapPin } from "lucide-react";

export default function RideHistory() {
  const [trips, setTrips] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = () =>
    base44.entities.Trip.list("-completed_at", 50)
      .then((data) => setTrips(data.filter((t) => t.status === "completed")))
      .catch(() => {})
      .finally(() => setLoading(false));

  useEffect(() => {
    load();
  }, []);

  return (
    <AppLayout title="Ride History">
      <PullToRefresh onRefresh={load} className="max-w-3xl">
      <div className="space-y-3">
        {loading && <p className="text-muted-foreground">Loading your rides…</p>}
        {!loading && trips.length === 0 && (
          <p className="text-muted-foreground py-12 text-center">No completed rides yet.</p>
        )}
        {trips.map((trip) => (
          <Card key={trip.id}>
            <CardContent className="p-4 flex items-center gap-4">
              <div className="w-11 h-11 rounded-xl bg-primary/10 grid place-items-center shrink-0">
                <Bus className="w-5 h-5 text-primary" />
              </div>
              <div className="flex-1 min-w-0 space-y-1">
                <div className="font-medium truncate">{trip.route_name || "Route"}</div>
                <div className="text-xs text-muted-foreground flex items-center gap-2">
                  <MapPin className="w-3 h-3" />
                  {trip.pickup_name || "—"} → {trip.dropoff_name || "—"}
                </div>
                <div className="text-xs text-muted-foreground flex items-center gap-3">
                  <span className="flex items-center gap-1">
                    <Calendar className="w-3 h-3" />
                    {trip.completed_at ? new Date(trip.completed_at).toLocaleDateString() : "—"}
                  </span>
                  <span className="flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    {trip.completed_at ? new Date(trip.completed_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : ""}
                  </span>
                </div>
              </div>
              <StatusChip tone="neutral" dot={false}>{trip.vehicle_name || ""}</StatusChip>
            </CardContent>
          </Card>
        ))}
      </div>
      </PullToRefresh>
    </AppLayout>
  );
}