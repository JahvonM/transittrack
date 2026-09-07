import React, { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import AppLayout from "@/components/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { TrendingUp, Users, Clock } from "lucide-react";

export default function FleetAnalytics() {
  const [trips, setTrips] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      base44.entities.Trip.list("-created_date", 200),
      base44.entities.Vehicle.list("-created_date", 100),
    ])
      .then(([t, v]) => { setTrips(t); setVehicles(v); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const tripsPerVehicle = vehicles
    .map((v) => ({ name: v.name || "—", trips: trips.filter((t) => t.vehicle_id === v.id).length }))
    .sort((a, b) => b.trips - a.trips)
    .slice(0, 10);

  const avgLoad = vehicles
    .map((v) => ({
      name: v.name || "—",
      load: v.capacity ? Math.round((trips.filter((t) => t.vehicle_id === v.id).length / v.capacity) * 100) : 0,
    }))
    .sort((a, b) => b.load - a.load)
    .slice(0, 10);

  const hourCounts = Array.from({ length: 24 }, (_, h) => ({ hour: `${h}:00`, trips: 0 }));
  trips.forEach((t) => {
    const d = t.scheduled_time ? new Date(t.scheduled_time) : t.created_date ? new Date(t.created_date) : null;
    if (d) hourCounts[d.getHours()].trips++;
  });
  const peakHours = hourCounts.filter((h) => h.trips > 0).sort((a, b) => b.trips - a.trips);

  const chartStyle = { background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 };

  return (
    <AppLayout title="Fleet Analytics">
      <div className="space-y-4 max-w-5xl">
        {loading ? (
          <p className="text-muted-foreground">Loading analytics…</p>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <Card><CardContent className="p-4 flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-primary/10 grid place-items-center"><TrendingUp className="w-5 h-5 text-primary" /></div>
                <div><div className="text-2xl font-bold">{trips.length}</div><div className="text-xs text-muted-foreground">Total trips</div></div>
              </CardContent></Card>
              <Card><CardContent className="p-4 flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-primary/10 grid place-items-center"><Users className="w-5 h-5 text-primary" /></div>
                <div><div className="text-2xl font-bold">{vehicles.length}</div><div className="text-xs text-muted-foreground">Active vehicles</div></div>
              </CardContent></Card>
              <Card><CardContent className="p-4 flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-primary/10 grid place-items-center"><Clock className="w-5 h-5 text-primary" /></div>
                <div><div className="text-2xl font-bold">{peakHours[0]?.hour || "—"}</div><div className="text-xs text-muted-foreground">Peak hour</div></div>
              </CardContent></Card>
            </div>

            <Card>
              <CardHeader><CardTitle className="text-base">Trips per vehicle</CardTitle></CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={250}>
                  <BarChart data={tripsPerVehicle}>
                    <CartesianGrid strokeDasharray="3 3" className="opacity-20" />
                    <XAxis dataKey="name" tick={{ fontSize: 11 }} className="fill-muted-foreground" />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip contentStyle={chartStyle} />
                    <Bar dataKey="trips" fill="hsl(var(--chart-1))" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle className="text-base">Average passenger load (%)</CardTitle></CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={250}>
                  <BarChart data={avgLoad}>
                    <CartesianGrid strokeDasharray="3 3" className="opacity-20" />
                    <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip contentStyle={chartStyle} />
                    <Bar dataKey="load" fill="hsl(var(--chart-2))" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle className="text-base">Peak operating hours</CardTitle></CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={250}>
                  <BarChart data={peakHours}>
                    <CartesianGrid strokeDasharray="3 3" className="opacity-20" />
                    <XAxis dataKey="hour" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip contentStyle={chartStyle} />
                    <Bar dataKey="trips" fill="hsl(var(--chart-4))" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </AppLayout>
  );
}