import React, { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import AppLayout from "@/components/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Wrench, CheckCircle2, AlertTriangle } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";

export default function MaintenanceQueue() {
  const { toast } = useToast();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    const all = await base44.entities.Inspection.list("-updated_date", 500);
    setItems(all.filter((i) => i.needs_service || i.status === "failed"));
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const resolve = async (id) => {
    await base44.entities.Inspection.update(id, { needs_service: false, service_notes: "Dispatched / resolved" });
    toast({ title: "Marked resolved" });
    load();
  };

  return (
    <AppLayout title="Maintenance queue">
      {loading ? (
        <p className="text-muted-foreground">Loading…</p>
      ) : items.length === 0 ? (
        <Card><CardContent className="py-10 text-center text-muted-foreground">
          <CheckCircle2 className="w-8 h-8 mx-auto mb-2 text-emerald-400" />
          No vehicles need service right now.
        </CardContent></Card>
      ) : (
        <div className="grid gap-3">
          {items.map((i) => (
            <Card key={i.id}>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center justify-between">
                  <span className="flex items-center gap-2"><Wrench className="w-4 h-4 text-amber-400" /> {i.vehicle_name || "Unknown vehicle"}</span>
                  <Badge variant={i.status === "failed" ? "destructive" : "secondary"}>{i.status === "failed" ? "Failed inspection" : "Needs service"}</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <div className="text-muted-foreground">{i.company_name || "—"} · {i.driver_name || "—"}</div>
                {i.service_notes && <div className="flex gap-1.5"><AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" /><span>{i.service_notes}</span></div>}
                <div className="flex justify-end">
                  <Button size="sm" variant="outline" onClick={() => resolve(i.id)}>
                    <CheckCircle2 className="w-4 h-4" /> Mark dispatched
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </AppLayout>
  );
}