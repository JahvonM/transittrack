import React, { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import AppLayout from "@/components/AppLayout";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { TrendingUp, Bus, Clock } from "lucide-react";
import BusLoader from "@/components/BusLoader";
import { Kpi, KpiRow, Panel } from "@/components/admin/kit";

// One data colour for every single-series chart: the measure is named by the
// title, so colour carries no identity here.
const DATA = "hsl(var(--info))";
const TICK = { fontSize: 12, fill: "hsl(var(--muted-foreground))" };

function BarPanel({ title, description, data, x, y, unit = "", domain, empty }) {
  const tip = { background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 10, fontSize: 12, color: "hsl(var(--popover-foreground))" };
  return (
    <Panel title={title} description={description}>
      {data.length === 0 ? (
        <p className="py-10 text-center text-body-sm text-muted-foreground">{empty || "No data yet."}</p>
      ) : (
        <>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -12 }} barCategoryGap="30%">
              <CartesianGrid vertical={false} stroke="hsl(var(--border))" />
              <XAxis dataKey={x} tick={TICK} axisLine={{ stroke: "hsl(var(--border))" }} tickLine={false} interval={0} />
              <YAxis tick={TICK} axisLine={false} tickLine={false} allowDecimals={false} domain={domain} />
              <Tooltip contentStyle={tip} cursor={{ fill: "hsl(var(--accent))", opacity: 0.5 }} formatter={(v) => [`${v}${unit}`, title]} />
              <Bar dataKey={y} fill={DATA} radius={[4, 4, 0, 0]} maxBarSize={24} />
            </BarChart>
          </ResponsiveContainer>
          <details className="mt-2 text-body-sm">
            <summary className="cursor-pointer font-semibold text-muted-foreground hover:text-foreground">Show as table</summary>
            <table className="mt-2 w-full">
              <tbody>
                {data.map((d) => (
                  <tr key={d[x]} className="border-t border-border">
                    <th scope="row" className="py-1.5 text-left font-normal">{d[x]}</th>
                    <td className="py-1.5 text-right tabular-nums">{d[y]}{unit}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
        </>
      )}
    </Panel>
  );
}

export default function FleetAnalytics() {
  const [trips, setTrips] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [inspections, setInspections] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      base44.entities.Trip.list("-created_date", 200),
      base44.entities.Vehicle.list("-created_date", 100),
      base44.entities.Inspection.list("-created_date", 500),
    ])
      .then(([t, v, insp]) => { setTrips(t); setVehicles(v); setInspections(insp); })
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

  // Latest recorded fuel level per vehicle, from pre-trip inspections — sorted
  // lowest-first so vehicles that need fuel soonest surface at the top.
  const fuelByVehicle = vehicles
    .map((v) => {
      const latest = inspections
        .filter((i) => i.vehicle_id === v.id && i.fuel_level != null)
        .sort((a, b) => (b.created_date || "").localeCompare(a.created_date || ""))[0];
      return { name: v.name || "—", fuel: latest ? latest.fuel_level : null };
    })
    .filter((f) => f.fuel != null)
    .sort((a, b) => a.fuel - b.fuel)
    .slice(0, 10);

  return (
    <AppLayout title="Fleet Analytics">
      {loading ? (
        <BusLoader className="py-12" />
      ) : (
        <div>
          <KpiRow className="xl:grid-cols-3">
            <Kpi label="Total trips" value={trips.length} icon={TrendingUp} detail="Latest 200 trips" />
            <Kpi label="Vehicles" value={vehicles.length} icon={Bus} />
            <Kpi label="Peak hour" value={peakHours[0]?.hour || "—"} icon={Clock} detail={peakHours[0] ? `${peakHours[0].trips} trips start then` : "No trips yet"} />
          </KpiRow>
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            <BarPanel title="Trips per vehicle" description="Top 10 vehicles" data={tripsPerVehicle} x="name" y="trips" empty="No trips yet." />
            <BarPanel title="Average passenger load" description="Trips per vehicle as a share of its seats" data={avgLoad} x="name" y="load" unit="%" />
            <BarPanel title="Peak operating hours" description="Trips by scheduled start hour" data={[...peakHours].sort((a, b) => parseInt(a.hour) - parseInt(b.hour))} x="hour" y="trips" empty="No trips yet." />
            <BarPanel title="Fuel level by vehicle" description="Most recent pre-trip inspection reading, lowest first" data={fuelByVehicle} x="name" y="fuel" unit="%" domain={[0, 100]} empty="No fuel readings recorded yet." />
          </div>
        </div>
      )}
    </AppLayout>
  );
}
