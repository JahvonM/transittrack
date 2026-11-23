import React, { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { JOB_SHOW, isOpen, partsOnJob, visibleJobs } from "@/lib/workshopJobs";
import { Notice, ScreenBar, useWorkshop } from "@/components/workshop/kit";
import { JobRow, NewJobSheet } from "@/components/workshop/JobSheets";
import { Plus, RefreshCw, Search } from "lucide-react";

// Every job in the workshop: the open ones first, then the done ones, found
// by what was done, the vehicle, a fault code or a part used.
export default function JobsPage() {
  const { jobs, jobParts, missing, reload } = useWorkshop();
  const [query, setQuery] = useState("");
  const [show, setShow] = useState("open");
  const [starting, setStarting] = useState(false);
  const list = useMemo(() => visibleJobs(jobs, jobParts, { query, show }), [jobs, jobParts, query, show]);
  const open = jobs.filter(isOpen).length;
  const count = { open, done: jobs.length - open, all: jobs.length };

  return (
    <>
      <ScreenBar crumbs={[{ to: "/workshop", label: "Workshop" }, { label: "Jobs" }]} title="Jobs" subtitle={`${open} open · ${jobs.length - open} done`}>
        <Button className="h-12 rounded-lg text-body" onClick={() => setStarting(true)}><Plus className="mr-1.5 h-5 w-5" aria-hidden="true" />New job</Button>
      </ScreenBar>

      {missing.jobs && (
        <Notice tone="danger" action={<Button variant="outline" className="h-12 rounded-lg bg-card" onClick={reload}><RefreshCw className="mr-1.5 h-4 w-4" aria-hidden="true" />Try again</Button>}>
          Couldn't load the jobs. Check the connection.
        </Notice>
      )}
      {missing.jobParts && !missing.jobs && <Notice tone="warning">Couldn't load the parts used on jobs, so they don't show for now.</Notice>}

      {jobs.length > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <div className="relative min-w-[220px] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="What, a vehicle, a fault code or a part" aria-label="Find a job" className="h-12 rounded-lg bg-card pl-10 text-body md:text-body" />
          </div>
          <div role="group" aria-label="Which jobs" className="flex rounded-lg border border-border bg-card p-1">
            {JOB_SHOW.map((s) => (
              <button
                key={s.id} type="button" aria-pressed={show === s.id} onClick={() => setShow(s.id)}
                className={`h-10 rounded-md px-3 text-body-sm font-semibold ${show === s.id ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}
              >
                {s.label} {count[s.id]}
              </button>
            ))}
          </div>
        </div>
      )}

      {jobs.length === 0 && !missing.jobs ? (
        <Notice>No jobs yet. Tap New job, or start one from a vehicle's Jobs.</Notice>
      ) : list.length === 0 && jobs.length > 0 ? (
        <p className="py-6 text-center text-body text-muted-foreground">{query.trim() ? "Nothing matches." : show === "open" ? "No open jobs." : "No done jobs yet."}</p>
      ) : list.length > 0 && (
        <ul aria-label="Jobs" className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-card shadow-sm">
          {list.map((job) => <JobRow key={job.id} job={job} parts={partsOnJob(jobParts, job.id)} />)}
        </ul>
      )}

      {starting && <NewJobSheet onClose={() => setStarting(false)} />}
    </>
  );
}
