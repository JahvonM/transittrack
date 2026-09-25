import React, { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ClipboardCheck, ChevronDown, ChevronUp } from "lucide-react";

const conditionVariant = (c) => {
  if (c === "GOOD") return "default";
  if (c === "WARNING") return "secondary";
  if (c === "FAILED") return "destructive";
  return "outline";
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

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <ClipboardCheck className="w-5 h-5 text-primary" />
          <h2 className="text-lg font-semibold">Inspection history</h2>
        </div>
        <Select value={vehicleFilter} onValueChange={setVehicleFilter}>
          <SelectTrigger className="w-56"><SelectValue placeholder="All vehicles" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">All vehicles</SelectItem>
            {vehicles.map((v) => <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {sessions.length === 0 && (
        <Card><CardContent className="py-14 text-center text-sm text-muted-foreground">No inspections recorded yet.</CardContent></Card>
      )}

      <div className="space-y-2">
        {sessions.map(({ key, items, first }) => {
          const failed = items.filter((i) => i.condition === "FAILED").length;
          const warning = items.filter((i) => i.condition === "WARNING").length;
          const expanded = expandedKey === key;
          return (
            <Card key={key}>
              <CardContent
                className="p-4 cursor-pointer flex items-center justify-between gap-3"
                onClick={() => setExpandedKey(expanded ? null : key)}
              >
                <div className="min-w-0">
                  <p className="font-medium text-sm truncate">{first.vehicle_name} — {first.inspection_name}</p>
                  <p className="text-xs text-muted-foreground">
                    {first.inspection_date ? new Date(first.inspection_date).toLocaleString() : ""} · {items.length} items · {first.inspector_name || "Unknown inspector"}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {failed > 0 && <Badge variant="destructive" className="text-xs">{failed} failed</Badge>}
                  {warning > 0 && <Badge variant="secondary" className="text-xs">{warning} warning</Badge>}
                  {failed === 0 && warning === 0 && <Badge className="text-xs">All good</Badge>}
                  {expanded ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
                </div>
              </CardContent>
              {expanded && (
                <CardContent className="pt-0 space-y-3 border-t">
                  {sectionsFor(items).map(([sectionName, sectionItems]) => (
                    <div key={sectionName} className="pt-3">
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">{sectionName}</p>
                      <div className="space-y-1.5">
                        {sectionItems.map((r) => (
                          <div key={r.id} className="border rounded-lg p-2.5 text-sm">
                            <div className="flex items-center justify-between gap-2">
                              <span className="font-medium">{r.inspection_item}</span>
                              <Badge variant={conditionVariant(r.condition)} className="text-xs shrink-0">{r.condition}</Badge>
                            </div>
                            {(r.fault_description || r.notes) && (
                              <p className="text-xs text-muted-foreground mt-1">{r.fault_description || r.notes}</p>
                            )}
                            {r.photo_url && (
                              <a href={r.photo_url} target="_blank" rel="noopener noreferrer" className="text-xs text-primary underline mt-1 inline-block">
                                View photo
                              </a>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </CardContent>
              )}
            </Card>
          );
        })}
      </div>
    </div>
  );
}
