import React, { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import AppLayout from "@/components/AppLayout";
import { Card, CardContent } from "@/components/ui/card";
import { BellRing, Bus, Car, Info } from "lucide-react";

export default function Notifications() {
  const [alerts, setAlerts] = useState([]);

  useEffect(() => {
    base44.entities.Broadcast.list("-created_date", 30)
      .then(setAlerts)
      .catch(() => {});
    const unsub = base44.entities.Broadcast.subscribe((event) => {
      if (event.type === "delete") {
        setAlerts((prev) => prev.filter((a) => a.id !== event.id));
        return;
      }
      if (event.data) setAlerts((prev) => [event.data, ...prev].slice(0, 30));
    });
    return unsub;
  }, []);

  return (
    <AppLayout title="Notifications">
      <div className="max-w-2xl space-y-2">
        {alerts.length === 0 && <p className="text-muted-foreground py-12 text-center">No notifications yet.</p>}
        {alerts.map((a) => (
          <Card key={a.id}>
            <CardContent className="p-4 flex items-start gap-3">
              <div className="w-10 h-10 rounded-lg grid place-items-center shrink-0 bg-primary/10 text-primary">
                {a.type === "taxi_arrived" ? <Car className="w-5 h-5" /> : a.type === "bus_arrived" ? <Bus className="w-5 h-5" /> : <Info className="w-5 h-5" />}
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-medium text-sm">
                  {a.title || (a.type === "bus_arrived" ? "Bus arrived" : a.type === "taxi_arrived" ? "Taxi arrived" : "Update")}
                </div>
                <div className="text-sm text-muted-foreground">{a.message}</div>
                <div className="text-xs text-muted-foreground mt-1">
                  {a.vehicle_name ? `${a.vehicle_name} · ` : ""}
                  {a.driver_name || ""}
                  {a.created_date && ` · ${new Date(a.created_date).toLocaleString()}`}
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </AppLayout>
  );
}