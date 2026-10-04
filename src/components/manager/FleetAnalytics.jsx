import React, { useMemo } from "react";
import EmptyState from "@/components/EmptyState";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart, Bar, CartesianGrid, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";

export default function FleetAnalytics({ trips, vehicles }) {
  const data = useMemo(() => {
    const byDriver = {};
    trips.forEach((t) => {
      const key = t.driver_name || "Unassigned";
      if (!byDriver[key]) byDriver[key] = { name: key, total: 0, onTime: 0 };
      byDriver[key].total++;
      if (t.status === "completed" && t.completed_at && t.scheduled_time) {
        const diff = new Date(t.completed_at) - new Date(t.scheduled_time);
        if (diff <= 15 * 60 * 1000) byDriver[key].onTime++;
      }
    });
    return Object.values(byDriver).map((d) => ({
      name: d.name.split(" ")[0],
      full: d.name,
      efficiency: d.total > 0 ? Math.round((d.onTime / d.total) * 100) : 0,
      trips: d.total,
    }));
  }, [trips]);

  const tick = { fontSize: 12, fill: "hsl(var(--muted-foreground))" };
  const tone = (e) => (e >= 80 ? "hsl(var(--success))" : e >= 50 ? "hsl(var(--warning))" : "hsl(var(--danger))");
  return (
    <Card className="rounded-2xl">
      <CardHeader className="pb-1">
        <CardTitle className="text-title-sm font-bold">Driver on-time rate</CardTitle>
        <p className="text-body-sm text-muted-foreground">Share of each driver's trips completed within 15 minutes of the scheduled time</p>
      </CardHeader>
      <CardContent>
        {data.length === 0 ? (
          <EmptyState text="No trip data yet." />
        ) : (
          <>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={data} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke="hsl(var(--border))" />
                <XAxis dataKey="name" tick={tick} axisLine={{ stroke: "hsl(var(--border))" }} tickLine={false} />
                <YAxis tick={tick} axisLine={false} tickLine={false} domain={[0, 100]} unit="%" />
                <Tooltip
                  contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 10, fontSize: 12, color: "hsl(var(--popover-foreground))" }}
                  cursor={{ fill: "hsl(var(--accent))", opacity: 0.5 }}
                  formatter={(v) => [`${v}%`, "On time"]}
                  labelFormatter={(_, p) => p?.[0]?.payload?.full || ""}
                />
                <Bar dataKey="efficiency" radius={[4, 4, 0, 0]} maxBarSize={24}>
                  {data.map((d, i) => <Cell key={i} fill={tone(d.efficiency)} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
            <div className="mt-2 flex flex-wrap justify-center gap-4 text-caption text-muted-foreground" aria-label="Legend">
              <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-success" aria-hidden="true" /> 80% or more</span>
              <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-warning" aria-hidden="true" /> 50–79%</span>
              <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-danger" aria-hidden="true" /> Under 50%</span>
            </div>
            <details className="mt-2 text-body-sm">
              <summary className="cursor-pointer font-semibold text-muted-foreground hover:text-foreground">Show as table</summary>
              <table className="mt-2 w-full">
                <thead><tr className="text-left text-caption text-muted-foreground"><th className="py-1.5 font-semibold">Driver</th><th className="py-1.5 text-right font-semibold">Trips</th><th className="py-1.5 text-right font-semibold">On time</th></tr></thead>
                <tbody>
                  {data.map((d) => (
                    <tr key={d.full} className="border-t border-border"><td className="py-1.5">{d.full}</td><td className="py-1.5 text-right tabular-nums">{d.trips}</td><td className="py-1.5 text-right tabular-nums">{d.efficiency}%</td></tr>
                  ))}
                </tbody>
              </table>
            </details>
          </>
        )}
      </CardContent>
    </Card>
  );
}
