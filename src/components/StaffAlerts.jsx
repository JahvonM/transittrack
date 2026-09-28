import React, { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { useToast } from "@/components/ui/use-toast";
import { BellRing, Bus, Car, Info } from "lucide-react";

const SHOWN_TYPES = new Set(["bus_arrived", "taxi_arrived", "info"]);

// Recent arrivals and announcements for ONE company. Announcements with no
// company (sent to everyone by an admin) are included too.
export default function StaffAlerts({ companyId, limit = 3 }) {
  const { toast } = useToast();
  const [alerts, setAlerts] = useState([]);

  useEffect(() => {
    if (!companyId) return undefined;
    const relevant = (b) => b && SHOWN_TYPES.has(b.type) && !b.is_reply && (!b.company_id || b.company_id === companyId);
    base44.entities.Broadcast.list("-created_date", 30)
      .then((rows) => setAlerts(rows.filter(relevant)))
      .catch(() => {});
    const unsub = base44.entities.Broadcast.subscribe((event) => {
      if (event.type === "delete") {
        setAlerts((prev) => prev.filter((a) => a.id !== event.id));
        return;
      }
      const rec = event.data;
      if (!relevant(rec) || event.type !== "create") return;
      setAlerts((prev) => [rec, ...prev.filter((a) => a.id !== rec.id)].slice(0, 20));
      if (rec.type === "bus_arrived" || rec.type === "taxi_arrived") {
        toast({ title: rec.type === "taxi_arrived" ? "Taxi arrived" : "Bus arrived", description: rec.message });
      } else {
        toast({ title: rec.title || "Announcement", description: rec.message });
      }
    });
    return unsub;
  }, [companyId]);

  // Alerts older than an hour are no longer news.
  const oneHourAgo = Date.now() - 60 * 60 * 1000;
  const recent = alerts.filter((a) => new Date(a.created_date).getTime() > oneHourAgo).slice(0, limit);
  if (recent.length === 0) return null;

  return (
    <section aria-label="Latest alerts">
      <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-1.5">
        <BellRing className="w-3.5 h-3.5" /> Latest
      </h3>
      <div className="space-y-2">
        {recent.map((a) => {
          const Icon = a.type === "taxi_arrived" ? Car : a.type === "info" ? Info : Bus;
          return (
            <div key={a.id} className="flex items-center gap-3 p-3 rounded-xl border bg-card">
              <div className="w-9 h-9 rounded-lg bg-primary/15 text-primary grid place-items-center shrink-0">
                <Icon className="w-4 h-4" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate">{a.type === "info" && a.title ? `${a.title}: ${a.message}` : a.message}</div>
                <div className="text-xs text-muted-foreground truncate">
                  {[a.vehicle_name, a.created_date && new Date(a.created_date).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })].filter(Boolean).join(" · ")}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
