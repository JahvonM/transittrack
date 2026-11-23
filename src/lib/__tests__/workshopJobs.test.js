import { describe, it, expect } from "vitest";
import {
  copySteps, jobData, jobForm, jobProblem, jobsUsingPart, jobWhen, knownProblems, newJobRecord, openFaultsFor, openJobsFor,
  partLineProblem, partsSummary, pastFixes, qtyProblem, shelfChange, shelfProblem, sortJobs, startForm, stepProblem, stockAfter, visibleJobs,
} from "../workshopJobs.js";
import { workshopSearch } from "../workshopSearch.js";

const bus = { kind: "bus", id: "bus-a", name: "St.George", guide: { id: "g1" }, record: { current_odometer: 182450.4 } };
const car = { kind: "car", id: "car-1", name: "BMW X3", guide: null, record: {} };
const jobs = [
  { id: "j1", vehicle_kind: "bus", vehicle_id: "bus-a", vehicle_name: "St.George", guide_id: "g1", title: "Front brakes", symptom: "Squeals when braking", fault_codes: "C1241", fix: "New pads and skimmed discs", status: "done", created_date: "2026-10-01T09:00:00Z", done_at: "2026-10-02T15:00:00Z", done_by: "Ken", steps: [{ text: "Lift the bus", done: true }, { text: "Fit the bracket", done: true, torque_id: "t1" }] },
  { id: "j2", vehicle_kind: "bus", vehicle_id: "bus-b", vehicle_name: "Grenville", guide_id: "g1", title: "Engine light", symptom: "Light on, loses power", fault_codes: "P0401", status: "open", created_date: "2026-11-20T08:00:00Z" },
  { id: "j3", vehicle_kind: "car", vehicle_id: "car-1", vehicle_name: "BMW X3", title: "Oil service", fix: "Oil and filter", status: "done", created_date: "2026-11-01T08:00:00Z", done_at: "2026-11-01T12:00:00Z" },
  { id: "j4", vehicle_kind: "bus", vehicle_id: "bus-a", vehicle_name: "St.George", guide_id: "g1", title: "Wipers", status: "open", created_date: "2026-11-21T08:00:00Z" },
];
const jobParts = [
  { id: "jp1", job_id: "j1", part_id: "p-pads", part_name: "Brake pads (front)", part_number: "04465-26420", qty: 1, from_stock: true, created_date: "2026-10-01T10:00:00Z" },
  { id: "jp2", job_id: "j3", part_id: "p-filter", part_name: "Oil filter", qty: 1, from_stock: true, created_date: "2026-11-01T09:00:00Z" },
  { id: "jp3", job_id: "j3", part_name: "Engine oil 5W-30 (bought)", qty: 6.5, from_stock: false, created_date: "2026-11-01T09:05:00Z" },
];

