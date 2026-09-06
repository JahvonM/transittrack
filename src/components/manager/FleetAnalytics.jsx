import React, { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";

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

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Driver Efficiency</CardTitle>
      </CardHeader>
      <CardContent>
        {data.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center">No trip data yet.</p>
        ) : (
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={data}>
              <XAxis dataKey="name" stroke="#94a3b8" fontSize={12} />
              <YAxis stroke="#94a3b8" fontSize={12} domain={[0, 100]} unit="%" />
              <Tooltip
                contentStyle={{ background: "#0f172a", border: "1px solid #1e293b", borderRadius: 12 }}
                formatter={(v) => [`${v}%`, "On-time"]}
                labelFormatter={(_, p) => p?.[0]?.payload?.full || ""}
              />
              <Bar dataKey="efficiency" radius={[6, 6, 0, 0]}>
                {data.map((d, i) => (
                  <Cell key={i} fill={d.efficiency >= 80 ? "#34d399" : d.efficiency >= 50 ? "#f59e0b" : "#ef4444"} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
        <div className="flex justify-center gap-4 mt-2 text-xs text-muted-foreground">
          <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-green-400" /> ≥80%</span>
          <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-amber-400" /> 50-79%</span>
          <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-red-400" /> &lt;50%</span>
        </div>
      </CardContent>
    </Card>
  );
}