import React, { useEffect, useMemo, useState } from "react";
import { base44 } from "@/api/base44Client";
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
  fault: { icon: AlertTriangle, iconClass: "text-danger", bgClass: "bg-danger/12" },
  sos: { icon: Siren, iconClass: "text-danger", bgClass: "bg-danger/12" },
  incident: { icon: Wrench, iconClass: "text-warning", bgClass: "bg-warning/12" },
  trip_completed: { icon: CheckCircle2, iconClass: "text-success", bgClass: "bg-success/12" },
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
    <section className="flex min-w-0 flex-col rounded-2xl border border-border bg-card" aria-label="Recent activity">
      <h2 className="px-5 pb-2 pt-4 text-title-sm font-bold">Recent activity</h2>
      <div className="max-h-[392px] space-y-1 overflow-y-auto px-2 pb-3">
        {loading && <BusLoader className="py-8" />}
        {!loading && events.length === 0 && (
          <p className="py-6 text-center text-body-sm text-muted-foreground">Nothing to show yet.</p>
        )}
        {events.map((e) => {
          const meta = EVENT_META[e.type] || EVENT_META.fault;
          const Icon = meta.icon;
          return (
            <button
              key={e.key}
              type="button"
              onClick={() => onNavigate(e.nav)}
              className="flex min-h-[52px] w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors hover:bg-accent/60"
            >
              <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg ${meta.bgClass}`} aria-hidden="true">
                <Icon className={`h-4 w-4 ${meta.iconClass}`} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-semibold first-letter:uppercase">{e.title}</span>
                {e.subtitle && <span className="block truncate text-body-sm text-muted-foreground">{e.subtitle}</span>}
              </span>
              <span className="shrink-0 text-body-sm tabular-nums text-muted-foreground">{timeAgo(e.time)}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
