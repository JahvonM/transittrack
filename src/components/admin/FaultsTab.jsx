import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useToast } from "@/components/ui/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, CheckCircle2, Wrench } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const SEVERITY_VARIANT = { low: "secondary", medium: "outline", high: "destructive", critical: "destructive" };
const STATUS_LABEL = { open: "Open", in_progress: "In progress", resolved: "Resolved" };

// Faults are the mechanic-facing upgrade to the old needs_service flag —
// severity, a real status workflow, and a link back to the inspection that
// raised them (see driverSession's submit_inspection, which auto-creates one
// on a failed pre-trip check unless the company turned that off).
export default function FaultsTab({ faults = [], onChange }) {
  const { toast } = useToast();
  const [statusFilter, setStatusFilter] = useState("open");
  const [busy, setBusy] = useState(null);

  const filtered = statusFilter === "all" ? faults : faults.filter((f) => f.status === statusFilter);
  const sorted = [...filtered].sort((a, b) => (b.created_date || "").localeCompare(a.created_date || ""));
  const openCount = faults.filter((f) => f.status === "open").length;

  const setStatus = async (fault, status) => {
    setBusy(fault.id);
    try {
      const payload = { status };
      if (status === "resolved") payload.resolved_date = new Date().toISOString().slice(0, 10);
      await base44.entities.Fault.update(fault.id, payload);
      onChange();
    } catch (e) {
      toast({ title: "Couldn't update fault", description: e.message, variant: "destructive" });
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <AlertTriangle className="w-5 h-5 text-amber-400" />
        <h2 className="text-lg font-semibold">Faults</h2>
        <Badge variant="destructive">{openCount} open</Badge>
        <div className="ml-auto">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="open">Open</SelectItem>
              <SelectItem value="in_progress">In progress</SelectItem>
              <SelectItem value="resolved">Resolved</SelectItem>
              <SelectItem value="all">All</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <p className="text-sm text-muted-foreground">
        Vehicle issues from failed inspections or reported directly by a mechanic.
      </p>
      {sorted.length === 0 && (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            <CheckCircle2 className="w-8 h-8 text-green-400 mx-auto mb-2" />
            Nothing here.
          </CardContent>
        </Card>
      )}
      {sorted.map((f) => (
        <Card key={f.id}>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between gap-2">
              <CardTitle className="text-base">{f.title}</CardTitle>
              <div className="flex items-center gap-1.5">
                <Badge variant={SEVERITY_VARIANT[f.severity] || "outline"} className="capitalize">{f.severity}</Badge>
                <Badge variant={f.status === "resolved" ? "secondary" : f.status === "in_progress" ? "default" : "destructive"}>
                  {STATUS_LABEL[f.status] || f.status}
                </Badge>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="text-sm text-muted-foreground">
              {f.vehicle_name} · {f.company_name} {f.source === "inspection" && "· from inspection"}
            </div>
            {f.description && <div className="text-sm">{f.description}</div>}
            {f.reported_by && <div className="text-xs text-muted-foreground">Reported by {f.reported_by}</div>}
            <div className="flex gap-2 pt-1">
              {f.status !== "in_progress" && f.status !== "resolved" && (
                <Button variant="outline" size="sm" disabled={busy === f.id} onClick={() => setStatus(f, "in_progress")}>
                  <Wrench className="w-3.5 h-3.5 mr-1.5" /> Start work
                </Button>
              )}
              {f.status !== "resolved" && (
                <Button variant="outline" size="sm" disabled={busy === f.id} onClick={() => setStatus(f, "resolved")}>
                  <CheckCircle2 className="w-3.5 h-3.5 mr-1.5" /> Mark resolved
                </Button>
              )}
              {f.status === "resolved" && (
                <Button variant="ghost" size="sm" disabled={busy === f.id} onClick={() => setStatus(f, "open")}>
                  Reopen
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
