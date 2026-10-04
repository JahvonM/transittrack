import React, { useEffect, useState } from "react";
import { StatusChip } from "@/components/admin/kit";
import EmptyState from "@/components/EmptyState";
import BusLoader from "@/components/BusLoader";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import AppLayout from "@/components/AppLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Calendar, Clock, Bus, MapPin } from "lucide-react";

export default function DriverSchedule() {
  const { user } = useAuth();
  const [vehicle, setVehicle] = useState(null);
  const [trips, setTrips] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user?.email) return;
    Promise.all([
      base44.entities.Vehicle.filter({ driver_email: user.email }),
      base44.entities.Trip.filter({ driver_email: user.email }, "-scheduled_time", 200),
    ])
      .then(([vs, ts]) => {
        setVehicle(vs[0] || null);
        setTrips(ts.sort((a, b) => new Date(a.scheduled_time || a.created_date) - new Date(b.scheduled_time || b.created_date)));
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [user]);

  const today = new Date().toDateString();
  const todayTrips = trips.filter((t) => t.scheduled_time && new Date(t.scheduled_time).toDateString() === today);
  const upcoming = trips.filter(
    (t) => t.scheduled_time && new Date(t.scheduled_time) > new Date() && new Date(t.scheduled_time).toDateString() !== today
  );

  const ShiftCard = ({ t }) => (
    <Card><CardContent className="p-4 flex items-center gap-4">
      <div className="w-11 h-11 rounded-xl bg-primary/10 grid place-items-center"><Clock className="w-5 h-5 text-primary" /></div>
      <div className="flex-1 min-w-0 space-y-1">
        <div className="font-medium truncate">{t.route_name || "Route"}</div>
        <div className="text-xs text-muted-foreground flex items-center gap-2">
          <MapPin className="w-3 h-3" />{t.pickup_name || "—"} → {t.dropoff_name || "—"}
        </div>
        <div className="text-xs text-muted-foreground">
          {t.scheduled_time ? new Date(t.scheduled_time).toLocaleString() : "—"}
        </div>
      </div>
      <StatusChip status={t.status} />
    </CardContent></Card>
  );

  return (
    <AppLayout title="Driver Schedule">
      <div className="max-w-2xl space-y-4">
        {loading && <BusLoader label="Loading your shifts…" className="py-6" />}

        {vehicle && (
          <Card>
            <CardContent className="p-4 flex items-center gap-4">
              <div className="w-11 h-11 rounded-xl bg-primary/10 grid place-items-center"><Bus className="w-5 h-5 text-primary" /></div>
              <div className="flex-1">
                <div className="font-medium">{vehicle.name}</div>
                <div className="text-xs text-muted-foreground">{vehicle.plate_number} · {vehicle.company_name}</div>
              </div>
            </CardContent>
          </Card>
        )}

        <div>
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-1.5">
            <Calendar className="w-4 h-4" /> Today's shifts
          </h3>
          <div className="space-y-2">
            {todayTrips.length === 0 && <EmptyState text="No shifts scheduled for today." />}
            {todayTrips.map((t) => <ShiftCard key={t.id} t={t} />)}
          </div>
        </div>

        <div>
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-1.5">
            <Calendar className="w-4 h-4" /> Upcoming
          </h3>
          <div className="space-y-2">
            {upcoming.length === 0 && <EmptyState text="No upcoming shifts." />}
            {upcoming.map((t) => <ShiftCard key={t.id} t={t} />)}
          </div>
        </div>
      </div>
    </AppLayout>
  );
}