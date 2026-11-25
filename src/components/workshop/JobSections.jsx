import React, { useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StatusChip } from "@/components/admin/kit";
import {
  dateText, jobForFault, jobsFor, knownProblems, openFaultsFor, partsOnJob, partsSummary, pastFixes, sortJobs,
} from "@/lib/workshopJobs";
import { Notice, pluralize, useWorkshop } from "@/components/workshop/kit";
import { JobRow, NewJobSheet } from "@/components/workshop/JobSheets";
import { Plus, RefreshCw, Search } from "lucide-react";

// A vehicle's Jobs (its open faults to start on, and its jobs) and its
// Troubleshooting (the model's known problems, and the fixes done jobs on
// any vehicle of the same model wrote down).

const SEVERITY_TONE = { low: "neutral", medium: "warning", high: "danger", critical: "danger" };

// A New job sheet opened from the address: ?fault=<id> (Start a job on a
// fault, also from Faults elsewhere) or ?from=<job id> (Use these steps).
function useStartFromAddress(jobs, faults) {
  const [params, setParams] = useSearchParams();
  const fault = params.get("fault") ? faults.find((f) => f.id === params.get("fault")) || null : null;
  const from = params.get("from") ? jobs.find((j) => j.id === params.get("from")) || null : null;
  const clear = () => setParams((p) => { p.delete("fault"); p.delete("from"); return p; }, { replace: true });
  return { fault, from, asked: !!(fault || from), clear };
}

