import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useToast } from "@/components/ui/use-toast";
import { Button } from "@/components/ui/button";
import { CheckCircle2, CircleDot, OctagonAlert, RotateCcw, Wrench } from "lucide-react";
import { cn } from "@/lib/utils";
import { EmptyState, Kpi, KpiRow, PageIntro, Segmented, StatusChip } from "@/components/admin/kit";

const SEVERITY_BAR = { low: "bg-offline", medium: "bg-warning", high: "bg-danger", critical: "bg-danger" };
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

  const count = (st) => faults.filter((f) => f.status === st).length;
  const serious = faults.filter((f) => f.status !== "resolved" && (f.severity === "high" || f.severity === "critical")).length;
  const when = (iso) => (iso ? new Date(iso).toLocaleDateString([], { day: "numeric", month: "short", year: "numeric" }) : "");

  return (
    <div>
      <PageIntro>Vehicle issues from failed inspections or reported directly by a mechanic.</PageIntro>
      <KpiRow>
        <Kpi label="Open" value={openCount} icon={CircleDot} tone={openCount ? "warning" : undefined} />
        <Kpi label="In progress" value={count("in_progress")} icon={Wrench} tone="info" />
        <Kpi label="High or critical" value={serious} icon={OctagonAlert} tone={serious ? "danger" : undefined} detail="Not yet resolved" />
        <Kpi label="Resolved" value={count("resolved")} icon={CheckCircle2} tone="success" />
      </KpiRow>
      <Segmented className="mb-4" label="Filter faults by status" value={statusFilter} onChange={setStatusFilter} options={[
        { value: "open", label: "Open", count: openCount },
        { value: "in_progress", label: "In progress", count: count("in_progress") },
        { value: "resolved", label: "Resolved", count: count("resolved") },
        { value: "all", label: "All", count: faults.length },
      ]} />
      {sorted.length === 0 ? (
        <EmptyState icon={CheckCircle2} title="Nothing here">No faults with this status.</EmptyState>
      ) : (
        <ul className="space-y-2">
          {sorted.map((f) => (
            <li key={f.id} className="relative overflow-hidden rounded-2xl border border-border bg-card">
              <span className={cn("absolute inset-y-0 left-0 w-1", SEVERITY_BAR[f.severity] || "bg-offline")} aria-hidden="true" />
              <div className="flex flex-wrap items-start gap-x-4 gap-y-3 py-4 pl-5 pr-4">
                <div className="min-w-0 flex-1 basis-72">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-title-sm font-bold">{f.title}</h2>
                    <StatusChip status={f.severity}>{f.severity ? `${f.severity.charAt(0).toUpperCase()}${f.severity.slice(1)} severity` : "No severity"}</StatusChip>
                    <StatusChip status={f.status}>{STATUS_LABEL[f.status] || f.status}</StatusChip>
                  </div>
                  <p className="mt-1 text-body-sm text-muted-foreground">
                    {[f.vehicle_name, f.company_name, f.source === "inspection" && "From inspection", when(f.created_date)].filter(Boolean).join(" · ")}
                  </p>
                  {f.description && <p className="mt-2 text-body-sm">{f.description}</p>}
                  {f.reported_by && <p className="mt-1 text-caption text-muted-foreground">Reported by {f.reported_by}</p>}
                </div>
                <div className="flex flex-wrap gap-2">
                  {f.status !== "in_progress" && f.status !== "resolved" && (
                    <Button variant="outline" size="sm" disabled={busy === f.id} onClick={() => setStatus(f, "in_progress")}>
                      <Wrench className="h-4 w-4" /> Start work
                    </Button>
                  )}
                  {f.status !== "resolved" && (
                    <Button variant="outline" size="sm" disabled={busy === f.id} onClick={() => setStatus(f, "resolved")}>
                      <CheckCircle2 className="h-4 w-4" /> Mark resolved
                    </Button>
                  )}
                  {f.status === "resolved" && (
                    <Button variant="ghost" size="sm" disabled={busy === f.id} onClick={() => setStatus(f, "open")}>
                      <RotateCcw className="h-4 w-4" /> Reopen
                    </Button>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
