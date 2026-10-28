import React, { useEffect, useMemo, useState } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/use-toast";
import { Segmented } from "@/components/admin/kit";
import { JOB_ICONS } from "@/components/jobs/JobTypeIcon";
import { SITE_SERVICES, grenadaInputFor, isAirportService, withService } from "@/lib/bookingSite";
import { blankRequest, companyRequestBody, companyRequestProblems } from "@/lib/companyPortal";
import { errorData } from "@/lib/requestError";

// A company asks for a job (an airport pickup, a transfer…). McSween's
// dispatch is emailed, makes the job and confirms it; the job then shows in
// the portal, with the bus while it is on the way.
export default function RequestJobDialog({ open, onOpenChange, company, onSent }) {
  const { toast } = useToast();
  const [form, setForm] = useState(() => withService(blankRequest(company?.phone || ""), "airport_pickup"));
  const [tried, setTried] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setForm(withService(blankRequest(company?.phone || ""), "airport_pickup"));
    setTried(false);
    setError("");
  }, [open, company?.phone]);

  const problems = useMemo(() => companyRequestProblems(form), [form]);
  const set = (patch) => setForm((f) => ({ ...f, ...patch }));
  const shown = (key) => (tried ? problems[key] : "");
  const airport = isAirportService(form.service);
  const earliest = grenadaInputFor(Date.now() + 60 * 60_000);

  const send = async (e) => {
    e.preventDefault();
    setTried(true);
    setError("");
    const first = Object.keys(problems)[0];
    if (first) { document.getElementById(`cr-${first}`)?.focus(); return; }
    setSending(true);
    try {
      await base44.functions.invoke("bookingRequest", companyRequestBody(form));
      toast({ title: "Job requested", description: "McSween Transport has been emailed. You'll get an email when it's confirmed." });
      onSent?.();
      onOpenChange(false);
    } catch (err) {
      setError(errorData(err).error || "Couldn't send the request. Check the connection and try again.");
    } finally {
      setSending(false);
    }
  };

  const field = (key, label, input, hint) => (
    <div className="space-y-1.5">
      <Label htmlFor={`cr-${key}`}>{label}</Label>
      {input}
      {shown(key) ? <p id={`cr-${key}-error`} className="text-caption text-danger">{shown(key)}</p> : hint ? <p className="text-caption text-muted-foreground">{hint}</p> : null}
    </div>
  );
  const describedBy = (key) => (shown(key) ? `cr-${key}-error` : undefined);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92dvh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Request a job</DialogTitle>
          <DialogDescription>McSween Transport is emailed straight away. Nothing is booked until they confirm it; you'll get an email, and the job shows under Jobs.</DialogDescription>
        </DialogHeader>
        <form onSubmit={send} noValidate className="min-w-0 space-y-4">
          <fieldset disabled={sending} className="min-w-0 space-y-4">
            <Segmented label="Kind of job" value={form.service} onChange={(service) => setForm((f) => withService(f, service))} size="sm"
              options={SITE_SERVICES.map((s) => ({ value: s.id, label: s.name, icon: JOB_ICONS[s.id] }))} />
            <div className="grid gap-3 sm:grid-cols-2">
              {field("when", "Pickup time (Grenada time)",
                <Input id="cr-when" type="datetime-local" min={earliest} value={form.when} onChange={(e) => set({ when: e.target.value })} aria-invalid={!!shown("when")} aria-describedby={describedBy("when")} />)}
              {airport && field("flight_number", "Flight number",
                <Input id="cr-flight_number" value={form.flight_number} onChange={(e) => set({ flight_number: e.target.value })} placeholder="e.g. AA 1234" maxLength={12} aria-invalid={!!shown("flight_number")} aria-describedby={describedBy("flight_number")} />,
                "So the driver knows when the flight lands.")}
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {field("pickup", "Pick up from",
                <Input id="cr-pickup" value={form.pickup} onChange={(e) => set({ pickup: e.target.value })} maxLength={160} aria-invalid={!!shown("pickup")} aria-describedby={describedBy("pickup")} />)}
              {field("dropoff", "Going to",
                <Input id="cr-dropoff" value={form.dropoff} onChange={(e) => set({ dropoff: e.target.value })} maxLength={160} placeholder={company?.name || ""} aria-invalid={!!shown("dropoff")} aria-describedby={describedBy("dropoff")} />)}
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {field("name", "Guest's name",
                <Input id="cr-name" value={form.name} onChange={(e) => set({ name: e.target.value })} maxLength={80} placeholder="e.g. Mr and Mrs Lee" aria-invalid={!!shown("name")} aria-describedby={describedBy("name")} />,
                "For the driver's name sign.")}
              {field("phone", "Phone for this job",
                <Input id="cr-phone" type="tel" value={form.phone} onChange={(e) => set({ phone: e.target.value })} maxLength={24} aria-invalid={!!shown("phone")} aria-describedby={describedBy("phone")} />)}
            </div>
            <div className="grid grid-cols-2 gap-3">
              {field("guests", "Passengers",
                <Input id="cr-guests" type="number" inputMode="numeric" min={1} max={60} value={form.guests} onChange={(e) => set({ guests: e.target.value })} aria-invalid={!!shown("guests")} aria-describedby={describedBy("guests")} />)}
              {field("luggage", "Bags",
                <Input id="cr-luggage" type="number" inputMode="numeric" min={0} max={100} value={form.luggage} onChange={(e) => set({ luggage: e.target.value })} aria-invalid={!!shown("luggage")} aria-describedby={describedBy("luggage")} />)}
            </div>
            {field("notes", "Anything else",
              <Textarea id="cr-notes" value={form.notes} onChange={(e) => set({ notes: e.target.value })} maxLength={1000} rows={2} placeholder="e.g. A child seat; VIP guests" aria-invalid={!!shown("notes")} aria-describedby={describedBy("notes")} />)}
          </fieldset>
          {tried && Object.keys(problems).length > 0 && <p role="alert" className="text-body-sm text-danger">Some answers need a look. They're marked above.</p>}
          {error && <p role="alert" className="text-body-sm text-danger">{error}</p>}
          <div className="flex flex-wrap justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={sending}>Cancel</Button>
            <Button type="submit" disabled={sending}>{sending ? "Sending…" : "Send request"}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
