import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useToast } from "@/components/ui/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Wrench, CheckCircle2, AlertTriangle } from "lucide-react";

export default function ServiceQueueTab({ inspections = [], onChange }) {
  const [resolving, setResolving] = useState(null);
  const { toast } = useToast();

  const pending = inspections
    .filter((i) => i.needs_service)
    .sort((a, b) => (b.created_date || "").localeCompare(a.created_date || ""));

  const resolve = async (id) => {
    setResolving(id);
    try {
      await base44.entities.Inspection.update(id, { needs_service: false });
      toast({ title: "Marked resolved" });
      onChange();
    } catch (e) {
      toast({ title: "Couldn't resolve", description: e.message, variant: "destructive" });
    }
    setResolving(null);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Wrench className="w-5 h-5 text-amber-400" />
        <h2 className="text-lg font-semibold">Service Queue</h2>
        <Badge variant="destructive">{pending.length} pending</Badge>
      </div>
      <p className="text-sm text-muted-foreground">
        Vehicles with failed inspection items that need a mechanic's attention.
      </p>
      {pending.length === 0 && (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            <CheckCircle2 className="w-8 h-8 text-green-400 mx-auto mb-2" />
            All vehicles passed inspection. Nothing in the service queue.
          </CardContent>
        </Card>
      )}
      {pending.map((i) => (
        <Card key={i.id}>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between gap-2">
              <CardTitle className="text-base">{i.vehicle_name}</CardTitle>
              <Badge variant="destructive">Failed</Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="text-sm text-muted-foreground">
              {i.company_name} · Driver: {i.driver_name} · {new Date(i.date).toLocaleDateString()}
            </div>
            {i.service_notes && (
              <div className="flex items-start gap-2 text-sm p-2 rounded-lg bg-amber-500/10">
                <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                <span>{i.service_notes}</span>
              </div>
            )}
            <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
              {i.odometer_reading != null && <span>Odometer: {i.odometer_reading} km</span>}
              {i.fuel_level != null && <span>Fuel: {i.fuel_level}%</span>}
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => resolve(i.id)}
              disabled={resolving === i.id}
            >
              <CheckCircle2 className="w-4 h-4 mr-1.5" />
              {resolving === i.id ? "Resolving…" : "Mark resolved"}
            </Button>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}