import React, { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { useToast } from "@/components/ui/use-toast";
import { BellRing, Bus, Car } from "lucide-react";

export default function StaffAlerts() {
  const { toast } = useToast();
  const [alerts, setAlerts] = useState([]);

  useEffect(() => {
    base44.entities.Broadcast.list("-created_date", 10)
      .then(setAlerts)
      .catch(() => {});
    const unsub = base44.entities.Broadcast.subscribe((event) => {
      if (event.type === "delete") {
        setAlerts((prev) => prev.filter((a) => a.id !== event.id));
        return;
      }
      const rec = event.data;
      if (!rec) return;
      setAlerts((prev) => [rec, ...prev].slice(0, 10));
      if (rec.type === "bus_arrived" || rec.type === "taxi_arrived") {
        toast({
          title: rec.type === "taxi_arrived" ? "Taxi arrived" : "Bus arrived",
          description: `${rec.vehicle_name || "Vehicle"} · ${rec.message}`,
        });
      } else if (rec.type === "info") {
        toast({
          title: rec.title || "Broadcast",
          description: rec.message,
        });
      }
    });
    return unsub;
  }, []);

  if (alerts.length === 0) return null;

  return (
    <div>
      <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-1.5">
        <BellRing className="w-4 h-4" /> Staff alerts
      </h3>
      <div className="space-y-2">
        {alerts.map((a) => (
          <div key={a.id} className="flex items-center gap-3 p-3 rounded-xl border bg-card">
            <div className="w-9 h-9 rounded-lg bg-emerald-500/15 text-emerald-400 grid place-items-center shrink-0">
              {a.type === "taxi_arrived" ? <Car className="w-4 h-4" /> : <Bus className="w-4 h-4" />}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium truncate">{a.message}</div>
              <div className="text-xs text-muted-foreground truncate">
                {a.vehicle_name} · {a.driver_name || "Driver"} ·{" "}
                {a.created_date
                  ? new Date(a.created_date).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
                  : ""}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}