import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArrowLeftRight, ArrowDownToLine, ArrowUpFromLine, RefreshCw, CheckCircle2, AlertTriangle } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";

export default function FleetSyncTab() {
  const { toast } = useToast();
  const [syncing, setSyncing] = useState(false);
  const [result, setResult] = useState(null);
  const [vehicleEntity, setVehicleEntity] = useState("Buses");
  const [inspectionEntity, setInspectionEntity] = useState("Inspections");

  const runSync = async (direction) => {
    setSyncing(true);
    try {
      const res = await base44.functions.invoke("syncFleet", { direction, vehicleEntity, inspectionEntity });
      setResult(res.data);
      toast({ title: "Sync complete", description: "Fleet data synchronized with the maintenance app." });
    } catch (e) {
      toast({ title: "Sync failed", description: e.message, variant: "destructive" });
    }
    setSyncing(false);
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <ArrowLeftRight className="w-4 h-4 text-primary" /> Fleet maintenance sync
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Two-way sync of Vehicles and Inspections between TransitTrack and the fleet
            maintenance pilot app. Records are matched by plate number and vehicle + date;
            the newest version wins.
          </p>
          <div className="grid sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Maintenance vehicle table</Label>
              <Input value={vehicleEntity} onChange={(e) => setVehicleEntity(e.target.value)} placeholder="e.g. Buses" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Maintenance inspection table</Label>
              <Input value={inspectionEntity} onChange={(e) => setInspectionEntity(e.target.value)} placeholder="e.g. Inspections" />
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => runSync("both")} disabled={syncing}>
              <ArrowLeftRight className="w-4 h-4" /> {syncing ? "Syncing…" : "Sync both ways"}
            </Button>
            <Button variant="outline" onClick={() => runSync("pull")} disabled={syncing}>
              <ArrowDownToLine className="w-4 h-4" /> Pull from maintenance
            </Button>
            <Button variant="outline" onClick={() => runSync("push")} disabled={syncing}>
              <ArrowUpFromLine className="w-4 h-4" /> Push to maintenance
            </Button>
          </div>
          {syncing && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <RefreshCw className="w-4 h-4 animate-spin" /> Contacting the maintenance app…
            </div>
          )}
        </CardContent>
      </Card>

      {result && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              {result.errors?.length ? (
                <AlertTriangle className="w-4 h-4 text-amber-400" />
              ) : (
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              )}
              Last sync result
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid sm:grid-cols-2 gap-3">
              <div className="p-3 rounded-lg border bg-card">
                <Badge variant="secondary" className="mb-2">Pulled in</Badge>
                <div className="text-sm">
                  {result.summary?.pulled?.vehicles || 0} vehicles · {result.summary?.pulled?.inspections || 0} inspections
                </div>
              </div>
              <div className="p-3 rounded-lg border bg-card">
                <Badge variant="secondary" className="mb-2">Pushed out</Badge>
                <div className="text-sm">
                  {result.summary?.pushed?.vehicles || 0} vehicles · {result.summary?.pushed?.inspections || 0} inspections
                </div>
              </div>
            </div>
            {result.errors?.length > 0 && (
              <div className="text-xs text-amber-300 space-y-1">
                {result.errors.map((e, i) => (
                  <div key={i}>• {e}</div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}