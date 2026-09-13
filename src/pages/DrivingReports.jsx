import React, { useEffect, useMemo, useState } from "react";
import { base44 } from "@/api/base44Client";
import AppLayout from "@/components/AppLayout";
import PullToRefresh from "@/components/PullToRefresh";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { Gauge, TrendingDown, TrendingUp, AlertOctagon, Zap } from "lucide-react";

const EVENT_META = {
  hard_brake: { label: "Hard braking", icon: TrendingDown, color: "text-amber-400" },
  rapid_accel: { label: "Rapid acceleration", icon: TrendingUp, color: "text-amber-400" },
  crash: { label: "Possible crash", icon: AlertOctagon, color: "text-destructive" },
};

// Deducted points per event, starting from a perfect 100 — mirrors the kind of
// driver score apps like Life360 show, computed from what we can observe here.
const PENALTY = { hard_brake: 4, rapid_accel: 4, crash: 25, speeding: 6 };

export default function DrivingReports() {
  const [events, setEvents] = useState([]);
  const [speedingIncidents, setSpeedingIncidents] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState(7);

  const load = () =>
    Promise.all([
      base44.entities.DrivingEvent.list("-occurred_at", 200),
      base44.entities.Incident.filter({ type: "speeding" }, "-occurred_at", 200),
      base44.entities.Vehicle.list(),
    ])
      .then(([ev, inc, v]) => { setEvents(ev); setSpeedingIncidents(inc); setVehicles(v); })
      .catch(() => {})
      .finally(() => setLoading(false));

  useEffect(() => {
    load();
  }, []);

  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  const recentEvents = events.filter((e) => new Date(e.occurred_at).getTime() >= cutoff);
  const recentSpeeding = speedingIncidents.filter((e) => new Date(e.occurred_at).getTime() >= cutoff);

  const byVehicle = useMemo(() => {
    const map = new Map();
    vehicles.forEach((v) => map.set(v.id, {
      id: v.id, name: v.name, driver_name: v.driver_name, hard_brake: 0, rapid_accel: 0, crash: 0, speeding: 0,
    }));
    recentEvents.forEach((e) => {
      if (!map.has(e.vehicle_id)) map.set(e.vehicle_id, { id: e.vehicle_id, name: e.vehicle_name, driver_name: e.driver_name, hard_brake: 0, rapid_accel: 0, crash: 0, speeding: 0 });
      map.get(e.vehicle_id)[e.type]++;
    });
    recentSpeeding.forEach((e) => {
      if (!map.has(e.vehicle_id)) map.set(e.vehicle_id, { id: e.vehicle_id, name: e.vehicle_name, driver_name: e.driver_name, hard_brake: 0, rapid_accel: 0, crash: 0, speeding: 0 });
      map.get(e.vehicle_id).speeding++;
    });
    return [...map.values()].map((v) => {
      const score = Math.max(0, 100 - v.hard_brake * PENALTY.hard_brake - v.rapid_accel * PENALTY.rapid_accel - v.crash * PENALTY.crash - v.speeding * PENALTY.speeding);
      return { ...v, score };
    }).sort((a, b) => a.score - b.score);
  }, [vehicles, recentEvents, recentSpeeding]);

  const chartData = byVehicle.map((v) => ({ name: v.name, score: v.score }));
  const scoreColor = (s) => (s >= 85 ? "text-emerald-400" : s >= 60 ? "text-amber-400" : "text-destructive");
  const chartStyle = { background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 14 };

  return (
    <AppLayout title="Driving reports">
      <PullToRefresh onRefresh={load}>
      {loading ? <p className="text-muted-foreground">Loading…</p> : (
        <div className="space-y-4">
          <div className="flex items-center gap-2 p-3 rounded-lg bg-muted/50 border text-xs text-muted-foreground">
            <Zap className="w-4 h-4 shrink-0" />
            Scores are estimated from GPS speed changes between periodic location updates (~8s apart), not from accelerometer sensors — treat them as a directional signal, not a precise measurement.
          </div>

          <div className="flex gap-2">
            {[7, 30, 90].map((d) => (
              <button
                key={d}
                onClick={() => setDays(d)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${days === d ? "bg-primary text-primary-foreground border-primary" : "bg-card border-border text-muted-foreground hover:bg-accent"}`}
              >
                Last {d} days
              </button>
            ))}
          </div>

          <Card>
            <CardHeader><CardTitle className="text-base flex items-center gap-2"><Gauge className="w-4 h-4 text-primary" /> Driving score by vehicle</CardTitle></CardHeader>
            <CardContent>
              {chartData.length === 0 ? (
                <p className="text-sm text-muted-foreground py-8 text-center">No vehicles yet.</p>
              ) : (
                <ResponsiveContainer width="100%" height={Math.max(200, chartData.length * 34)}>
                  <BarChart data={chartData} layout="vertical" margin={{ left: 24 }}>
                    <CartesianGrid strokeDasharray="3 3" className="opacity-20" />
                    <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 14 }} />
                    <YAxis type="category" dataKey="name" tick={{ fontSize: 14 }} width={110} />
                    <Tooltip contentStyle={chartStyle} />
                    <Bar dataKey="score" fill="hsl(var(--chart-1))" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          <div className="space-y-2">
            {byVehicle.map((v) => (
              <Card key={v.id}>
                <CardContent className="py-3 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-medium text-sm truncate">{v.name}</div>
                    <div className="text-xs text-muted-foreground truncate">{v.driver_name || "Unassigned"}</div>
                    <div className="flex flex-wrap gap-1.5 mt-1.5">
                      {v.hard_brake > 0 && <Badge variant="secondary" className="text-sm">{v.hard_brake} hard brake{v.hard_brake > 1 ? "s" : ""}</Badge>}
                      {v.rapid_accel > 0 && <Badge variant="secondary" className="text-sm">{v.rapid_accel} rapid accel{v.rapid_accel > 1 ? "s" : ""}</Badge>}
                      {v.speeding > 0 && <Badge variant="secondary" className="text-sm">{v.speeding} speeding</Badge>}
                      {v.crash > 0 && <Badge variant="destructive" className="text-sm">{v.crash} possible crash{v.crash > 1 ? "es" : ""}</Badge>}
                      {v.hard_brake + v.rapid_accel + v.speeding + v.crash === 0 && <Badge variant="outline" className="text-sm">No events</Badge>}
                    </div>
                  </div>
                  <div className={`text-2xl font-bold shrink-0 ${scoreColor(v.score)}`}>{v.score}</div>
                </CardContent>
              </Card>
            ))}
            {byVehicle.length === 0 && <p className="text-sm text-muted-foreground text-center py-8">No vehicles to report on yet.</p>}
          </div>
        </div>
      )}
      </PullToRefresh>
    </AppLayout>
  );
}
