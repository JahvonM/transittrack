import React, { useMemo, useState } from "react";
import { CheckCircle2, ClipboardList, FileSpreadsheet, FileText, Receipt, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EmptyState, Segmented, Toolbar, tableClass } from "@/components/admin/kit";
import JobTypeIcon from "@/components/jobs/JobTypeIcon";
import JobRecordDialog from "@/components/jobs/JobRecordDialog";
import InvoicesPanel from "@/components/jobs/InvoicesPanel";
import { exportToCSV, exportToPDF } from "@/lib/exporters";
import { JOB_TYPES, dropoffSigned, formatMoney, jobTypeLabel, jobTypeOf, pickupSigned } from "@/lib/jobs";

const TRIP_COLS = [
  { key: "completed_at", label: "Completed" },
  { key: "job_label", label: "Job" },
  { key: "client_name", label: "Client" },
  { key: "company_name", label: "Company" },
  { key: "driver_name", label: "Driver" },
  { key: "vehicle_name", label: "Vehicle" },
  { key: "plate_number", label: "Plate" },
  { key: "pickup_name", label: "Pickup" },
  { key: "dropoff_name", label: "Drop-off" },
  { key: "passenger_name", label: "Guest" },
  { key: "guests", label: "Guests" },
  { key: "flight_number", label: "Flight" },
  { key: "scheduled_time", label: "Scheduled" },
  { key: "started_at", label: "Started" },
  { key: "pickup_signed_by", label: "Pickup signed by" },
  { key: "dropoff_signed_by", label: "Drop-off signed by" },
  { key: "price", label: "Price" },
  { key: "currency", label: "Currency" },
  { key: "invoice_number", label: "Invoice" },
];
const ALL = "__all";
const NONE = "__none";
const pad = (n) => String(n).padStart(2, "0");
const localDay = (iso) => { const d = new Date(iso); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };

