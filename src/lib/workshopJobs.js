// Workshop jobs: the work done on a bus or car (what was wrong, the steps,
// the parts used and what fixed it) and what done jobs teach about a model
// (Troubleshooting's past fixes). The stock moves in the database as a job's
// parts are saved (supabase/migrations/*_workshop_job_stock.sql); the stock
// helpers here mirror that rule, so the screen can say "Only 2 left" first.
import { matchesSearch } from "./busLibrary.js";

export const JOB_TEXT_LIMITS = { title: 120, symptom: 2000, fault_codes: 200, fix: 4000, notes: 4000 };
const LABELS = { title: "What's being done", symptom: "What's wrong", fault_codes: "Fault codes", fix: "What fixed it", notes: "Notes" };
export const MAX_STEPS = 60;
export const STEP_LIMIT = 300;
export const MAX_ODOMETER = 5_000_000;
export const MAX_JOB_QTY = 10_000;
export const PART_TEXT_LIMITS = { part_name: 200, part_number: 60 };

// ----- the job form -----

const FORM_FIELDS = ["title", "symptom", "fault_codes", "odometer", "fix", "notes"];
const odometerOf = (text) => String(text ?? "").replace(/[,\s]/g, "");

export function jobForm(job = {}) {
  return Object.fromEntries(FORM_FIELDS.map((k) => [k, job[k] == null ? "" : String(job[k])]));
}

// A new job's form on a vehicle: a bus's odometer fills in, and a fault, a
// past fix or a service (its name) gives its words.
export function startForm(vehicle, { fault = null, from = null, title = "" } = {}) {
  const odometer = vehicle?.kind === "bus" && Number(vehicle.record?.current_odometer) > 0 ? String(Math.round(vehicle.record.current_odometer)) : "";
  return {
    ...jobForm(),
    title: fault?.title || from?.title || String(title || "").slice(0, JOB_TEXT_LIMITS.title),
    symptom: fault?.description || from?.symptom || "",
    fault_codes: "",
    odometer,
  };
}

// The fields of the form to save: all of them for a new job, only what
// changed for one being edited (so a tick on another screen isn't undone).
export function jobData(form, existing = null) {
  const data = {};
  for (const k of FORM_FIELDS) {
    if (!(k in form)) continue;
    const text = String(form[k] ?? "").trim();
    const value = k === "odometer" ? (odometerOf(text) === "" ? null : Number(odometerOf(text))) : text;
    const before = existing ? (k === "odometer" ? existing.odometer ?? null : existing[k] ?? "") : undefined;
    if (!existing || before !== value) data[k] = value;
  }
  return data;
}

export function jobProblem(form) {
  const t = (k) => String(form[k] ?? "").trim();
  if ("title" in form && !t("title")) return "Say what the job is.";
  for (const [k, max] of Object.entries(JOB_TEXT_LIMITS)) if (t(k).length > max) return `${LABELS[k]} is too long (up to ${max.toLocaleString("en")} characters).`;
  const odometer = odometerOf(t("odometer"));
  if (odometer && !(/^\d+$/.test(odometer) && Number(odometer) <= MAX_ODOMETER)) return "The odometer is a whole number of km.";
  return "";
}

// What to send to start a job on a vehicle (its model page goes with it).
export function newJobRecord(vehicle, form, { fault = null, steps = [] } = {}) {
  return {
    vehicle_kind: vehicle.kind,
    vehicle_id: vehicle.id,
    ...(vehicle.guide ? { guide_id: vehicle.guide.id } : {}),
    ...(fault ? { fault_id: fault.id } : {}),
    ...jobData(form),
    ...(steps.length ? { steps: copySteps(steps) } : {}),
  };
}

// ----- steps -----

// Another job's steps, unticked, for a new job (Use these steps).
export const copySteps = (steps = []) => steps.filter((s) => String(s?.text || "").trim()).slice(0, MAX_STEPS)
  .map((s) => ({ text: String(s.text).trim().slice(0, STEP_LIMIT), done: false, ...(s.torque_id ? { torque_id: s.torque_id } : {}) }));
export const stepProgress = (steps = []) => ({ done: steps.filter((s) => s.done).length, total: steps.length });
export function stepProblem(text, steps = []) {
  const t = String(text ?? "").trim();
  if (!t) return "Write the step first.";
  if (t.length > STEP_LIMIT) return `A step is up to ${STEP_LIMIT} characters.`;
  if (steps.length >= MAX_STEPS) return `A job can have up to ${MAX_STEPS} steps.`;
  return "";
}

// ----- lists -----

const startedAt = (j) => String(j.created_date || "");
const finishedAt = (j) => String(j.done_at || j.updated_date || j.created_date || "");
// Open jobs first, newest started first; then done ones, newest done first.
export function sortJobs(jobs = []) {
  const open = jobs.filter((j) => j.status !== "done").sort((a, b) => startedAt(b).localeCompare(startedAt(a)));
  const done = jobs.filter((j) => j.status === "done").sort((a, b) => finishedAt(b).localeCompare(finishedAt(a)));
  return [...open, ...done];
}
export const isOpen = (job) => job?.status !== "done";
export const jobsFor = (jobs = [], vehicle) => (vehicle ? jobs.filter((j) => j.vehicle_kind === vehicle.kind && j.vehicle_id === vehicle.id) : []);
export const openJobsFor = (jobs = [], vehicle) => jobsFor(jobs, vehicle).filter(isOpen);
export const partsOnJob = (jobParts = [], jobId) => jobParts.filter((p) => p.job_id === jobId)
  .sort((a, b) => String(a.created_date || "").localeCompare(String(b.created_date || "")));

