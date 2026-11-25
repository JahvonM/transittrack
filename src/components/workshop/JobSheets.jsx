import React, { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { useToast } from "@/components/ui/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { StatusChip } from "@/components/admin/kit";
import { StockChip } from "@/components/admin/partsCatalogueKit";
import { findVehicle, visibleParts } from "@/lib/workshop";
import { STATE_LABEL, odometerOf, odometerValue, reminderDaysFrom, servicesFor, ticksForJob, todayIso } from "@/lib/serviceDue";
import { markServiceDone, raiseOdometer } from "@/components/workshop/serviceSaves";
import {
  JOB_TEXT_LIMITS, PART_TEXT_LIMITS, faultOpen, fromShelf, isOpen, jobData, jobForm, jobProblem, jobWhen, newJobRecord,
  partLineProblem, partsOnJob, qtyText, shelfChange, shelfProblem, startForm, stepProgress, stockAfter,
} from "@/lib/workshopJobs";
import { EditSheet, FIELD, Field, pluralize, useWorkshop } from "@/components/workshop/kit";
import ScanSheet from "@/components/workshop/ScanSheet";
import { Minus, Package, Pencil, Plus, ScanLine, Search } from "lucide-react";

// The sheets a job is worked with: start one, edit it, mark it done, and add
// or change a part used. A part from the shelf comes off its stock in the
// database as it is saved, so after each save the part is read again and the
// count shown is the database's.

const today = () => new Date().toISOString().slice(0, 10);

// Reads a part again after its stock moved; if that fails, the list's copy
// is moved by the same amount (taken > 0, put back < 0).
export function useRefreshPart() {
  const { parts, put } = useWorkshop();
  return async (partId, taken = 0) => {
    if (!partId) return;
    try {
      const fresh = await base44.entities.Part.get(partId);
      if (fresh?.id) { put("parts", fresh); return; }
    } catch { /* moved locally below */ }
    const local = parts.find((p) => p.id === partId);
    if (local && taken) put("parts", stockAfter(local, taken));
  };
}

// One job in a list: what, where and when, its parts and steps, and Open or Done.
export function JobRow({ job, parts = [], showVehicle = true }) {
  const steps = stepProgress(job.steps || []);
  return (
    <li>
      <Link to={`/workshop/jobs/${job.id}`} className="flex min-h-[4.5rem] items-center gap-3 px-4 py-3 transition-colors hover:bg-secondary/60">
        <span className="min-w-0 flex-1">
          <span className="block truncate text-body font-semibold text-primary">{job.title || "Job"}</span>
          <span className="block truncate text-body-sm text-muted-foreground">
            {[showVehicle && job.vehicle_name, jobWhen(job), parts.length ? pluralize(parts.length, "part") : "", steps.total ? `${steps.done} of ${steps.total} steps` : ""].filter(Boolean).join(" · ")}
          </span>
        </span>
        <StatusChip tone={isOpen(job) ? "warning" : "success"}>{isOpen(job) ? "Open" : "Done"}</StatusChip>
      </Link>
    </li>
  );
}

function JobFields({ form, set, withFix = false, withNotes = false }) {
  return (
    <>
      <Field id="job-title" label="What's being done" hint="For example: Front brake pads, or Engine light on">
        <Input id="job-title" className="h-12 text-body md:text-body" value={form.title} onChange={set("title")} maxLength={JOB_TEXT_LIMITS.title} />
      </Field>
      <Field id="job-symptom" label="What's wrong" hint="What the driver or you noticed">
        <Textarea id="job-symptom" rows={3} className="text-body md:text-body" value={form.symptom} onChange={set("symptom")} maxLength={JOB_TEXT_LIMITS.symptom} />
      </Field>
      <Field id="job-codes" label="Fault codes" hint="From the code reader, for example P0401, P2002">
        <Input id="job-codes" className="h-12 text-body md:text-body" value={form.fault_codes} onChange={set("fault_codes")} maxLength={JOB_TEXT_LIMITS.fault_codes} autoCapitalize="characters" autoCorrect="off" spellCheck={false} />
      </Field>
      <Field id="job-odometer" label="Odometer (km)">
        <Input id="job-odometer" inputMode="numeric" className="h-12 text-body md:text-body" value={form.odometer} onChange={set("odometer")} />
      </Field>
      {withFix && (
        <Field id="job-fix" label="What fixed it" hint="Shows under Troubleshooting for the same model">
          <Textarea id="job-fix" rows={3} className="text-body md:text-body" value={form.fix} onChange={set("fix")} maxLength={JOB_TEXT_LIMITS.fix} />
        </Field>
      )}
      {withNotes && (
        <Field id="job-notes" label="Notes">
          <Textarea id="job-notes" rows={3} className="text-body md:text-body" value={form.notes} onChange={set("notes")} maxLength={JOB_TEXT_LIMITS.notes} />
        </Field>
      )}
    </>
  );
}

// Start a job: on the vehicle given, or one chosen here. A fault gives its
// words (and moves to in progress); a past fix gives its words and steps; a
// service (from a bus's Service section) gives its name.
export function NewJobSheet({ onClose, vehicle = null, fault = null, from = null, title = "" }) {
  const { toast } = useToast();
  const navigate = useNavigate();
  const { vehicles, put } = useWorkshop();
  const [pick, setPick] = useState("");
  const chosen = vehicle || vehicles.find((v) => `${v.kind}:${v.id}` === pick) || null;
  const [form, setForm] = useState(() => startForm(vehicle, { fault, from, title }));
  const [saving, setSaving] = useState(false);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const problem = chosen ? jobProblem(form) : "Choose the vehicle.";
  const steps = from?.steps || [];

  const choose = (e) => {
    setPick(e.target.value);
    const v = vehicles.find((x) => `${x.kind}:${x.id}` === e.target.value);
    if (v && !form.odometer) setForm((f) => ({ ...f, odometer: startForm(v).odometer }));
  };
  const save = async () => {
    setSaving(true);
    try {
      const saved = await base44.entities.WorkshopJob.create(newJobRecord(chosen, form, { fault, steps }));
      put("jobs", saved);
      if (fault?.status === "open") {
        base44.entities.Fault.update(fault.id, { status: "in_progress" })
          .then((f) => put("faults", f?.id ? f : { ...fault, status: "in_progress" }))
          .catch(() => toast({ title: "The job is started", description: "Couldn't mark the fault in progress. Change it in Faults." }));
      }
      onClose();
      navigate(`/workshop/jobs/${saved.id}`);
    } catch (e) {
      toast({ title: "Couldn't start the job", description: e?.message, variant: "destructive" });
      setSaving(false);
    }
  };

  return (
    <EditSheet
      open onClose={onClose} title="New job" saveLabel="Start job" saving={saving} problem={problem} onSave={save}
      description={[chosen?.name, fault && `Fault: ${fault.title}`].filter(Boolean).join(" · ") || "A repair or a service"}
    >
      {!vehicle && (
        <Field id="job-vehicle" label="Vehicle">
          <select id="job-vehicle" className={FIELD} value={pick} onChange={choose}>
            <option value="">Choose…</option>
            {vehicles.map((v) => <option key={`${v.kind}:${v.id}`} value={`${v.kind}:${v.id}`}>{v.name}{v.kind === "car" ? " (car)" : ""}</option>)}
          </select>
        </Field>
      )}
      {steps.length > 0 && <p className="rounded-xl bg-secondary px-3 py-2 text-body-sm">Starts with the {pluralize(steps.length, "step")} from “{from.title}”.</p>}
      <JobFields form={form} set={set} />
    </EditSheet>
  );
}

// Edit a job's words; an administrator can delete it (its shelf parts go back).
export function JobEditSheet({ job, onClose }) {
  const { toast } = useToast();
  const navigate = useNavigate();
  const refresh = useRefreshPart();
  const { jobParts, put, drop, isAdmin } = useWorkshop();
  const [form, setForm] = useState(() => jobForm(job));
  const [saving, setSaving] = useState(false);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const problem = jobProblem(form);
  const lines = partsOnJob(jobParts, job.id);
  const back = lines.filter(fromShelf);

  const save = async () => {
    const data = jobData(form, job);
    if (!Object.keys(data).length) { onClose(); return; }
    setSaving(true);
    try {
      put("jobs", await base44.entities.WorkshopJob.update(job.id, data));
      onClose();
    } catch (e) {
      toast({ title: "Couldn't save the job", description: e?.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };
  const remove = async () => {
    setSaving(true);
    try {
      await base44.entities.WorkshopJob.delete(job.id);
      drop("jobs", job.id);
      for (const line of lines) drop("jobParts", line.id);
      await Promise.all(back.map((line) => refresh(line.part_id, -Number(line.qty))));
      onClose();
      navigate("/workshop/jobs", { replace: true });
    } catch (e) {
      toast({ title: "Couldn't delete the job", description: e?.message, variant: "destructive" });
      setSaving(false);
    }
  };

  return (
    <EditSheet
      open onClose={onClose} title="Edit job" description={job.vehicle_name} saving={saving} problem={problem} onSave={save}
      onDelete={isAdmin ? remove : undefined}
      deleteLabel={back.length ? `Delete job: ${back.length === 1 ? "its part goes" : `its ${back.length} parts go`} back on the shelf` : "Delete job"}
    >
      <JobFields form={form} set={set} withFix={!isOpen(job) || !!job.fix} withNotes />
    </EditSheet>
  );
}

// Mark a job done: what fixed it (for Troubleshooting) and the odometer, the
// fault it fixes marked resolved too, and on a bus the services it covered
// ticked off (one started from a service comes with it ticked). A higher
// odometer reading moves the bus's up.
export function DoneSheet({ job, onClose }) {
  const { toast } = useToast();
  const { faults, vehicles, schedules, serviceSettings, missing, put } = useWorkshop();
  const fault = job.fault_id ? faults.find((f) => f.id === job.fault_id) || null : null;
  const vehicle = job.vehicle_kind === "bus" ? findVehicle(vehicles, "bus", job.vehicle_id) : null;
  const reminderDays = reminderDaysFrom(serviceSettings);
  const services = useMemo(() => (vehicle && !missing.schedules ? servicesFor(schedules, vehicle, { reminderDays }) : []), [vehicle, schedules, missing.schedules, reminderDays]);
  const [form, setForm] = useState(() => ({ fix: job.fix || "", odometer: job.odometer != null ? String(job.odometer) : "" }));
  const [resolve, setResolve] = useState(faultOpen(fault));
  const [ticked, setTicked] = useState(() => new Set(ticksForJob(job, services)));
  const [saving, setSaving] = useState(false);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const tick = (id) => (e) => setTicked((t) => { const next = new Set(t); if (e.target.checked) next.add(id); else next.delete(id); return next; });
  const problem = jobProblem(form);

  const save = async () => {
    setSaving(true);
    try {
      put("jobs", await base44.entities.WorkshopJob.update(job.id, { ...jobData(form, job), status: "done" }));
    } catch (e) {
      toast({ title: "Couldn't mark the job done", description: e?.message, variant: "destructive" });
      setSaving(false);
      return;
    }
    // The job is done; what follows is told apart if it fails.
    if (resolve && fault) {
      try {
        const saved = await base44.entities.Fault.update(fault.id, { status: "resolved", resolved_date: today() });
        put("faults", saved?.id ? saved : { ...fault, status: "resolved" });
      } catch {
        toast({ title: "The job is done", description: "Couldn't mark the fault resolved. Change it in Faults." });
      }
    }
    if (vehicle) {
      const reading = odometerValue(form.odometer);
      const odometer = Math.max(reading, odometerOf(vehicle));
      let failed = 0;
      for (const item of services.filter((i) => ticked.has(i.schedule.id))) {
        try {
          put("schedules", await markServiceDone(item.schedule, { date: todayIso(), odometer: odometer ? String(odometer) : "" }, { odometer, reminderDays }));
        } catch {
          failed += 1;
        }
      }
      if (failed) toast({ title: "The job is done", description: `Couldn't mark ${pluralize(failed, "service")} done. Mark ${failed === 1 ? "it" : "them"} in the bus's Service section.` });
      try {
        const bus = await raiseOdometer(vehicle, reading);
        if (bus) put("buses", bus);
      } catch {
        // The job keeps its reading; the bus's updates with its next one.
      }
    }
    onClose();
  };

  return (
    <EditSheet open onClose={onClose} title="Mark done" description={job.title} saveLabel="Mark done" saving={saving} problem={problem} onSave={save}>
      <Field id="done-fix" label="What fixed it?" hint="Shows under Troubleshooting for the same model, so the next time is quicker">
        <Textarea id="done-fix" rows={4} className="text-body md:text-body" value={form.fix} onChange={set("fix")} maxLength={JOB_TEXT_LIMITS.fix} />
      </Field>
      <Field id="done-odometer" label="Odometer (km)">
        <Input id="done-odometer" inputMode="numeric" className="h-12 text-body md:text-body" value={form.odometer} onChange={set("odometer")} />
      </Field>
      {fault && faultOpen(fault) && (
        <label className="flex min-h-[3rem] items-center gap-3 rounded-xl border border-border bg-card px-3 text-body">
          <input type="checkbox" className="h-5 w-5" checked={resolve} onChange={(e) => setResolve(e.target.checked)} />
          <span>Mark the fault “{fault.title}” resolved</span>
        </label>
      )}
      {services.length > 0 && (
        <fieldset className="space-y-2">
          <legend className="mb-1 text-body-sm font-semibold">Services done on this job</legend>
          {services.map((item) => (
            <label key={item.schedule.id} className="flex min-h-[3rem] items-center gap-3 rounded-xl border border-border bg-card px-3 py-2 text-body">
              <input type="checkbox" className="h-5 w-5" checked={ticked.has(item.schedule.id)} onChange={tick(item.schedule.id)} />
              <span className="min-w-0 flex-1">
                <span className="block">{item.schedule.service_type}</span>
                <span className="block text-caption text-muted-foreground">{STATE_LABEL[item.state]} · {item.text}</span>
              </span>
            </label>
          ))}
          <p className="text-caption text-muted-foreground">Each one ticked is recorded as done today at this odometer.</p>
        </fieldset>
      )}
    </EditSheet>
  );
}

// Add a part to a job (find it, scan it, or write in one bought for the job)
// or change one already on it. From the shelf, the amount comes off the
// stock as it is saved, and the shelf must have it.
export function JobPartSheet({ job, line = null, onClose }) {
  const { toast } = useToast();
  const refresh = useRefreshPart();
  const { parts, interchanges, put, drop } = useWorkshop();
  const listed = line?.part_id ? parts.find((p) => p.id === line.part_id) || null : null;
  const gone = !!line?.part_id && !listed;
  // The part is read from the Workshop's list each time, so a count read
  // again after a save (or a refusal) shows here at once.
  const [partId, setPartId] = useState(line?.part_id || "");
  const part = partId ? parts.find((p) => p.id === partId) || null : null;
  const [writing, setWriting] = useState(!!line && !line.part_id);
  const [name, setName] = useState(line && !line.part_id ? line.part_name || "" : "");
  const [number, setNumber] = useState(line && !line.part_id ? line.part_number || "" : "");
  const [qty, setQty] = useState(line ? qtyText(line.qty) : "1");
  const [fromStock, setFromStock] = useState(line ? fromShelf(line) : true);
  const [query, setQuery] = useState("");
  const [scanning, setScanning] = useState(false);
  const [saving, setSaving] = useState(false);
  const matches = useMemo(() => (query.trim() ? visibleParts(parts, interchanges, { query }).slice(0, 8) : []), [parts, interchanges, query]);
  const already = line && fromShelf(line) ? Number(line.qty) : 0;
  const picking = !line && !part && !writing;
  const shelfShort = !!part && !writing && fromStock && !!shelfProblem(part, qty, already);
  const problem = gone ? "This part is no longer in your parts list. It can still be removed from the job."
    : picking ? "Find the part, scan it, or write it in."
      : partLineProblem({ part: writing ? null : part, name, number, qty, fromStock: !writing && fromStock, already });

  const step = (d) => setQty((q) => qtyText(Math.max(1, Math.floor(Number(q) || 0) + d)));
  const pickPart = (p) => { setPartId(p.id); setWriting(false); setFromStock(true); setQuery(""); };
  const writeIn = (num = "") => {
    setWriting(true); setPartId(""); setFromStock(false);
    if (num) setNumber(num);
    else if (/\d/.test(query)) setNumber(query.trim()); else if (query.trim()) setName(query.trim());
  };

  const save = async () => {
    setSaving(true);
    try {
      if (!line) {
        const record = writing
          ? { job_id: job.id, part_name: name.trim(), part_number: number.trim(), qty: Number(qty), from_stock: false }
          : { job_id: job.id, part_id: part.id, qty: Number(qty), from_stock: fromStock };
        const saved = await base44.entities.WorkshopJobPart.create(record);
        put("jobParts", saved);
        if (fromShelf(saved)) await refresh(saved.part_id, Number(saved.qty));
      } else {
        const patch = {};
        if (Number(qty) !== Number(line.qty)) patch.qty = Number(qty);
        if (line.part_id && fromStock !== fromShelf(line)) patch.from_stock = fromStock;
        if (!line.part_id && name.trim() !== (line.part_name || "")) patch.part_name = name.trim();
        if (!line.part_id && number.trim() !== (line.part_number || "")) patch.part_number = number.trim();
        if (Object.keys(patch).length) {
          const saved = await base44.entities.WorkshopJobPart.update(line.id, patch);
          const after = saved?.id ? saved : { ...line, ...patch };
          put("jobParts", after);
          const change = shelfChange(line, after);
          if (change) await refresh(line.part_id, change);
        }
      }
      onClose();
    } catch (e) {
      toast({ title: line ? "Couldn't change the part" : "Couldn't add the part", description: e?.message, variant: "destructive" });
      // The shelf may hold fewer than this screen thought: show what it has now.
      if (part) refresh(part.id, 0);
      setSaving(false);
    }
  };
  const remove = async () => {
    setSaving(true);
    try {
      await base44.entities.WorkshopJobPart.delete(line.id);
      drop("jobParts", line.id);
      if (fromShelf(line)) await refresh(line.part_id, -Number(line.qty));
      onClose();
    } catch (e) {
      toast({ title: "Couldn't remove the part", description: e?.message, variant: "destructive" });
      setSaving(false);
    }
  };

  return (
    <>
      <EditSheet
        open onClose={onClose} title={line ? "Part used" : "Add a part"} description={job.title} saveLabel={line ? "Save" : "Add"}
        saving={saving} problem={problem} onSave={save}
        onDelete={line ? remove : undefined}
        deleteLabel={line && fromShelf(line) ? `Remove from the job (${qtyText(line.qty)} back on the shelf)` : "Remove from the job"}
      >
        {picking && (
          <section aria-label="Find the part" className="space-y-3">
            <div className="flex gap-2">
              <div className="relative min-w-0 flex-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Name or any part number" aria-label="Find a part" className="h-12 rounded-lg bg-card pl-10 text-body md:text-body" />
              </div>
              <Button type="button" variant="outline" className="h-12 rounded-lg bg-card text-body" onClick={() => setScanning(true)}><ScanLine className="mr-1.5 h-4 w-4" aria-hidden="true" />Scan</Button>
            </div>
            {matches.length > 0 && (
              <ul aria-label="Matching parts" className="divide-y divide-border rounded-lg border border-border">
                {matches.map((p) => (
                  <li key={p.id}>
                    <button type="button" onClick={() => pickPart(p)} className="flex min-h-[3.5rem] w-full items-center gap-3 px-3 py-2 text-left hover:bg-secondary/60">
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-semibold text-primary">{p.part_name}</span>
                        <span className="block truncate text-body-sm text-muted-foreground">{[p.oem_number, p.aftermarket_number, p.bin_location].filter(Boolean).join(" · ")}</span>
                      </span>
                      <StockChip part={p} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {query.trim() && matches.length === 0 && <p className="text-body-sm text-muted-foreground">Nothing in your parts matches.</p>}
            <Button type="button" variant="ghost" className="h-12 rounded-lg text-body" onClick={() => writeIn()}><Pencil className="mr-1.5 h-4 w-4" aria-hidden="true" />Not on your list? Write it in</Button>
          </section>
        )}

        {(part || gone) && !writing && (
          <div className="flex items-start gap-3 rounded-xl border border-border bg-card p-3">
            <Package className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <p className="font-semibold">{part?.part_name || line?.part_name}</p>
              <p className="text-body-sm tabular-nums text-muted-foreground">{part ? [part.oem_number, part.aftermarket_number, part.bin_location].filter(Boolean).join(" · ") : line?.part_number}</p>
              {part && <StockChip part={part} className="mt-1" />}
            </div>
            {!line && <Button type="button" variant="ghost" className="h-10 rounded-lg" onClick={() => setPartId("")}>Change</Button>}
            {line && part && <Button asChild variant="ghost" className="h-10 rounded-lg"><Link to={`/workshop/parts/${part.id}`} onClick={onClose}>Its page</Link></Button>}
          </div>
        )}

        {writing && (
          <>
            <p className="rounded-xl bg-secondary px-3 py-2 text-body-sm">Bought for this job: it doesn't come off the shelf.</p>
            <Field id="jp-name" label="Part">
              <Input id="jp-name" className="h-12 text-body md:text-body" value={name} onChange={(e) => setName(e.target.value)} maxLength={PART_TEXT_LIMITS.part_name} placeholder="Fan belt (NAPA)" />
            </Field>
            <Field id="jp-number" label="Part number">
              <Input id="jp-number" className="h-12 text-body md:text-body" value={number} onChange={(e) => setNumber(e.target.value)} maxLength={PART_TEXT_LIMITS.part_number} autoCapitalize="characters" autoCorrect="off" spellCheck={false} />
            </Field>
            {!line && <Button type="button" variant="ghost" className="h-12 rounded-lg text-body" onClick={() => { setWriting(false); setName(""); setNumber(""); setFromStock(true); }}>Find it in your parts instead</Button>}
          </>
        )}

        {!picking && !gone && (
          <>
            <Field id="jp-qty" label="How many">
              <div className="flex items-center gap-2">
                <Button type="button" variant="outline" className="h-12 w-12 rounded-lg" onClick={() => step(-1)} disabled={Number(qty) <= 1} aria-label="One fewer"><Minus className="h-5 w-5" aria-hidden="true" /></Button>
                <Input id="jp-qty" inputMode="decimal" className="h-12 w-24 text-center text-body tabular-nums md:text-body" value={qty} onChange={(e) => setQty(e.target.value)} />
                <Button type="button" variant="outline" className="h-12 w-12 rounded-lg" onClick={() => step(1)} aria-label="One more"><Plus className="h-5 w-5" aria-hidden="true" /></Button>
              </div>
            </Field>
            {part && (
              <fieldset className="space-y-2">
                <legend className="mb-1.5 text-body-sm font-semibold">Where it came from</legend>
                {[[true, "From the shelf", "Comes off the stock"], [false, "Bought for this job", "The stock stays as it is"]].map(([value, label, hint]) => (
                  <label key={label} className="flex min-h-[3rem] items-center gap-3 rounded-xl border border-border bg-card px-3 text-body">
                    <input type="radio" name="jp-from" className="h-5 w-5" checked={fromStock === value} onChange={() => setFromStock(value)} />
                    <span><span className="font-medium">{label}</span> <span className="text-body-sm text-muted-foreground">· {hint}</span></span>
                  </label>
                ))}
              </fieldset>
            )}
            {shelfShort && (
              <div className="flex flex-wrap gap-2">
                <Button asChild variant="outline" className="h-12 rounded-lg bg-card text-body"><Link to={`/workshop/parts/${part.id}`} onClick={onClose}>Fix the count</Link></Button>
                <Button type="button" variant="outline" className="h-12 rounded-lg bg-card text-body" onClick={() => setFromStock(false)}>Bought for this job</Button>
              </div>
            )}
          </>
        )}
      </EditSheet>
      <ScanSheet open={scanning} onOpenChange={setScanning} onPick={pickPart} onNotFound={(num) => writeIn(num)} />
    </>
  );
}
