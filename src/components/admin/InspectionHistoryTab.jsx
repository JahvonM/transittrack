import React, { useMemo, useState } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { ClipboardCheck, ChevronDown, Download, ListChecks, OctagonAlert, TriangleAlert } from "lucide-react";
import { cn } from "@/lib/utils";
import { EmptyState, Kpi, KpiRow, StatusChip } from "@/components/admin/kit";
import { exportToPDF } from "@/lib/exporters";

const CONDITION = { GOOD: ["success", "Good"], WARNING: ["warning", "Warning"], FAILED: ["danger", "Failed"] };
const Condition = ({ c }) => {
  const [tone, label] = CONDITION[c] || ["neutral", c || "Not checked"];
  return <StatusChip tone={tone}>{label}</StatusChip>;
};

// Browsable log of past inspection runs — port of FleetPilot's
// Inspections.jsx + InspectionDetail.jsx merged into one admin tab (no PDF
// export). Groups InspectionResult rows back into the session that created
// them (same vehicle + template + inspection_date), since results are
// stored as one flat row per item rather than a session record.
export default function InspectionHistoryTab({ results = [], vehicles = [] }) {
  const [vehicleFilter, setVehicleFilter] = useState("__all__");
  const [expandedKey, setExpandedKey] = useState(null);

  const sessions = useMemo(() => {
    const map = new Map();
    for (const r of results) {
      if (vehicleFilter !== "__all__" && r.vehicle_id !== vehicleFilter) continue;
      const dateKey = (r.inspection_date || r.created_date || "").slice(0, 16);
      const key = `${r.vehicle_id}|${r.inspection_name}|${dateKey}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(r);
    }
    return [...map.entries()]
      .map(([key, items]) => ({ key, items, first: items[0] }))
      .sort((a, b) => new Date(b.first.inspection_date || b.first.created_date) - new Date(a.first.inspection_date || a.first.created_date));
  }, [results, vehicleFilter]);

  const sectionsFor = (items) => {
    const map = new Map();
    for (const r of items) {
      if (!map.has(r.section_name)) map.set(r.section_name, []);
      map.get(r.section_name).push(r);
    }
    return [...map.entries()];
  };

  const exportSessionPDF = (first, items) => {
    const dateStr = first.inspection_date ? new Date(first.inspection_date).toISOString().slice(0, 10) : "unknown-date";
    const rows = items.map((r) => ({
      section_name: r.section_name,
      inspection_item: r.inspection_item,
      condition: r.condition,
      notes: r.notes || r.fault_description || "",
      repair_required: r.repair_required,
    }));
    const cols = [
      { key: "section_name", label: "Section" },
      { key: "inspection_item", label: "Item" },
      { key: "condition", label: "Condition" },
      { key: "notes", label: "Notes" },
      { key: "repair_required", label: "Repair required" },
    ];
    exportToPDF(
      `${first.vehicle_name}-${first.inspection_name}-${dateStr}`,
      `${first.vehicle_name} — ${first.inspection_name} Inspection (${dateStr})`,
      cols,
      rows
    );
  };

  const withFail = sessions.filter((x) => x.items.some((i) => i.condition === "FAILED")).length;
  const withWarn = sessions.filter((x) => !x.items.some((i) => i.condition === "FAILED") && x.items.some((i) => i.condition === "WARNING")).length;

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Select value={vehicleFilter} onValueChange={setVehicleFilter}>
          <SelectTrigger className="h-10 w-56 bg-card" aria-label="Filter by vehicle"><SelectValue placeholder="All vehicles" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">All vehicles</SelectItem>
            {vehicles.map((v) => <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <KpiRow className="xl:grid-cols-3">
        <Kpi label="Inspections" value={sessions.length} icon={ListChecks} />
        <Kpi label="With failed items" value={withFail} icon={OctagonAlert} tone={withFail ? "danger" : undefined} />
        <Kpi label="With warnings only" value={withWarn} icon={TriangleAlert} tone={withWarn ? "warning" : undefined} />
      </KpiRow>

      {sessions.length === 0 ? (
        <EmptyState icon={ClipboardCheck} title="No inspections recorded yet">Inspections drivers and mechanics complete will show up here.</EmptyState>
      ) : (
        <ul className="space-y-2">
          {sessions.map(({ key, items, first }) => {
            const failed = items.filter((i) => i.condition === "FAILED").length;
            const warning = items.filter((i) => i.condition === "WARNING").length;
            const expanded = expandedKey === key;
            const panelId = `insp-${key.replace(/[^a-zA-Z0-9]/g, "")}`;
            return (
              <li key={key} className="overflow-hidden rounded-2xl border border-border bg-card">
                <div className="flex items-center gap-2 pr-2">
                  <button
                    type="button"
                    onClick={() => setExpandedKey(expanded ? null : key)}
                    aria-expanded={expanded}
                    aria-controls={panelId}
                    className="flex min-h-[64px] min-w-0 flex-1 items-center gap-3 px-4 py-3 text-left hover:bg-accent/40"
                  >
                    <span className={cn("grid h-10 w-10 shrink-0 place-items-center rounded-lg", failed ? "bg-danger/12 text-danger" : warning ? "bg-warning/14 text-warning" : "bg-success/12 text-success")} aria-hidden="true">
                      <ClipboardCheck className="h-5 w-5" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold">{first.vehicle_name} · {first.inspection_name}</span>
                      <span className="block truncate text-body-sm text-muted-foreground">
                        {first.inspection_date ? new Date(first.inspection_date).toLocaleString([], { dateStyle: "medium", timeStyle: "short" }) : ""} · {items.length} items · {first.inspector_name || "Unknown inspector"}
                      </span>
                    </span>
                    <span className="hidden shrink-0 items-center gap-1.5 sm:flex">
                      {failed > 0 && <StatusChip tone="danger">{failed} failed</StatusChip>}
                      {warning > 0 && <StatusChip tone="warning">{warning} warning</StatusChip>}
                      {failed === 0 && warning === 0 && <StatusChip tone="success">All good</StatusChip>}
                    </span>
                    <ChevronDown className={cn("h-5 w-5 shrink-0 text-muted-foreground transition-transform", expanded && "rotate-180")} aria-hidden="true" />
                  </button>
                  <Button variant="ghost" size="icon" onClick={() => exportSessionPDF(first, items)} aria-label={`Export ${first.vehicle_name} ${first.inspection_name} as PDF`} title="Export PDF">
                    <Download className="h-4 w-4" />
                  </Button>
                </div>
                {expanded && (
                  <div id={panelId} className="space-y-4 border-t border-border px-4 py-4">
                    {sectionsFor(items).map(([sectionName, sectionItems]) => (
                      <div key={sectionName}>
                        <h3 className="mb-2 text-caption font-semibold uppercase tracking-wide text-muted-foreground">{sectionName}</h3>
                        <ul className="divide-y divide-border rounded-xl border border-border">
                          {sectionItems.map((r) => (
                            <li key={r.id} className="px-3 py-2.5 text-body-sm">
                              <div className="flex items-center justify-between gap-2">
                                <span className="font-semibold">{r.inspection_item}</span>
                                <Condition c={r.condition} />
                              </div>
                              {(r.fault_description || r.notes) && <p className="mt-1 text-muted-foreground">{r.fault_description || r.notes}</p>}
                              {r.photo_url && (
                                <a href={r.photo_url} target="_blank" rel="noopener noreferrer" className="mt-1 inline-block font-semibold underline underline-offset-2">
                                  View photo
                                </a>
                              )}
                            </li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
