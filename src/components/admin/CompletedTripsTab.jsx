import React from "react";
import { Download, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const esc = (v) => `"${(v == null ? "" : String(v)).replace(/"/g, '""')}"`;

export default function CompletedTripsTab({ trips }) {
  const completed = trips
    .filter((t) => t.status === "completed")
    .sort((a, b) => (b.completed_at || "").localeCompare(a.completed_at || ""));

  const exportCsv = () => {
    const rows = [
      [
        "Completed",
        "Company",
        "Driver",
        "Vehicle",
        "Plate",
        "Pickup",
        "Drop-off",
        "Guest",
        "Scheduled",
        "Started",
        "Pickup signed by",
        "Drop-off signed by",
        "Pickup signature",
        "Drop-off signature",
      ],
      ...completed.map((t) => [
        t.completed_at,
        t.company_name,
        t.driver_name,
        t.vehicle_name,
        t.plate_number,
        t.pickup_name,
        t.dropoff_name,
        t.passenger_name,
        t.scheduled_time,
        t.started_at,
        t.pickup_signed_by,
        t.dropoff_signed_by,
        t.pickup_signature_url,
        t.dropoff_signature_url,
      ]),
    ];
    const csv = rows.map((r) => r.map(esc).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `billing-report-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const fmt = (iso) =>
    iso ? new Date(iso).toLocaleString([], { dateStyle: "short", timeStyle: "short" }) : "—";

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{completed.length} completed trips</p>
        <Button size="sm" onClick={exportCsv} disabled={completed.length === 0}>
          <Download className="w-4 h-4" /> Export billing report
        </Button>
      </div>
      {completed.length === 0 ? (
        <div className="text-center py-12 border rounded-2xl">
          <FileText className="w-8 h-8 mx-auto text-muted-foreground mb-2" />
          <p className="text-sm text-muted-foreground">No completed trips yet.</p>
        </div>
      ) : (
        <div className="rounded-xl border overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Completed</TableHead>
                <TableHead>Pickup → Drop-off</TableHead>
                <TableHead>Driver</TableHead>
                <TableHead>Vehicle</TableHead>
                <TableHead>Signatures</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {completed.map((t) => (
                <TableRow key={t.id}>
                  <TableCell className="whitespace-nowrap text-xs">{fmt(t.completed_at)}</TableCell>
                  <TableCell className="text-xs">
                    {t.pickup_name} → {t.dropoff_name}
                    {t.passenger_name && <div className="text-muted-foreground">{t.passenger_name}</div>}
                  </TableCell>
                  <TableCell className="text-xs">{t.driver_name || "—"}</TableCell>
                  <TableCell className="text-xs">{t.vehicle_name} · {t.plate_number}</TableCell>
                  <TableCell className="text-xs">
                    {t.pickup_signature_url && (
                      <a className="text-primary underline" href={t.pickup_signature_url} target="_blank" rel="noreferrer">Pickup</a>
                    )}
                    {t.pickup_signature_url && t.dropoff_signature_url && " · "}
                    {t.dropoff_signature_url && (
                      <a className="text-primary underline" href={t.dropoff_signature_url} target="_blank" rel="noreferrer">Drop-off</a>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}