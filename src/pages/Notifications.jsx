import React, { useEffect, useState } from "react";
import { BellRing, Bus, Car, Info } from "lucide-react";
import { base44 } from "@/api/base44Client";
import AppLayout from "@/components/AppLayout";
import PullToRefresh from "@/components/PullToRefresh";

const dayLabel = (iso) => {
  if (!iso) return "Earlier";
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date(Date.now() - 86_400_000);
  if (d.toDateString() === today.toDateString()) return "Today";
  if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
  return d.toLocaleDateString([], { weekday: "long", day: "numeric", month: "long" });
};
const time = (iso) => (iso ? new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : "");

const KIND = {
  bus_arrived: { icon: Bus, title: "Bus arrived" },
  taxi_arrived: { icon: Car, title: "Taxi arrived" },
  info: { icon: Info, title: "Update" },
};

export default function Notifications() {
  const [alerts, setAlerts] = useState([]);

  const loadAlerts = () =>
    base44.entities.Broadcast.list("-created_date", 30)
      .then(setAlerts)
      .catch(() => {});

  useEffect(() => {
    loadAlerts();
    const unsub = base44.entities.Broadcast.subscribe((event) => {
      if (event.type === "delete") {
        setAlerts((prev) => prev.filter((a) => a.id !== event.id));
        return;
      }
      if (event.data) setAlerts((prev) => [event.data, ...prev].slice(0, 30));
    });
    return unsub;
  }, []);

  const groups = [];
  alerts.forEach((a) => {
    const label = dayLabel(a.created_date);
    const g = groups[groups.length - 1];
    if (g && g.label === label) g.items.push(a);
    else groups.push({ label, items: [a] });
  });

  return (
    <AppLayout variant="passenger" title="Messages">
      <PullToRefresh onRefresh={loadAlerts} className="max-w-2xl">
        <p className="px-6 pb-4 text-body text-muted-foreground md:px-0">Announcements and arrivals from your bus company.</p>
        {alerts.length === 0 && (
          <div className="flex flex-col items-center px-6 py-16 text-center">
            <BellRing className="h-10 w-10 text-muted-foreground" aria-hidden="true" />
            <p className="mt-4 text-title-sm font-semibold">Nothing yet</p>
            <p className="mt-1 max-w-xs text-body-sm text-muted-foreground">When your company posts an update or a bus arrives at your stop, it shows up here.</p>
          </div>
        )}
        {groups.map((g) => (
          <section key={g.label} className="pb-6" aria-label={g.label}>
            <h2 className="px-6 pb-1 text-body-sm font-semibold text-muted-foreground md:px-0">{g.label}</h2>
            <ul className="divide-y divide-border border-y border-border">
              {g.items.map((a) => {
                const k = KIND[a.type] || KIND.info;
                const Icon = k.icon;
                return (
                  <li key={a.id} className="flex items-start gap-4 px-6 py-4 md:px-0">
                    <Icon className="mt-0.5 h-[22px] w-[22px] shrink-0 text-muted-foreground" aria-hidden="true" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-3">
                        <p className="font-semibold">{a.title || k.title}</p>
                        <span className="shrink-0 text-body-sm text-muted-foreground">{time(a.created_date)}</span>
                      </div>
                      <p className="mt-0.5 text-body">{a.message}</p>
                      {(a.vehicle_name || a.driver_name || a.company_name) && (
                        <p className="mt-1 text-body-sm text-muted-foreground">{[a.company_name, a.vehicle_name, a.driver_name].filter(Boolean).join(" · ")}</p>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </PullToRefresh>
    </AppLayout>
  );
}