describe("the job form", () => {
  it("starts on a vehicle with its odometer, a fault's words, or a past fix's", () => {
    expect(startForm(bus)).toMatchObject({ title: "", odometer: "182450" });
    expect(startForm(car).odometer).toBe("");
    expect(startForm(bus, { fault: { title: "Brakes squeal", description: "Front left" } })).toMatchObject({ title: "Brakes squeal", symptom: "Front left" });
    expect(startForm(bus, { from: jobs[0] })).toMatchObject({ title: "Front brakes", symptom: "Squeals when braking", fault_codes: "" });
  });

  it("sends everything for a new job, with the model page, the fault and unticked steps", () => {
    const form = { ...startForm(bus), title: " Front brakes ", odometer: "182,500" };
    expect(newJobRecord(bus, form, { fault: { id: "f1" }, steps: jobs[0].steps })).toEqual({
      vehicle_kind: "bus", vehicle_id: "bus-a", guide_id: "g1", fault_id: "f1",
      title: "Front brakes", symptom: "", fault_codes: "", odometer: 182500, fix: "", notes: "",
      steps: [{ text: "Lift the bus", done: false }, { text: "Fit the bracket", done: false, torque_id: "t1" }],
    });
    expect(newJobRecord(car, { ...startForm(car), title: "Oil" })).not.toHaveProperty("guide_id");
  });

  it("sends only what changed when editing", () => {
    const form = { ...jobForm(jobs[0]), notes: "Test drove it" };
    expect(jobData(form, jobs[0])).toEqual({ notes: "Test drove it" });
    expect(jobData({ ...jobForm(jobs[1]), odometer: "" }, { ...jobs[1], odometer: 1000 })).toEqual({ odometer: null });
  });

  it("says what's wrong with the form", () => {
    expect(jobProblem({ title: " " })).toBe("Say what the job is.");
    expect(jobProblem({ title: "x".repeat(121) })).toMatch(/too long/);
    expect(jobProblem({ title: "Brakes", odometer: "lots" })).toBe("The odometer is a whole number of km.");
    expect(jobProblem({ title: "Brakes", odometer: "182 450" })).toBe("");
    expect(jobProblem({ fix: "ok" })).toBe("");
  });

  it("keeps steps within limits", () => {
    expect(stepProblem("", [])).toBe("Write the step first.");
    expect(stepProblem("x".repeat(301), [])).toMatch(/300/);
    expect(stepProblem("One more", Array.from({ length: 60 }, () => ({ text: "s" })))).toMatch(/60 steps/);
    expect(copySteps([{ text: " Bleed ", done: true }, { text: "" }])).toEqual([{ text: "Bleed", done: false }]);
  });
});

describe("lists of jobs", () => {
  it("puts open jobs first, newest started, then done ones, newest done", () => {
    expect(sortJobs(jobs).map((j) => j.id)).toEqual(["j4", "j2", "j3", "j1"]);
    expect(openJobsFor(jobs, bus).map((j) => j.id)).toEqual(["j4"]);
  });

  it("finds jobs by a fault code or a part used, open or done", () => {
    expect(visibleJobs(jobs, jobParts, { query: "p0401" }).map((j) => j.id)).toEqual(["j2"]);
    expect(visibleJobs(jobs, jobParts, { query: "04465", show: "done" }).map((j) => j.id)).toEqual(["j1"]);
    expect(visibleJobs(jobs, jobParts, { query: "04465", show: "open" })).toEqual([]);
    expect(visibleJobs(jobs, jobParts, { show: "all" })).toHaveLength(4);
  });

  it("lists the jobs a part was used on, newest first", () => {
    expect(jobsUsingPart(jobParts, jobs, "p-filter").map(({ job, line }) => [job.id, line.qty])).toEqual([["j3", 1]]);
    expect(jobsUsingPart(jobParts, jobs, "nope")).toEqual([]);
  });

  it("says when a job was started or done", () => {
    expect(jobWhen(jobs[0])).toBe("Done 2 Oct 2026 by Ken");
    expect(jobWhen(jobs[1])).toBe("Started 20 Nov 2026");
  });

  it("shows a bus's open faults only", () => {
    const faults = [{ id: "f1", vehicle_id: "bus-a", status: "open" }, { id: "f2", vehicle_id: "bus-a", status: "resolved" }, { id: "f3", vehicle_id: "bus-b", status: "in_progress" }];
    expect(openFaultsFor(faults, bus).map((f) => f.id)).toEqual(["f1"]);
    expect(openFaultsFor(faults, car)).toEqual([]);
  });
});

describe("troubleshooting", () => {
  it("lists done jobs on the same model with what was wrong or fixed, searchable", () => {
    expect(pastFixes(jobs, jobParts, { guideId: "g1" }).map((j) => j.id)).toEqual(["j1"]);
    expect(pastFixes(jobs, jobParts, { guideId: "g1", query: "squeal" }).map((j) => j.id)).toEqual(["j1"]);
    expect(pastFixes(jobs, jobParts, { guideId: "g1", query: "pads" }).map((j) => j.id)).toEqual(["j1"]);
    expect(pastFixes(jobs, jobParts, { guideId: "g1", query: "gearbox" })).toEqual([]);
    // Without a model page, this vehicle's own.
    expect(pastFixes(jobs, jobParts, { vehicle: car }).map((j) => j.id)).toEqual(["j3"]);
  });

  it("shows the model's known problems in their order", () => {
    const facts = [
      { id: "k2", guide_id: "g1", section: "problems", label: "Injector seals", value: "Replace the seals", sort_order: 20 },
      { id: "k1", guide_id: "g1", section: "problems", label: "EGR valve sticks", value: "Clean the EGR", detail: "P0401 often", sort_order: 10 },
      { id: "s1", guide_id: "g1", section: "fluids", label: "Engine oil", value: "7 L" },
    ];
    expect(knownProblems(facts, "g1").map((f) => f.id)).toEqual(["k1", "k2"]);
    expect(knownProblems(facts, "g1", "p0401").map((f) => f.id)).toEqual(["k1"]);
    expect(knownProblems(facts, "")).toEqual([]);
  });
});

