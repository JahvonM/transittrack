import React, { useEffect, useState } from "react";
import { CheckCircle2, FileDown, MapPin } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/components/ui/use-toast";
import { StatusChip } from "@/components/admin/kit";
import JobTypeIcon from "@/components/jobs/JobTypeIcon";
import { CURRENCIES, formatMoney, jobTypeLabel } from "@/lib/jobs";
import { jobSheetPdf } from "@/lib/jobDocuments";
import { TRANSIT_TIME_ZONE } from "@/lib/localTime";
import { STATUS_LABEL } from "@/lib/trip";
import { errorData } from "@/lib/requestError";

const NONE = "__none";
const when = (iso) => (iso ? new Date(iso).toLocaleString([], { timeZone: TRANSIT_TIME_ZONE, day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }) : "—");

function Item({ label, children }) {
  if (children === undefined || children === null || children === "") return null;
  return (
    <div className="grid grid-cols-[8rem_1fr] gap-2 py-1 text-body-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="min-w-0 break-words">{children}</span>
    </div>
  );
}

// The record of one job: what it was, when each step happened, who signed
// and where, and its price for billing. Signatures are private files, opened
// for administrators through jobBilling.
export default function JobRecordDialog({ open, onOpenChange, job, clients = [], onChange }) {
  const { toast } = useToast();
  const [signatures, setSignatures] = useState({ loading: false, pickup: null, dropoff: null, failed: false });
  const [billing, setBilling] = useState({ client_id: "", price: "", currency: "XCD" });
  const [saving, setSaving] = useState(false);
  const [printing, setPrinting] = useState(false);

  useEffect(() => {
    if (!open || !job) return undefined;
    setBilling({ client_id: job.client_id || "", price: job.price ?? "", currency: job.currency || "XCD" });
    let live = true;
    const signed = job.pickup_signed_at || job.dropoff_signed_at || job.pickup_signature_url || job.dropoff_signature_url;
    if (!signed) { setSignatures({ loading: false, pickup: null, dropoff: null, failed: false }); return undefined; }
    setSignatures({ loading: true, pickup: null, dropoff: null, failed: false });
    base44.functions.invoke("jobBilling", { action: "signatures", trip_id: job.id })
      .then((res) => { if (live) setSignatures({ loading: false, pickup: res.data?.pickup || null, dropoff: res.data?.dropoff || null, failed: false }); })
      .catch(() => { if (live) setSignatures({ loading: false, pickup: null, dropoff: null, failed: true }); });
    return () => { live = false; };
  }, [open, job]);

  if (!job) return null;
  const invoiced = !!job.invoice_id;
  const changed = billing.client_id !== (job.client_id || "") || String(billing.price) !== String(job.price ?? "") || billing.currency !== (job.currency || "XCD");

  const saveBilling = async () => {
    setSaving(true);
    try {
      await base44.entities.Trip.update(job.id, { client_id: billing.client_id || "", price: billing.price === "" ? null : Number(billing.price), currency: billing.currency });
      toast({ title: "Billing details saved" });
      onChange?.();
    } catch (e) {
      toast({ title: "Couldn't save", description: errorData(e).error || "Check the connection and try again.", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };
  const printSheet = async () => {
    setPrinting(true);
    try { await jobSheetPdf(job, signatures); }
    catch { toast({ title: "Couldn't make the job sheet", variant: "destructive" }); }
    finally { setPrinting(false); }
  };

  const signature = (mode) => {
    const at = job[`${mode}_signed_at`];
    const image = signatures[mode];
    const lat = job[`${mode}_signed_lat`], lng = job[`${mode}_signed_lng`];
    return (
      <div className="rounded-xl border border-border p-3">
        <p className="mb-1 flex items-center gap-1.5 text-body-sm font-semibold">
          {at ? <CheckCircle2 className="h-4 w-4 text-success" aria-hidden="true" /> : null}
          {mode === "pickup" ? "Pickup" : "Drop-off"}
        </p>
        {!at && !image ? <p className="text-caption text-muted-foreground">Not signed.</p> : (
          <>
            <p className="text-caption text-muted-foreground">
              {job[`${mode}_signed_by`] || "—"} · {when(at)}
              {job[`${mode}_signed_guests`] != null ? ` · ${job[`${mode}_signed_guests`]} guest${job[`${mode}_signed_guests`] === 1 ? "" : "s"}` : ""}
            </p>
            {lat != null && lng != null && (
              <a className="mt-0.5 inline-flex items-center gap-1 text-caption font-semibold text-primary" href={`https://www.google.com/maps?q=${lat},${lng}`} target="_blank" rel="noreferrer">
                <MapPin className="h-3.5 w-3.5" aria-hidden="true" /> Where it was signed
              </a>
            )}
            <div className="mt-2 grid h-28 place-items-center rounded-lg bg-white">
              {signatures.loading ? <span className="text-caption text-slate-500">Loading…</span>
                : image ? <img src={image} alt={`${mode === "pickup" ? "Pickup" : "Drop-off"} signature`} className="max-h-24 max-w-full object-contain" />
                  : <span className="text-caption text-slate-500">{signatures.failed ? "Couldn't load the signature." : "No picture saved."}</span>}
            </div>
          </>
        )}
      </div>
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92dvh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-center gap-2">
            <JobTypeIcon trip={job} className="h-5 w-5" /> {jobTypeLabel(job)}
            <StatusChip status={job.status}>{STATUS_LABEL[job.status] || job.status}</StatusChip>
          </DialogTitle>
          <DialogDescription>{job.pickup_name} to {job.dropoff_name}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Item label="Client">{job.client_name}</Item>
            <Item label="Lead guest">{[job.passenger_name, job.passenger_phone].filter(Boolean).join(" · ")}</Item>
            <Item label="Guests">{job.guests ?? ""}</Item>
            <Item label="Bags">{job.luggage ?? ""}</Item>
            <Item label="Flight">{job.flight_number ? `${job.flight_number}${job.flight_time ? ` · ${job.job_type === "airport_dropoff" ? "departs" : "lands"} ${when(job.flight_time)}` : ""}` : ""}</Item>
            <Item label="Bus">{[job.vehicle_name, job.plate_number, job.driver_name].filter(Boolean).join(" · ")}</Item>
            <Item label="Notes">{job.notes}</Item>
          </div>
          <div>
            <p className="mb-1 text-body-sm font-semibold">Times</p>
            <Item label="Booked for">{when(job.scheduled_time)}</Item>
            <Item label="Started">{when(job.started_at)}</Item>
            <Item label="Arrived">{when(job.arrived_at)}</Item>
            <Item label="Completed">{when(job.completed_at)}</Item>
            {(job.stops || []).map((s, i) => <Item key={`${s.name}-${i}`} label={`Stop ${i + 1}`}>{s.name} · {s.reached_at ? `reached ${when(s.reached_at)}` : "not marked"}</Item>)}
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {signature("pickup")}
            {signature("dropoff")}
          </div>

          <div className="space-y-2 rounded-xl border border-border p-3">
            <p className="text-body-sm font-semibold">Billing</p>
            {invoiced ? (
              <p className="text-body-sm text-muted-foreground">{formatMoney(job.price, job.currency) || "No price"} · on invoice {job.invoice_number}. Void the invoice to change it.</p>
            ) : (
              <>
                <div className="grid gap-2 sm:grid-cols-[1fr_8rem_6rem]">
                  <Select value={billing.client_id || NONE} onValueChange={(v) => setBilling((b) => ({ ...b, client_id: v === NONE ? "" : v }))}>
                    <SelectTrigger aria-label="Client"><SelectValue placeholder="Client" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE}>No client</SelectItem>
                      {clients.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <div>
                    <Label htmlFor="record-price" className="sr-only">Price</Label>
                    <Input id="record-price" type="number" inputMode="decimal" min={0} step="0.01" placeholder="Price" value={billing.price} onChange={(e) => setBilling((b) => ({ ...b, price: e.target.value }))} />
                  </div>
                  <Select value={billing.currency} onValueChange={(currency) => setBilling((b) => ({ ...b, currency }))}>
                    <SelectTrigger aria-label="Currency"><SelectValue /></SelectTrigger>
                    <SelectContent>{CURRENCIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <Button size="sm" variant="outline" onClick={saveBilling} disabled={saving || !changed}>{saving ? "Saving…" : "Save billing details"}</Button>
              </>
            )}
          </div>

          <Button className="w-full" variant="outline" onClick={printSheet} disabled={printing || signatures.loading}>
            <FileDown className="h-4 w-4" /> {printing ? "Making the PDF…" : "Download job sheet (PDF)"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
