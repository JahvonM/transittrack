import React from "react";
import { Clock, Plane, StickyNote, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import JobTypeIcon from "@/components/jobs/JobTypeIcon";
import { jobTypeLabel } from "@/lib/jobs";
import { TRANSIT_TIME_ZONE } from "@/lib/localTime";

const HEADINGS = {
  new: { title: "New job", bar: "bg-primary", text: "text-primary" },
  changed: { title: "Job changed", bar: "bg-warning", text: "text-warning" },
  removed: { title: "Job taken off this bus", bar: "bg-danger", text: "text-danger" },
};
const when = (iso) => (iso ? new Date(iso).toLocaleString([], { timeZone: TRANSIT_TIME_ZONE, weekday: "short", hour: "2-digit", minute: "2-digit" }) : "No time set");

// Full-screen notice when dispatch gives this bus a job, changes one or takes
// one off it. Stays until the driver taps OK, so it isn't missed while driving
// past the tablet; "Open jobs" goes straight to the job list.
export default function JobAlert({ alert, onDismiss, onOpen }) {
  if (!alert) return null;
  const { kind, job } = alert;
  const head = HEADINGS[kind] || HEADINGS.new;
  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
      <div role="alertdialog" aria-modal="true" aria-label={head.title} className="relative w-full max-w-2xl overflow-hidden rounded-2xl border border-border/60 bg-card shadow-2xl animate-in fade-in zoom-in-95 duration-300">
        <div className={`h-2 ${head.bar}`} />
        <div className="space-y-4 p-6 sm:p-8">
          <p className={`text-sm font-bold uppercase tracking-wider ${head.text}`}>{head.title}</p>
          <div>
            <p className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
              <JobTypeIcon trip={job} className="h-4 w-4" /> {jobTypeLabel(job)}{job.client_name ? ` · ${job.client_name}` : ""}
            </p>
            <p className="mt-1 font-heading text-2xl font-bold leading-tight sm:text-4xl">
              {job.pickup_name || "—"} <span className="text-muted-foreground">→</span> {job.dropoff_name || "—"}
            </p>
          </div>
          <div className="grid gap-1.5 text-base text-muted-foreground">
            <p className="flex items-center gap-2"><Clock className="h-4 w-4" aria-hidden="true" /> Pickup {when(job.scheduled_time)}</p>
            {job.flight_number && <p className="flex items-center gap-2"><Plane className="h-4 w-4" aria-hidden="true" /> Flight {job.flight_number}</p>}
            {job.guests ? <p className="flex items-center gap-2"><Users className="h-4 w-4" aria-hidden="true" /> {job.guests} guest{job.guests === 1 ? "" : "s"}{job.passenger_name ? ` · ${job.passenger_name}` : ""}</p> : null}
            {job.notes && kind !== "removed" && <p className="flex items-start gap-2 text-foreground"><StickyNote className="mt-1 h-4 w-4 shrink-0" aria-hidden="true" /> {job.notes}</p>}
          </div>
          {kind === "removed" && <p className="text-base">Dispatch cancelled this job or gave it to another bus. You don't need to do it.</p>}
          {kind !== "removed" && onOpen ? (
            <div className="grid gap-2 sm:grid-cols-2">
              <Button className="h-12 text-base" onClick={() => { onDismiss(); onOpen(); }}>Open jobs</Button>
              <Button variant="outline" className="h-12 text-base" onClick={onDismiss}>OK</Button>
            </div>
          ) : (
            <Button className="h-12 w-full text-base" onClick={onDismiss}>OK</Button>
          )}
        </div>
      </div>
    </div>
  );
}
