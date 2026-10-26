import React, { useState } from "react";
import { Globe, Mail, MessageCircle, Phone, Plane, Users } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/use-toast";
import { EmptyState, Panel } from "@/components/admin/kit";
import JobTypeIcon from "@/components/jobs/JobTypeIcon";
import { jobTypeLabel } from "@/lib/jobs";
import { TRANSIT_TIME_ZONE } from "@/lib/localTime";
import { errorData } from "@/lib/requestError";

// Admin → Jobs → Requests: rides asked for on the website. Dispatch makes a
// job from one (which confirms it and emails the customer), or declines it.

const when = (iso) => {
  const t = Date.parse(iso || "");
  return Number.isFinite(t) ? new Date(t).toLocaleString([], { timeZone: TRANSIT_TIME_ZONE, weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }) : "No time";
};
const ago = (iso) => {
  const m = Math.round((Date.now() - Date.parse(iso || "")) / 60000);
  if (!Number.isFinite(m)) return "";
  if (m < 1) return "just now";
  if (m < 60) return `${m} min ago`;
  if (m < 48 * 60) return `${Math.round(m / 60)} h ago`;
  return `${Math.round(m / 1440)} days ago`;
};
const waNumber = (phone) => String(phone || "").replace(/[^\d]/g, "");

export async function answerRequest(action, body) {
  return (await base44.functions.invoke("bookingRequest", { action, ...body })).data;
}

function RequestCard({ r, madeJob, onMakeJob, onConfirmMade, onDecline, onSpam, busy }) {
  const details = [
    r.guests ? `${r.guests} passenger${r.guests === 1 ? "" : "s"}` : "",
    r.luggage ? `${r.luggage} bag${r.luggage === 1 ? "" : "s"}` : "",
  ].filter(Boolean).join(", ");
  return (
    <li className="rounded-xl border border-border bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 text-caption font-semibold text-muted-foreground">
            <JobTypeIcon trip={{ job_type: r.service }} className="h-3.5 w-3.5" /> {jobTypeLabel({ job_type: r.service })}
            <span className="font-normal">· asked {ago(r.created_date)}</span>
          </p>
          <p className="mt-0.5 font-semibold">{when(r.requested_time)}</p>
          <p className="text-body-sm"><span className="font-medium">{r.pickup}</span> <span className="text-muted-foreground">to</span> <span className="font-medium">{r.dropoff}</span></p>
          <p className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-body-sm text-muted-foreground">
            {details && <span className="inline-flex items-center gap-1"><Users className="h-3.5 w-3.5" aria-hidden="true" />{details}</span>}
            {r.flight_number && <span className="inline-flex items-center gap-1"><Plane className="h-3.5 w-3.5" aria-hidden="true" />Flight {r.flight_number}</span>}
          </p>
        </div>
      </div>
      <div className="mt-3 rounded-lg bg-secondary px-3 py-2 text-body-sm">
        <p className="font-semibold">{r.name}</p>
        <p className="mt-1 flex flex-wrap gap-x-4 gap-y-1">
          {r.phone && <a className="inline-flex items-center gap-1 text-primary hover:underline" href={`tel:${r.phone}`}><Phone className="h-3.5 w-3.5" aria-hidden="true" />{r.phone}</a>}
          {waNumber(r.phone).length >= 7 && <a className="inline-flex items-center gap-1 text-primary hover:underline" href={`https://wa.me/${waNumber(r.phone)}`} target="_blank" rel="noopener noreferrer"><MessageCircle className="h-3.5 w-3.5" aria-hidden="true" />WhatsApp</a>}
          {r.email && <a className="inline-flex items-center gap-1 text-primary hover:underline" href={`mailto:${r.email}`}><Mail className="h-3.5 w-3.5" aria-hidden="true" />{r.email}</a>}
        </p>
        {r.notes && <p className="mt-1.5 whitespace-pre-wrap text-muted-foreground">{r.notes}</p>}
      </div>
      {madeJob && <p role="status" className="mt-3 text-body-sm text-warning">The job for this request is saved, but the ride wasn't confirmed yet.</p>}
      <div className="mt-3 flex flex-wrap gap-2">
        {/* A job already made for it is confirmed, never made a second time. */}
        {madeJob
          ? <Button onClick={() => onConfirmMade(r)} disabled={busy}>Confirm ride</Button>
          : <Button onClick={() => onMakeJob(r)} disabled={busy}>Make job</Button>}
        <Button variant="outline" onClick={() => onDecline(r)} disabled={busy}>Decline</Button>
        <Button variant="ghost" className="text-muted-foreground" onClick={() => onSpam(r)} disabled={busy}>Spam</Button>
      </div>
    </li>
  );
}

export default function BookingRequests({ requests = [], loading = false, madeJobs = {}, onMakeJob, onConfirmMade, onChanged }) {
  const { toast } = useToast();
  const [declining, setDeclining] = useState(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  const decline = async () => {
    setBusy(true);
    try {
      const res = await answerRequest("decline", { request_id: declining.id, reason: reason.trim() });
      toast({ title: "Request declined", description: res.emailed ? `${declining.name} was emailed.` : "The email to the customer didn't go out; contact them yourself." });
      setDeclining(null);
      onChanged?.();
    } catch (e) {
      toast({ title: "Couldn't decline the request", description: errorData(e).error || "Try again.", variant: "destructive" });
    } finally { setBusy(false); }
  };
  const spam = async (r) => {
    if (!window.confirm(`Close ${r.name}'s request as spam? Nobody is emailed.`)) return;
    setBusy(true);
    try { await answerRequest("spam", { request_id: r.id }); onChanged?.(); }
    catch (e) { toast({ title: "Couldn't close the request", description: errorData(e).error || "Try again.", variant: "destructive" }); }
    finally { setBusy(false); }
  };

  return (
    <Panel title="Ride requests" icon={Globe} description="Asked for on the website. Make a job to confirm a ride, or decline it. The customer is emailed either way.">
      {loading && requests.length === 0 ? (
        <p className="px-1 py-6 text-center text-body-sm text-muted-foreground" role="status">Loading requests…</p>
      ) : requests.length === 0 ? (
        <EmptyState icon={Globe} title="No new requests" className="border-0">Rides people ask for on mcsweenstransport.com show up here.</EmptyState>
      ) : (
        <ul className="space-y-3">
          {requests.map((r) => <RequestCard key={r.id} r={r} busy={busy} madeJob={madeJobs[r.id]} onMakeJob={onMakeJob} onConfirmMade={onConfirmMade} onDecline={(x) => { setReason(""); setDeclining(x); }} onSpam={spam} />)}
        </ul>
      )}
      <Dialog open={!!declining} onOpenChange={(open) => !open && setDeclining(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Decline {declining?.name}'s request</DialogTitle>
            <DialogDescription>They get an email saying you can't take this ride. Add a reason if it helps them, for example another time that works.</DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="decline-reason">Reason (optional)</Label>
            <Textarea id="decline-reason" value={reason} maxLength={300} onChange={(e) => setReason(e.target.value)} placeholder="We're fully booked that morning. We could do 2 pm instead." />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeclining(null)} disabled={busy}>Keep it</Button>
            <Button onClick={decline} disabled={busy}>{busy ? "Declining…" : "Decline and email"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Panel>
  );
}
