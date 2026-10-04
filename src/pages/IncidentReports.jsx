import React, { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import AppLayout from "@/components/AppLayout";
import PullToRefresh from "@/components/PullToRefresh";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusChip } from "@/components/admin/kit";
import { Button } from "@/components/ui/button";
import { AlertOctagon } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import { loadFailed } from "@/lib/loadFailed";
import BusLoader from "@/components/BusLoader";

const STATUSES = ["open", "investigating", "resolved"];
const next = (s) => STATUSES[(STATUSES.indexOf(s) + 1) % STATUSES.length];

export default function IncidentReports() {
  const { toast } = useToast();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    try {
      const all = await base44.entities.Incident.list("-occurred_at", 500);
      setItems(all);
    } catch {
      loadFailed(load);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, []);

  const cycle = async (i) => {
    const ns = next(i.status || "open");
    try {
      await base44.entities.Incident.update(i.id, { status: ns });
      toast({ title: `Status → ${ns}` });
      load();
    } catch (e) {
      toast({ title: "Couldn't update status", description: e.message, variant: "destructive" });
    }
  };


  return (
    <AppLayout title="Incident reports">
      <PullToRefresh onRefresh={load}>
      {loading ? <BusLoader className="py-8" /> : items.length === 0 ? (
        <Card><CardContent className="py-10 text-center text-muted-foreground">No incidents logged.</CardContent></Card>
      ) : (
        <div className="grid gap-3">
          {items.map((i) => (
            <Card key={i.id}>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center justify-between">
                  <span className="flex items-center gap-2"><AlertOctagon className="w-4 h-4 text-danger" /> {i.vehicle_name || "Vehicle"} · {i.type}</span>
                  <StatusChip status={i.status || "open"} />
                </CardTitle>
              </CardHeader>
              <CardContent className="text-sm space-y-2">
                <div className="text-muted-foreground">{i.company_name || "—"} · {i.driver_name || "—"} · {i.occurred_at ? new Date(i.occurred_at).toLocaleString() : "—"}</div>
                {i.details && <div>{i.details}</div>}
                <div className="flex justify-end">
                  <Button size="sm" variant="outline" onClick={() => cycle(i)}>Advance status →</Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
      </PullToRefresh>
    </AppLayout>
  );
}