export const jobText = (job, parts = []) => [job.title, job.symptom, job.fault_codes, job.fix, job.notes, job.vehicle_name, ...parts.flatMap((p) => [p.part_name, p.part_number])];

export const JOB_SHOW = [
  { id: "open", label: "Open" },
  { id: "done", label: "Done" },
  { id: "all", label: "All" },
];
export function visibleJobs(jobs = [], jobParts = [], { query = "", show = "open" } = {}) {
  return sortJobs(jobs)
    .filter((j) => show === "all" || (show === "done" ? !isOpen(j) : isOpen(j)))
    .filter((j) => matchesSearch(query, ...jobText(j, partsOnJob(jobParts, j.id))));
}

// The jobs a part was used on, newest first, each with what was used.
export function jobsUsingPart(jobParts = [], jobs = [], partId) {
  const byId = new Map(jobs.map((j) => [j.id, j]));
  return jobParts.filter((p) => p.part_id === partId && byId.has(p.job_id))
    .map((line) => ({ job: byId.get(line.job_id), line }))
    .sort((a, b) => finishedAt(b.job).localeCompare(finishedAt(a.job)));
}

// ----- faults -----

export const faultOpen = (fault) => fault && fault.status !== "resolved";
export const openFaultsFor = (faults = [], vehicle) =>
  (vehicle?.kind === "bus" ? faults.filter((f) => f.vehicle_id === vehicle.id && faultOpen(f)) : [])
    .sort((a, b) => String(b.created_date || "").localeCompare(String(a.created_date || "")));
export const jobForFault = (jobs = [], fault) => jobs.find((j) => j.fault_id === fault?.id && isOpen(j)) || null;

// ----- troubleshooting -----

// Done jobs that say what was wrong or what fixed it, on any vehicle using
// the same model page (without one, this vehicle's own), newest first.
export function pastFixes(jobs = [], jobParts = [], { guideId = "", vehicle = null, query = "" } = {}) {
  return jobs
    .filter((j) => j.status === "done" && (j.symptom || j.fix || j.fault_codes))
    .filter((j) => (guideId ? j.guide_id === guideId : !!vehicle && j.vehicle_kind === vehicle.kind && j.vehicle_id === vehicle.id))
    .filter((j) => matchesSearch(query, ...jobText(j, partsOnJob(jobParts, j.id))))
    .sort((a, b) => finishedAt(b).localeCompare(finishedAt(a)));
}
// The model's known problems (Specs & service › Known problems).
export const knownProblems = (facts = [], guideId, query = "") => (guideId
  ? facts.filter((f) => f.guide_id === guideId && f.section === "problems" && matchesSearch(query, f.label, f.value, f.detail, f.applies_to))
    .sort((a, b) => (Number(a.sort_order) || 0) - (Number(b.sort_order) || 0))
  : []);

// ----- parts on a job, and the shelf -----

export const qtyText = (n) => String(Math.round((Number(n) || 0) * 100) / 100);
// The parts a job used, each name once with how many: "Oil filter × 2, Gasket".
export function partsSummary(lines = []) {
  const totals = new Map();
  for (const line of lines) totals.set(line.part_name, (totals.get(line.part_name) || 0) + (Number(line.qty) || 0));
  return [...totals].map(([name, qty]) => (qty === 1 ? name : `${name} × ${qtyText(qty)}`)).join(", ");
}
export const fromShelf = (line) => !!line?.part_id && line.from_stock !== false;
export function qtyProblem(qty) {
  const n = Number(qty);
  if (String(qty ?? "").trim() === "" || !Number.isFinite(n) || n <= 0) return "How many? More than 0.";
  if (n > MAX_JOB_QTY) return "Up to 10,000.";
  return "";
}
// What the shelf has, and whether it has enough for this many (counting
// what this line already took when its amount changes), as the database says it.
export function shelfProblem(part, qty, already = 0) {
  const shelf = Math.max(0, Number(part?.quantity_in_stock) || 0);
  if (Number(qty) - (Number(already) || 0) <= shelf) return "";
  return shelf === 0 ? "None left on the shelf" : `Only ${qtyText(shelf)} left on the shelf`;
}
// How many a save takes off the shelf (less than 0 puts some back).
export const shelfChange = (before, after) => (fromShelf(after) ? Number(after.qty) || 0 : 0) - (fromShelf(before) ? Number(before.qty) || 0 : 0);
export const stockAfter = (part, taken) => ({ ...part, quantity_in_stock: Math.max(0, Math.round(((Number(part?.quantity_in_stock) || 0) - taken) * 100) / 100) });
export function partLineProblem({ part = null, name = "", number = "", qty, fromStock = true, already = 0 } = {}) {
  if (part) return qtyProblem(qty) || (fromStock ? shelfProblem(part, qty, already) : "");
  if (!String(name).trim()) return "Name the part.";
  if (String(name).trim().length > PART_TEXT_LIMITS.part_name) return "The name is up to 200 characters.";
  if (String(number).trim().length > PART_TEXT_LIMITS.part_number) return "The number is up to 60 characters.";
  return qtyProblem(qty);
}

// ----- words -----

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export function dateText(iso) {
  const d = new Date(iso);
  return Number.isFinite(d.getTime()) ? `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}` : "";
}
export const odometerText = (km) => (Number(km) > 0 ? `${Math.round(Number(km)).toLocaleString("en")} km` : "");
export function jobWhen(job) {
  if (!isOpen(job)) return [`Done ${dateText(job.done_at)}`, job.done_by && `by ${job.done_by}`].filter(Boolean).join(" ");
  return `Started ${dateText(job.created_date)}`;
}