export function JobsSection({ vehicle }) {
  const { jobs, jobParts, faults, missing, reload } = useWorkshop();
  const [starting, setStarting] = useState(null);
  const asked = useStartFromAddress(jobs, faults);
  const mine = useMemo(() => sortJobs(jobsFor(jobs, vehicle)), [jobs, vehicle]);
  const open = openFaultsFor(faults, vehicle);
  const sheet = starting || (asked.asked ? { fault: asked.fault, from: asked.from } : null);
  const close = () => { setStarting(null); if (asked.asked) asked.clear(); };

  return (
    <section aria-labelledby="jobs-title">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h3 id="jobs-title" className="flex-1 text-title-sm font-semibold">Jobs</h3>
        <Button className="h-12 rounded-lg text-body" onClick={() => setStarting({})}><Plus className="mr-1.5 h-5 w-5" aria-hidden="true" />New job</Button>
      </div>
      {(missing.jobs || missing.faults) && (
        <Notice tone="danger" action={<Button variant="outline" className="h-12 rounded-lg bg-card" onClick={reload}><RefreshCw className="mr-1.5 h-4 w-4" aria-hidden="true" />Try again</Button>}>
          Couldn't load the {missing.jobs && missing.faults ? "jobs or faults" : missing.jobs ? "jobs" : "faults"}. Check the connection.
        </Notice>
      )}

      {open.length > 0 && (
        <section aria-labelledby="faults-title" className="mb-4 rounded-xl border border-warning/40 bg-warning/10 p-3">
          <h4 id="faults-title" className="mb-2 px-1 text-body-sm font-semibold">{pluralize(open.length, "open fault")}</h4>
          <ul className="space-y-2">
            {open.map((fault) => {
              const job = jobForFault(jobs, fault);
              return (
                <li key={fault.id} className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-card px-3 py-2">
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold">{fault.title}</span>
                    <span className="block text-body-sm text-muted-foreground">{[fault.description, dateText(fault.created_date)].filter(Boolean).join(" · ")}</span>
                  </span>
                  {fault.severity && <StatusChip tone={SEVERITY_TONE[fault.severity] || "neutral"}>{fault.severity[0].toUpperCase() + fault.severity.slice(1)}</StatusChip>}
                  {job
                    ? <Button asChild variant="outline" className="h-11 rounded-lg bg-card"><Link to={`/workshop/jobs/${job.id}`}>Open its job</Link></Button>
                    : <Button className="h-11 rounded-lg" onClick={() => setStarting({ fault })} aria-label={`Start a job on ${fault.title}`}>Start a job</Button>}
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {mine.length === 0 && !missing.jobs ? (
        <Notice>No jobs on {vehicle.name} yet. Tap New job to start one.</Notice>
      ) : mine.length > 0 && (
        <ul aria-label={`Jobs on ${vehicle.name}`} className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-card shadow-sm">
          {mine.map((job) => <JobRow key={job.id} job={job} parts={partsOnJob(jobParts, job.id)} showVehicle={false} />)}
        </ul>
      )}
      {sheet && <NewJobSheet vehicle={vehicle} fault={sheet.fault || null} from={sheet.from || null} onClose={close} />}
    </section>
  );
}

export function TroubleshootingSection({ vehicle, guide, base }) {
  const navigate = useNavigate();
  const { jobs, jobParts, facts, missing } = useWorkshop();
  const [query, setQuery] = useState("");
  const problems = knownProblems(facts, guide?.id, query);
  const fixes = pastFixes(jobs, jobParts, { guideId: guide?.id || "", vehicle, query });
  const searching = !!query.trim();

  return (
    <section aria-labelledby="trouble-title">
      <h3 id="trouble-title" className="mb-1 text-title-sm font-semibold">Troubleshooting</h3>
      <p className="mb-3 text-body-sm text-muted-foreground">
        {guide ? "What goes wrong on this model, and what fixed it on any of the fleet's vehicles of the same model." : "What fixed problems on this vehicle before. A model page would add the model's known problems."}
      </p>
      <div className="relative mb-4">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
        <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="A symptom, a fault code or a part" aria-label="Search problems and fixes" className="h-12 rounded-lg bg-card pl-10 text-body md:text-body" />
      </div>

      {guide && (
        <section aria-labelledby="known-title" className="mb-5">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <h4 id="known-title" className="flex-1 text-body font-semibold">Known problems</h4>
            <Link to={`${base}/specs`} className="text-body-sm font-medium text-primary underline underline-offset-2">Edit in Specs & service</Link>
          </div>
          {missing.facts ? <p className="text-body-sm text-muted-foreground">Couldn't load the known problems.</p>
            : problems.length === 0 ? <p className="text-body-sm text-muted-foreground">{searching ? "None match." : "None written for this model yet. Add them in Specs & service, under Known problems."}</p>
              : (
                <ul className="space-y-2">
                  {problems.map((f) => (
                    <li key={f.id} className="rounded-lg border border-border bg-card p-3">
                      <p className="font-semibold">{f.label}</p>
                      {f.value && <p className="text-body">{f.value}</p>}
                      {f.detail && <p className="mt-1 whitespace-pre-line text-body-sm text-muted-foreground">{f.detail}</p>}
                      <div className="mt-1 flex flex-wrap items-center gap-2 text-caption text-muted-foreground">
                        {f.applies_to && <span>{f.applies_to}</span>}
                        {f.status !== "checked" && <StatusChip tone="warning">{f.status === "wrong" ? "Marked wrong" : "Not checked"}</StatusChip>}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
        </section>
      )}

      <section aria-labelledby="fixes-title">
        <h4 id="fixes-title" className="mb-2 text-body font-semibold">Past fixes</h4>
        {missing.jobs ? <p className="text-body-sm text-muted-foreground">Couldn't load the jobs.</p>
          : fixes.length === 0 ? <p className="text-body-sm text-muted-foreground">{searching ? "None match." : "None yet. When a job is marked done with what fixed it, it shows here."}</p>
            : (
              <ul className="space-y-2">
                {fixes.map((job) => {
                  const used = partsOnJob(jobParts, job.id);
                  return (
                    <li key={job.id} className="rounded-lg border border-border bg-card p-3">
                      <p className="font-semibold">{job.title}</p>
                      <p className="text-body-sm text-muted-foreground">{[job.vehicle_name, dateText(job.done_at)].filter(Boolean).join(" · ")}</p>
                      <dl className="mt-2 space-y-1 text-body">
                        {job.symptom && <div><dt className="inline font-semibold">Wrong: </dt><dd className="inline whitespace-pre-line">{job.symptom}</dd></div>}
                        {job.fault_codes && <div><dt className="inline font-semibold">Codes: </dt><dd className="inline tabular-nums">{job.fault_codes}</dd></div>}
                        {job.fix && <div><dt className="inline font-semibold">Fixed by: </dt><dd className="inline whitespace-pre-line">{job.fix}</dd></div>}
                        {used.length > 0 && <div><dt className="inline font-semibold">Parts: </dt><dd className="inline">{partsSummary(used)}</dd></div>}
                      </dl>
                      <div className="mt-2 flex flex-wrap gap-2">
                        <Button asChild variant="outline" className="h-11 rounded-lg bg-card"><Link to={`/workshop/jobs/${job.id}`}>Open the job</Link></Button>
                        {(job.steps || []).length > 0 && (
                          <Button variant="outline" className="h-11 rounded-lg bg-card" onClick={() => navigate(`${base}/jobs?from=${encodeURIComponent(job.id)}`)} aria-label={`Use the steps from ${job.title}`}>
                            Use these steps
                          </Button>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
      </section>
    </section>
  );
}
