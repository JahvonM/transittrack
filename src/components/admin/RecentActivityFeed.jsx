import React, { useEffect, useMemo, useState } from "react";
import { base44 } from "@/api/base44Client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertTriangle, Siren, CheckCircle2, Wrench } from "lucide-react";
import BusLoader from "@/components/BusLoader";

function timeAgo(iso) {
  if (!iso) return "";
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

const EVENT_META = {
  fault: { icon: AlertTriangle, iconClass: "text-destructive", bgClass: "bg-destructive/10" },
  sos: { icon: Siren, iconClass: "text-destructive", bgClass: "bg-destructive/10" },
  incident: { icon: Wrench, iconClass: "text-amber-600", bgClass: "bg-amber-500/10" },
  trip_completed: { icon: CheckCircle2, iconClass: "text-emerald-600", bgClass: "bg-emerald-500/10" },
};

// Live-updating cross-entity timeline for the admin overview — faults,
// incidents (SOS/breakdown/accident/delay), and completed trips, merged and
// sorted by recency. Self-contained (own fetch + subscriptions) so it can
// drop into Admin.jsx without adding to its already-large load().
export default function RecentActivityFeed({ onNavigate }) {
  const [faults, setFaults] = useState([]);
  const [incidents, setIncidents] = useState([]);
  const [trips, setTrips] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = () => {
    Promise.all([
      base44.entities.Fault.list("-created_date", 20),
      base44.entities.Incident.list("-occurred_at", 20),
      base44.entities.Trip.filter({ status: "completed" }, "-completed_at", 20),
    ])
      .then(([f, i, t]) => {
        setFaults(f);
        setIncidents(i);
        setTrips(t);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  };

  useEffect(() => {
    load();
    const unsubs = [
      base44.entities.Fault.subscribe(load),
      base44.entities.Incident.subscribe(load),
      base44.entities.Trip.subscribe(load),
    ];
    return () => unsubs.forEach((u) => u && u());
  }, []);

  const events = useMemo(() => {
    const items = [
      ...faults.map((f) => ({
        key: `fault-${f.id}`,
        type: "fault",
        time: f.created_date,
        title: f.title || "Fault reported",
        subtitle: [f.vehicle_name, f.severity].filter(Boolean).join(" · "),
        nav: "faults",
      })),
      ...incidents.map((i) => ({
        key: `incident-${i.id}`,
        type: i.type === "emergency" ? "sos" : "incident",
        time: i.occurred_at,
        title: i.type === "emergency" ? "SOS triggered" : `${i.type} reported`,
        subtitle: [i.vehicle_name, i.driver_name].filter(Boolean).join(" · "),
        nav: "fleet",
      })),
      ...trips.map((t) => ({
        key: `trip-${t.id}`,
        type: "trip_completed",
        time: t.completed_at,
        title: "Trip completed",
        subtitle: [t.vehicle_name, t.dropoff_name].filter(Boolean).join(" · "),
        nav: "billing",
      })),
    ];
    return items
      .filter((e) => e.time)
      .sort((a, b) => new Date(b.time) - new Date(a.time))
      .slice(0, 12);
  }, [faults, incidents, trips]);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Recent activity</CardTitle>
      </CardHeader>
      <CardContent className="space-y-1 max-h-[360px] overflow-y-auto">
        {loading && <BusLoader className="py-8" />}
        {!loading && events.length === 0 && (
          <p className="text-sm text-muted-foreground py-6 text-center">Nothing to show yet.</p>
        )}
        {events.map((e) => {
          const meta = EVENT_META[e.type] || EVENT_META.fault;
          const Icon = meta.icon;
          return (
            <button
              key={e.key}
              onClick={() => onNavigate(e.nav)}
              className="w-full flex items-center gap-3 p-2.5 rounded-lg hover:bg-accent transition-colors text-left animate-in fade-in slide-in-from-top-1 duration-300"
            >
              <div className={`w-8 h-8 rounded-lg grid place-items-center shrink-0 ${meta.bgClass}`}>
                <Icon className={`w-4 h-4 ${meta.iconClass}`} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{e.title}</p>
                {e.subtitle && <p className="text-xs text-muted-foreground truncate">{e.subtitle}</p>}
              </div>
              <span className="text-xs text-muted-foreground shrink-0">{timeAgo(e.time)}</span>
            </button>
          );
        })}
      </CardContent>
    </Card>
  );
}
