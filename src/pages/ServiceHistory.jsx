import React, { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import AppLayout from "@/components/AppLayout";
import PullToRefresh from "@/components/PullToRefresh";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusChip, humanize } from "@/components/admin/kit";
import { History } from "lucide-react";
import { loadFailed } from "@/lib/loadFailed";
import BusLoader from "@/components/BusLoader";

export default function ServiceHistory() {
  const [vehicles, setVehicles] = useState([]);
  const [inspections, setInspections] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = () =>
    Promise.all([base44.entities.Vehicle.list(), base44.entities.Inspection.list("-date", 200)]).then(([v, i]) => {
      setVehicles(v); setInspections(i); setLoading(false);
    }).catch(() => { setLoading(false); loadFailed(); });

  useEffect(() => {
    load();
  }, []);

  return (
    <AppLayout title="Service history">
      <PullToRefresh onRefresh={load}>
      {loading ? <BusLoader className="py-8" /> : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {vehicles.map((v) => {
            const hist = inspections.filter((i) => i.vehicle_id === v.id);
            return (
              <Card key={v.id}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex items-center gap-2"><History className="w-4 h-4 text-primary" /> {v.name} · {v.plate_number}</CardTitle>
                </CardHeader>
                <CardContent className="text-sm space-y-2">
                  {hist.length === 0 ? <p className="text-muted-foreground">No service records.</p> :
                    hist.map((i) => {
                      const badgeLabel = i.needs_service ? "Needs service" : i.status;
                      const badgeTone = i.needs_service ? "danger" : i.status === "passed" ? "success" : "danger";
                      return (
                        <div key={i.id} className="flex items-center justify-between border-b border-border/50 pb-1.5 last:border-0">
                          <div>
                            <div>{i.date ? new Date(i.date).toLocaleDateString() : "—"}</div>
                            {i.odometer_reading != null && <div className="text-xs text-muted-foreground">{i.odometer_reading} km · fuel {i.fuel_level ?? "—"}%</div>}
                            {i.service_notes && <div className="text-xs text-warning">{i.service_notes}</div>}
                          </div>
                          <StatusChip tone={badgeTone}>{humanize(badgeLabel)}</StatusChip>
                        </div>
                      );
                    })}
                </CardContent>
              </Card>
            );
          })}
          {vehicles.length === 0 && <p className="text-muted-foreground">No vehicles.</p>}
        </div>
      )}
      </PullToRefresh>
    </AppLayout>
  );
}