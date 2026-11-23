import React, { useState } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { useToast } from "@/components/ui/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StatusChip } from "@/components/admin/kit";
import { findVehicle, nmText } from "@/lib/workshop";
import { dateText, fromShelf, isOpen, jobWhen, odometerText, partsOnJob, qtyText, stepProblem, stepProgress } from "@/lib/workshopJobs";
import { FIELD, Notice, ScreenBar, pluralize, useWorkshop } from "@/components/workshop/kit";
import { DoneSheet, JobEditSheet, JobPartSheet } from "@/components/workshop/JobSheets";
import { CheckCircle2, Loader2, Package, Pencil, Plus, RefreshCw, RotateCcw, X } from "lucide-react";

// One job: what was wrong, its steps to tick (each can show the model's
// torque value), the parts used (from the shelf, they come off the stock),
// and Mark done with what fixed it. A done job's parts stay as they were
// until it is reopened.

function Detail({ label, children }) {
  return (
    <div className="grid grid-cols-[8rem_minmax(0,1fr)] gap-3 px-4 py-2.5">
      <dt className="text-body-sm text-muted-foreground">{label}</dt>
      <dd className="min-w-0 whitespace-pre-line break-words text-body">{children}</dd>
    </div>
  );
}

function Steps({ job, torques }) {
  const { toast } = useToast();
  const { put } = useWorkshop();
  const [text, setText] = useState("");
  const [torqueId, setTorqueId] = useState("");
  const [busy, setBusy] = useState(false);
  const steps = job.steps || [];
  const progress = stepProgress(steps);
  const torqueOf = (id) => torques.find((t) => t.id === id) || null;

  // The screen changes at once; the job goes back as it was if the save fails.
  const save = async (next, after) => {
    setBusy(true);
    put("jobs", { ...job, steps: next });
    try {
      const saved = await base44.entities.WorkshopJob.update(job.id, { steps: next });
      put("jobs", saved?.id ? saved : { ...job, steps: next });
      after?.();
    } catch (e) {
      put("jobs", job);
      toast({ title: "Couldn't save the steps", description: e?.message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };
  const problem = stepProblem(text, steps);
  const add = (e) => {
    e.preventDefault();
    if (problem || busy) return;
    save([...steps, { text: text.trim(), done: false, ...(torqueId ? { torque_id: torqueId } : {}) }], () => { setText(""); setTorqueId(""); });
  };

  return (
    <section aria-labelledby="job-steps" className="rounded-xl border border-border bg-card shadow-sm">
      <div className="flex items-center gap-2 border-b border-border bg-secondary/60 px-4 py-2">
        <h3 id="job-steps" className="flex-1 text-body-sm font-semibold">Steps</h3>
        {progress.total > 0 && <span className="text-body-sm text-muted-foreground">{progress.done} of {progress.total} done</span>}
        {busy && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" aria-label="Saving" />}
      </div>
      {steps.length === 0 && <p className="px-4 py-3 text-body-sm text-muted-foreground">No steps yet. Add them as a checklist to tick.</p>}
      {steps.length > 0 && (
        <ol className="divide-y divide-border">
          {steps.map((s, i) => {
            const torque = s.torque_id ? torqueOf(s.torque_id) : null;
            return (
              <li key={`${i}-${s.text}`} className="flex items-center gap-2 px-2 py-1">
                <label className="flex min-h-[3.25rem] min-w-0 flex-1 cursor-pointer items-center gap-3 rounded-lg px-2">
                  <input type="checkbox" className="h-6 w-6 shrink-0" checked={!!s.done} disabled={busy} onChange={() => save(steps.map((x, k) => (k === i ? { ...x, done: !x.done } : x)))} />
                  <span className="min-w-0">
                    <span className={`block break-words text-body ${s.done ? "text-muted-foreground line-through" : ""}`}>{s.text}</span>
                    {torque && (
                      <span className="mt-0.5 flex flex-wrap items-center gap-1.5 text-body-sm">
                        <span className="font-semibold tabular-nums">{torque.item}: {nmText(torque.nm) ? `${nmText(torque.nm)} N·m` : "no value"}</span>
                        {torque.status !== "checked" && <StatusChip tone="warning">{torque.status === "wrong" ? "Marked wrong" : "Not checked"}</StatusChip>}
                      </span>
                    )}
                    {s.torque_id && !torque && <span className="mt-0.5 block text-body-sm text-muted-foreground">Torque value removed</span>}
                  </span>
                </label>
                <Button type="button" variant="ghost" className="h-11 w-11 shrink-0 rounded-lg p-0" disabled={busy} onClick={() => save(steps.filter((_, k) => k !== i))} aria-label={`Remove step ${i + 1}`}>
                  <X className="h-5 w-5" aria-hidden="true" />
                </Button>
              </li>
            );
          })}
        </ol>
      )}
      <form onSubmit={add} className="flex flex-wrap gap-2 border-t border-border p-3">
        <Input value={text} onChange={(e) => setText(e.target.value)} placeholder="Add a step" aria-label="New step" maxLength={300} className="h-12 min-w-[12rem] flex-1 text-body md:text-body" />
        {torques.length > 0 && (
          <select aria-label="Torque value for the step" className={`${FIELD} w-auto min-w-0 max-w-full`} value={torqueId} onChange={(e) => setTorqueId(e.target.value)}>
            <option value="">No torque value</option>
            {torques.map((t) => <option key={t.id} value={t.id}>{t.item}{nmText(t.nm) ? ` · ${nmText(t.nm)} N·m` : ""}</option>)}
          </select>
        )}
        <Button type="submit" className="h-12 rounded-lg text-body" disabled={!!problem || busy}><Plus className="mr-1.5 h-4 w-4" aria-hidden="true" />Add</Button>
      </form>
    </section>
  );
}

function PartsUsed({ job, lines, onAdd, onChange }) {
  const open = isOpen(job);
  const label = (line) => [line.part_number, `× ${qtyText(line.qty)}`, fromShelf(line) ? "From the shelf" : "Bought for this job"].filter(Boolean).join(" · ");
  return (
    <section aria-labelledby="job-parts" className="rounded-xl border border-border bg-card shadow-sm">
      <div className="flex items-center gap-2 border-b border-border bg-secondary/60 px-4 py-2">
        <h3 id="job-parts" className="flex-1 text-body-sm font-semibold">Parts used</h3>
        {open && <Button variant="outline" className="h-10 rounded-lg bg-card" onClick={onAdd}><Plus className="mr-1.5 h-4 w-4" aria-hidden="true" />Add a part</Button>}
      </div>
      {lines.length === 0 && <p className="px-4 py-3 text-body-sm text-muted-foreground">{open ? "None yet. A part from the shelf comes off its stock as you add it." : "No parts were used."}</p>}
      {lines.length > 0 && (
        <ul className="divide-y divide-border">
          {lines.map((line) => {
            const body = (
              <>
                <Package className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden="true" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold">{line.part_name}</span>
                  <span className="block truncate text-body-sm tabular-nums text-muted-foreground">{label(line)}</span>
                </span>
              </>
            );
            return (
              <li key={line.id}>
                {open ? (
                  <button type="button" onClick={() => onChange(line)} className="flex min-h-[3.75rem] w-full items-center gap-3 px-4 py-2 text-left hover:bg-secondary/60" aria-label={`${line.part_name}, ${label(line)}. Change or remove`}>
                    {body}<Pencil className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                  </button>
                ) : line.part_id ? (
                  <Link to={`/workshop/parts/${line.part_id}`} className="flex min-h-[3.75rem] items-center gap-3 px-4 py-2 hover:bg-secondary/60">{body}</Link>
                ) : (
                  <div className="flex min-h-[3.75rem] items-center gap-3 px-4 py-2">{body}</div>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {!open && lines.length > 0 && <p className="border-t border-border px-4 py-2 text-caption text-muted-foreground">Reopen the job to change its parts.</p>}
    </section>
  );
}

export default function JobPage() {
  const { jobId } = useParams();
  const { toast } = useToast();
  const { jobs, jobParts, vehicles, faults, specs, put, missing, reload } = useWorkshop();
  const [sheet, setSheet] = useState(null);
  const [reopening, setReopening] = useState(false);
  const job = jobs.find((j) => j.id === jobId);

  if (!job) {
    if (!missing.jobs) return <Navigate to="/workshop/jobs" replace />;
    return (
      <>
        <ScreenBar crumbs={[{ to: "/workshop", label: "Workshop" }, { to: "/workshop/jobs", label: "Jobs" }, { label: "Job" }]} title="Job" />
        <Notice tone="danger" action={<Button variant="outline" className="h-12 rounded-lg bg-card" onClick={reload}><RefreshCw className="mr-1.5 h-4 w-4" aria-hidden="true" />Try again</Button>}>
          Couldn't load the jobs. Check the connection.
        </Notice>
      </>
    );
  }

  const vehicle = findVehicle(vehicles, job.vehicle_kind, job.vehicle_id);
  const lines = partsOnJob(jobParts, job.id);
  const fault = job.fault_id ? faults.find((f) => f.id === job.fault_id) || null : null;
  const torques = job.guide_id ? specs.filter((s) => s.guide_id === job.guide_id) : [];
  const open = isOpen(job);
  const reopen = async () => {
    setReopening(true);
    try {
      put("jobs", await base44.entities.WorkshopJob.update(job.id, { status: "open" }));
    } catch (e) {
      toast({ title: "Couldn't reopen the job", description: e?.message, variant: "destructive" });
    } finally {
      setReopening(false);
    }
  };

  return (
    <>
      <ScreenBar
        crumbs={[{ to: "/workshop", label: "Workshop" }, { to: "/workshop/jobs", label: "Jobs" }, { label: job.title || "Job" }]}
        title={job.title || "Job"} subtitle={[vehicle?.name || job.vehicle_name, jobWhen(job)].filter(Boolean).join(" · ")}
      >
        <Button variant="outline" className="h-12 rounded-lg bg-card text-body" onClick={() => setSheet({ kind: "edit" })}><Pencil className="mr-1.5 h-4 w-4" aria-hidden="true" />Edit</Button>
        {open
          ? <Button className="h-12 rounded-lg text-body" onClick={() => setSheet({ kind: "done" })}><CheckCircle2 className="mr-1.5 h-5 w-5" aria-hidden="true" />Mark done</Button>
          : <Button variant="outline" className="h-12 rounded-lg bg-card text-body" onClick={reopen} disabled={reopening}><RotateCcw className="mr-1.5 h-4 w-4" aria-hidden="true" />Reopen</Button>}
      </ScreenBar>

      {missing.jobParts && <Notice tone="warning">Couldn't load the parts used on jobs, so this job's parts don't show for now.</Notice>}

      <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] md:items-start">
        <section aria-labelledby="job-details" className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
          <h3 id="job-details" className="flex items-center gap-2 border-b border-border bg-secondary/60 px-4 py-2 text-body-sm font-semibold">
            <span className="flex-1">Details</span>
            <StatusChip tone={open ? "warning" : "success"}>{open ? "Open" : "Done"}</StatusChip>
          </h3>
          <dl className="divide-y divide-border">
            <Detail label="Vehicle">{vehicle ? <Link to={`/workshop/${vehicle.kind}/${vehicle.id}`} className="font-medium text-primary underline underline-offset-2">{vehicle.name}</Link> : job.vehicle_name || "Not found"}</Detail>
            <Detail label="What's wrong">{job.symptom || <span className="text-muted-foreground">Not written</span>}</Detail>
            {job.fault_codes && <Detail label="Fault codes"><span className="tabular-nums">{job.fault_codes}</span></Detail>}
            {fault && <Detail label="Fault">{fault.title} <StatusChip status={fault.status}>{fault.status === "in_progress" ? "In progress" : fault.status === "resolved" ? "Resolved" : "Open"}</StatusChip></Detail>}
            {odometerText(job.odometer) && <Detail label="Odometer"><span className="tabular-nums">{odometerText(job.odometer)}</span></Detail>}
            <Detail label="Started">{dateText(job.created_date)}</Detail>
            {!open && <Detail label="Done">{[dateText(job.done_at), job.done_by && `by ${job.done_by}`].filter(Boolean).join(" ")}</Detail>}
            {(job.fix || !open) && <Detail label="What fixed it">{job.fix || <span className="text-muted-foreground">Not written</span>}</Detail>}
            {job.notes && <Detail label="Notes">{job.notes}</Detail>}
          </dl>
        </section>
        <div className="min-w-0 space-y-4">
          <Steps job={job} torques={torques} />
          <PartsUsed job={job} lines={lines} onAdd={() => setSheet({ kind: "part" })} onChange={(line) => setSheet({ kind: "part", line })} />
          {lines.length > 1 && <p className="text-body-sm text-muted-foreground">{[lines.filter(fromShelf).length && `${pluralize(lines.filter(fromShelf).length, "part")} from the shelf`, lines.some((l) => !fromShelf(l)) && `${lines.filter((l) => !fromShelf(l)).length} bought for this job`].filter(Boolean).join(" · ")}</p>}
        </div>
      </div>

      {sheet?.kind === "edit" && <JobEditSheet job={job} onClose={() => setSheet(null)} />}
      {sheet?.kind === "done" && <DoneSheet job={job} onClose={() => setSheet(null)} />}
      {sheet?.kind === "part" && <JobPartSheet job={job} line={sheet.line || null} onClose={() => setSheet(null)} />}
    </>
  );
}