// Admin → Completed & billing: the record of every finished job (with its
// signatures and a job sheet) and the client invoices made from them.
// The console loads the most recent page of completed jobs; "Show more"
// pulls the next one rather than a thousand rows up front.
export default function CompletedTripsTab({ trips, clients = [], invoices = [], companies = [], hasMore = false, loadingMore = false, onLoadMore, onChange }) {
  const [view, setView] = useState("jobs");
  const [filters, setFilters] = useState({ type: ALL, client: ALL, driver: ALL, from: "", to: "", q: "" });
  const [open, setOpen] = useState(null);
  const set = (patch) => setFilters((f) => ({ ...f, ...patch }));

  const completed = useMemo(() => trips
    .filter((t) => t.status === "completed")
    .sort((a, b) => (b.completed_at || "").localeCompare(a.completed_at || "")), [trips]);
  const drivers = [...new Set(completed.map((t) => t.driver_name).filter(Boolean))].sort();
  const q = filters.q.trim().toLowerCase();
  const shown = completed.filter((t) => {
    const done = t.completed_at ? localDay(t.completed_at) : "";
    return (filters.type === ALL || jobTypeOf(t) === filters.type)
      && (filters.client === ALL || (filters.client === NONE ? !t.client_id : t.client_id === filters.client))
      && (filters.driver === ALL || t.driver_name === filters.driver)
      && (!filters.from || done >= filters.from) && (!filters.to || done <= filters.to)
      && (!q || [t.pickup_name, t.dropoff_name, t.passenger_name, t.client_name, t.flight_number, t.vehicle_name].some((v) => String(v || "").toLowerCase().includes(q)));
  });
  const current = open ? trips.find((t) => t.id === open) || null : null;

  const rows = shown.map((t) => ({ ...t, job_label: jobTypeLabel(t) }));
  const stamp = new Date().toISOString().slice(0, 10);
  const exportCsv = () => exportToCSV(`job-records-${stamp}`, TRIP_COLS, rows);
  const exportPdf = () => exportToPDF(`job-records-${stamp}`, "Completed jobs", TRIP_COLS.filter((c) => !["company_name", "plate_number", "started_at", "currency"].includes(c.key)), rows);
  const fmt = (iso) => (iso ? new Date(iso).toLocaleString([], { dateStyle: "short", timeStyle: "short" }) : "—");
  const filtered = filters.type !== ALL || filters.client !== ALL || filters.driver !== ALL || filters.from || filters.to || q;

  return (
    <div className="space-y-3">
      <Toolbar actions={view === "jobs" && (
        <>
          <Button size="sm" variant="outline" onClick={exportCsv} disabled={shown.length === 0}><FileSpreadsheet className="h-4 w-4" /> Excel</Button>
          <Button size="sm" variant="outline" onClick={exportPdf} disabled={shown.length === 0}><FileText className="h-4 w-4" /> PDF</Button>
        </>
      )}>
        <Segmented label="Billing view" value={view} onChange={setView} options={[
          { value: "jobs", label: "Completed jobs", icon: ClipboardList, count: completed.length },
          { value: "invoices", label: "Invoices", icon: Receipt, count: invoices.length },
        ]} />
      </Toolbar>

      {view === "invoices" ? (
        <InvoicesPanel invoices={invoices} clients={clients} companies={companies} onChange={onChange} />
      ) : (
        <>
          <div className="flex flex-wrap gap-2">
            <div className="relative min-w-[14rem] flex-1">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
              <Input value={filters.q} onChange={(e) => set({ q: e.target.value })} placeholder="Search place, guest, flight" aria-label="Search jobs" className="pl-8" />
            </div>
            <Select value={filters.type} onValueChange={(type) => set({ type })}>
              <SelectTrigger aria-label="Kind of job" className="w-auto min-w-[9rem]"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value={ALL}>All kinds</SelectItem>{JOB_TYPES.map((t) => <SelectItem key={t.id} value={t.id}>{t.label}</SelectItem>)}</SelectContent>
            </Select>
            <Select value={filters.client} onValueChange={(client) => set({ client })}>
              <SelectTrigger aria-label="Client" className="w-auto min-w-[9rem]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All clients</SelectItem><SelectItem value={NONE}>No client</SelectItem>
                {clients.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={filters.driver} onValueChange={(driver) => set({ driver })}>
              <SelectTrigger aria-label="Driver" className="w-auto min-w-[9rem]"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value={ALL}>All drivers</SelectItem>{drivers.map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}</SelectContent>
            </Select>
            <div className="flex items-center gap-2">
              <Input type="date" value={filters.from} onChange={(e) => set({ from: e.target.value })} aria-label="Completed from" className="w-auto" />
              <span className="text-caption text-muted-foreground">to</span>
              <Input type="date" value={filters.to} onChange={(e) => set({ to: e.target.value })} aria-label="Completed to" className="w-auto" />
            </div>
          </div>
          <p className="text-body-sm text-muted-foreground">
            {filtered ? `${shown.length} of ${completed.length}` : completed.length} completed job{completed.length === 1 ? "" : "s"}{hasMore ? " loaded" : ""}
            {filtered && hasMore ? " · Show more to search older ones" : ""}
          </p>
          {shown.length === 0 ? (
            <EmptyState icon={FileText} title={completed.length ? "No jobs match" : "No completed jobs yet"} />
          ) : (
            <div className={tableClass.wrap} tabIndex={0} role="region" aria-label="Completed jobs table">
              <table className={tableClass.table}>
                <thead><tr>
                  <th className={tableClass.th}>Completed</th><th className={tableClass.th}>Job</th><th className={tableClass.th}>Client</th>
                  <th className={tableClass.th}>Driver</th><th className={tableClass.th}>Price</th><th className={tableClass.th}>Signed</th>
                </tr></thead>
                <tbody>
                  {shown.map((t) => (
                    <tr key={t.id} className={`${tableClass.tr} cursor-pointer`} onClick={() => setOpen(t.id)}>
                      <td className={`${tableClass.td} whitespace-nowrap`}>{fmt(t.completed_at)}</td>
                      <td className={tableClass.td}>
                        <button type="button" className="text-left" onClick={(e) => { e.stopPropagation(); setOpen(t.id); }}>
                          <span className="flex items-center gap-1.5 text-caption font-semibold text-muted-foreground"><JobTypeIcon trip={t} className="h-3.5 w-3.5" /> {jobTypeLabel(t)}</span>
                          <span className="block font-semibold">{t.pickup_name} → {t.dropoff_name}</span>
                          {(t.passenger_name || t.guests) && <span className="block text-caption text-muted-foreground">{[t.passenger_name, t.guests ? `${t.guests} guests` : ""].filter(Boolean).join(" · ")}</span>}
                        </button>
                      </td>
                      <td className={tableClass.td}>{t.client_name || "—"}</td>
                      <td className={tableClass.td}>{t.driver_name || "—"}<span className="block text-caption text-muted-foreground">{[t.vehicle_name, t.plate_number].filter(Boolean).join(" · ")}</span></td>
                      <td className={`${tableClass.td} whitespace-nowrap tabular-nums`}>
                        {formatMoney(t.price, t.currency) || "—"}
                        {t.invoice_number && <span className="block text-caption text-muted-foreground">{t.invoice_number}</span>}
                      </td>
                      <td className={tableClass.td}>
                        <span className="flex flex-col gap-0.5 text-caption">
                          <span className={pickupSigned(t) ? "text-success" : "text-muted-foreground"}>{pickupSigned(t) && <CheckCircle2 className="mr-1 inline h-3.5 w-3.5" aria-hidden="true" />}Pickup</span>
                          <span className={dropoffSigned(t) ? "text-success" : "text-muted-foreground"}>{dropoffSigned(t) && <CheckCircle2 className="mr-1 inline h-3.5 w-3.5" aria-hidden="true" />}Drop-off</span>
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {hasMore && (
            <div className="flex justify-center">
              <Button variant="outline" size="sm" loading={loadingMore} onClick={onLoadMore}>
                Show more
              </Button>
            </div>
          )}
        </>
      )}
      <JobRecordDialog open={!!current} onOpenChange={(o) => !o && setOpen(null)} job={current} clients={clients} onChange={onChange} />
    </div>
  );
}
