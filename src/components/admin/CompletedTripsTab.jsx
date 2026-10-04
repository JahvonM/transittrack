import React from "react";
import EmptyState from "@/components/EmptyState";
import { FileSpreadsheet, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { exportToCSV, exportToPDF } from "@/lib/exporters";

const TRIP_COLS = [
  { key: "completed_at", label: "Completed" },
  { key: "company_name", label: "Company" },
  { key: "driver_name", label: "Driver" },
  { key: "vehicle_name", label: "Vehicle" },
  { key: "plate_number", label: "Plate" },
  { key: "pickup_name", label: "Pickup" },
  { key: "dropoff_name", label: "Drop-off" },
  { key: "passenger_name", label: "Guest" },
  { key: "scheduled_time", label: "Scheduled" },
  { key: "started_at", label: "Started" },
  { key: "pickup_signed_by", label: "Pickup signed by" },
  { key: "dropoff_signed_by", label: "Drop-off signed by" },
  { key: "pickup_signature_url", label: "Pickup signature" },
  { key: "dropoff_signature_url", label: "Drop-off signature" },
];

export default function CompletedTripsTab({ trips }) {
  const completed = trips
    .filter((t) => t.status === "completed")
    .sort((a, b) => (b.completed_at || "").localeCompare(a.completed_at || ""));

  const stamp = new Date().toISOString().slice(0, 10);
  const exportCsv = () => exportToCSV(`billing-report-${stamp}`, TRIP_COLS, completed);
  const exportPdf = () => exportToPDF(`billing-report-${stamp}`, "Completed trips — billing report", TRIP_COLS, completed);

  const fmt = (iso) =>
    iso ? new Date(iso).toLocaleString([], { dateStyle: "short", timeStyle: "short" }) : "—";

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{completed.length} completed trips</p>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={exportCsv} disabled={completed.length === 0}>
            <FileSpreadsheet className="w-4 h-4" /> Excel
          </Button>
          <Button size="sm" variant="outline" onClick={exportPdf} disabled={completed.length === 0}>
            <FileText className="w-4 h-4" /> PDF
          </Button>
        </div>
      </div>
      {completed.length === 0 ? (
        <div className="text-center py-12 border rounded-2xl">
          <FileText className="w-8 h-8 mx-auto text-muted-foreground mb-2" />
          <EmptyState text="No completed trips yet." />
        </div>
      ) : (
        <div className="rounded-xl border overflow-x-auto" tabIndex={0} role="region" aria-label="Completed trips table">
          <Table containerClassName="overflow-visible">
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