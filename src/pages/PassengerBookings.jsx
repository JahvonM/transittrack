import React, { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import AppLayout from "@/components/AppLayout";
import PullToRefresh from "@/components/PullToRefresh";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CalendarCheck } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";

export default function PassengerBookings() {
  const { toast } = useToast();
  const [trips, setTrips] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [assign, setAssign] = useState({});

  const load = async () => {
    const [t, v] = await Promise.all([
      base44.entities.Trip.list("-updated_date", 500),
      base44.entities.Vehicle.list(),
    ]);
    setTrips(t); setVehicles(v); setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const approve = async (trip) => {
    const vid = assign[trip.id];
    if (!vid) { toast({ title: "Select a vehicle first", variant: "destructive" }); return; }
    const vh = vehicles.find((x) => x.id === vid);
    await base44.entities.Trip.update(trip.id, {
      status: "on_the_way", vehicle_id: vid, vehicle_name: vh?.name, plate_number: vh?.plate_number, started_at: new Date().toISOString(),
    });
    toast({ title: "Booking approved & assigned" });
    load();
  };

  const pending = trips.filter((t) => t.status === "scheduled");
  const confirmed = trips.filter((t) => ["on_the_way", "arrived"].includes(t.status));

  const Card_ = ({ t }) => (
    <Card>
      <CardContent className="py-3 text-sm space-y-1">
        <div className="font-medium">{t.passenger_name || "Passenger"} · {t.pickup_name || "—"} → {t.dropoff_name || "—"}</div>
        <div className="text-muted-foreground">{t.passenger_phone || ""} {t.scheduled_time ? `· ${new Date(t.scheduled_time).toLocaleString()}` : ""}</div>
        {t.status === "scheduled" && (
          <div className="flex items-center gap-2 pt-1">
            <Select value={assign[t.id] || ""} onValueChange={(val) => setAssign((s) => ({ ...s, [t.id]: val }))}>
              <SelectTrigger className="h-8 w-44"><SelectValue placeholder="Assign vehicle" /></SelectTrigger>
              <SelectContent>{vehicles.map((v) => <SelectItem key={v.id} value={v.id}>{v.name} · {v.plate_number}</SelectItem>)}</SelectContent>
            </Select>
            <Button size="sm" onClick={() => approve(t)}>Approve</Button>
          </div>
        )}
      </CardContent>
    </Card>
  );

  return (
    <AppLayout title="Passenger bookings">
      <PullToRefresh onRefresh={load}>
      {loading ? <p className="text-muted-foreground">Loading…</p> : (
        <div className="grid md:grid-cols-2 gap-4">
          <div>
            <h2 className="text-sm font-semibold mb-2 flex items-center gap-2"><CalendarCheck className="w-4 h-4 text-amber-400" /> Pending ({pending.length})</h2>
            <div className="space-y-2">{pending.length ? pending.map(Card_) : <p className="text-sm text-muted-foreground">No pending bookings.</p>}</div>
          </div>
          <div>
            <h2 className="text-sm font-semibold mb-2 flex items-center gap-2"><CalendarCheck className="w-4 h-4 text-emerald-400" /> Confirmed ({confirmed.length})</h2>
            <div className="space-y-2">{confirmed.length ? confirmed.map((t) => (
              <Card key={t.id}><CardContent className="py-3 text-sm">
                <div className="font-medium">{t.passenger_name || "Passenger"} · {t.vehicle_name || "—"}</div>
                <div className="text-muted-foreground">{t.pickup_name} → {t.dropoff_name}</div>
                <Badge variant="secondary" className="mt-1">{t.status}</Badge>
              </CardContent></Card>
            )) : <p className="text-sm text-muted-foreground">No active bookings.</p>}</div>
          </div>
        </div>
      )}
      </PullToRefresh>
    </AppLayout>
  );
}