describe("parts on a job and the shelf", () => {
  const part = { id: "p-filter", part_name: "Oil filter", quantity_in_stock: 1 };
  it("says what the shelf can give, as the database will", () => {
    expect(shelfProblem(part, 1)).toBe("");
    expect(shelfProblem(part, 2)).toBe("Only 1 left on the shelf");
    expect(shelfProblem({ ...part, quantity_in_stock: 0 }, 1)).toBe("None left on the shelf");
    // Changing 1 already taken to 2 needs one more from the shelf.
    expect(shelfProblem(part, 2, 1)).toBe("");
    expect(shelfProblem({ ...part, quantity_in_stock: 0 }, 2, 1)).toBe("None left on the shelf");
  });

  it("counts what a save takes or puts back, and the stock after it", () => {
    const line = { part_id: "p-filter", qty: 2, from_stock: true };
    expect(shelfChange(null, line)).toBe(2);
    expect(shelfChange(line, { ...line, qty: 3 })).toBe(1);
    expect(shelfChange(line, { ...line, from_stock: false })).toBe(-2);
    expect(shelfChange({ part_name: "Bought", qty: 1, from_stock: false }, { part_name: "Bought", qty: 4, from_stock: false })).toBe(0);
    expect(stockAfter({ quantity_in_stock: 3 }, 2).quantity_in_stock).toBe(1);
    expect(stockAfter({ quantity_in_stock: 1 }, -2).quantity_in_stock).toBe(3);
    expect(stockAfter({ quantity_in_stock: 1 }, 5).quantity_in_stock).toBe(0);
  });

  it("sums a part used twice", () => {
    expect(partsSummary([{ part_name: "Oil filter", qty: 1 }, { part_name: "Gasket", qty: 1 }, { part_name: "Oil filter", qty: 1 }, { part_name: "Engine oil", qty: 6.5 }])).toBe("Oil filter × 2, Gasket, Engine oil × 6.5");
  });

  it("checks the amount and a written-in part", () => {
    expect(qtyProblem("")).toMatch(/How many/);
    expect(qtyProblem("0")).toMatch(/How many/);
    expect(qtyProblem("10001")).toBe("Up to 10,000.");
    expect(qtyProblem("6.5")).toBe("");
    expect(partLineProblem({ part, qty: "2" })).toBe("Only 1 left on the shelf");
    expect(partLineProblem({ part, qty: "2", fromStock: false })).toBe("");
    expect(partLineProblem({ name: " ", qty: "1" })).toBe("Name the part.");
    expect(partLineProblem({ name: "Fan belt", qty: "1" })).toBe("");
  });
});

describe("jobs in the Workshop search", () => {
  it("finds a job by its fault code, symptom, fix or a part, with Open or Done", () => {
    const data = { jobs, jobParts };
    const hits = (q) => workshopSearch(data, q).find((g) => g.id === "jobs")?.hits || [];
    expect(hits("p0401")).toMatchObject([{ key: "job:j2", title: "Engine light", to: "/workshop/jobs/j2", open: true }]);
    expect(hits("skimmed")).toMatchObject([{ key: "job:j1", open: false }]);
    expect(hits("5w-30").map((h) => h.key)).toEqual(["job:j3"]);
    expect(hits("nothing like this")).toEqual([]);
  });
});
