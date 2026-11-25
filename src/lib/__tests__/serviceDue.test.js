import { describe, expect, it } from "vitest";
import {
  busServiceFlag, dayText, daysText, doneData, doneProblem, everyText, fleetDue, fromModelPage, lastText, nextText,
  odometerProblem, odometerWarning, reminderDaysFrom, savedStatus, scheduleData, scheduleForm, scheduleProblem, serviceHint,
  serviceState, servicesFor, ticksForJob, todayIso,
} from "@/lib/serviceDue";

const oil = { id: "s1", vehicle_id: "bus-a", service_type: "Engine oil and filter", due_type: "mileage", interval_km: 10000, interval_days: 180, last_service_mileage: 98000, last_service_date: "2026-11-01" };
const at = (odometer, today = "2026-11-10") => serviceState(oil, { odometer, today, reminderDays: 14 });

describe("a service's state", () => {
  it("by km: due within 500 km of the next one, overdue once the odometer reaches it", () => {
    expect(at(107499)).toMatchObject({ state: "ok", text: "In 501 km" });
    expect(at(107500)).toMatchObject({ state: "due", text: "Due in 500 km" });
    expect(at(108000)).toMatchObject({ state: "overdue", text: "Due now" });
    expect(at(108300)).toMatchObject({ state: "overdue", text: "Overdue by 300 km" });
    expect(at(108300).km).toEqual({ next: 108000, left: -300, state: "overdue", text: "Overdue by 300 km" });
  });

  it("by date: due within the reminder days, due today on the day, overdue the day after", () => {
    const monthly = { ...oil, due_type: "days", interval_km: 0, interval_days: 30 };
    const on = (today) => serviceState(monthly, { odometer: 100000, today, reminderDays: 14 });
    expect(on("2026-11-16")).toMatchObject({ state: "ok", text: "By 1 Dec 2026" });
    expect(on("2026-11-17")).toMatchObject({ state: "due", text: "Due in 14 days" });
    expect(on("2026-11-30")).toMatchObject({ state: "due", text: "Due tomorrow" });
    expect(on("2026-12-01")).toMatchObject({ state: "due", text: "Due today" });
    expect(on("2026-12-02")).toMatchObject({ state: "overdue", text: "Overdue by 1 day" });
    expect(on("2026-12-02").date.next).toBe("2026-12-01");
  });

  it("with both, whichever comes first", () => {
    // Plenty of km left, but the six months are up.
    expect(serviceState(oil, { odometer: 99000, today: "2027-05-05", reminderDays: 14 })).toMatchObject({ state: "overdue", text: "Overdue by 5 days" });
    // Close on km, months to go.
    expect(serviceState(oil, { odometer: 107800, today: "2026-11-10", reminderDays: 14 })).toMatchObject({ state: "due", text: "Due in 200 km" });
    expect(nextText(at(100000))).toBe("Next at 108,000 km or by 30 Apr 2027");
  });

  it("an unknown odometer doesn't hide a date, and says so when km is all there is", () => {
    expect(serviceState(oil, { odometer: 0, today: "2026-11-10" })).toMatchObject({ state: "ok", text: "By 30 Apr 2027" });
    const kmOnly = { ...oil, interval_days: 0 };
    expect(serviceState(kmOnly, { odometer: 0, today: "2026-11-10" })).toMatchObject({ state: "unknown", text: "Odometer not recorded" });
  });

  it("not set: no last date for a time interval, or no interval at all; a finished one doesn't repeat", () => {
    expect(serviceState({ service_type: "Coolant", interval_days: 730, due_type: "days" }, { today: "2026-11-10" })).toMatchObject({ state: "unset", text: "Set when it was last done" });
    expect(serviceState({ service_type: "Look over" }, { today: "2026-11-10" })).toMatchObject({ state: "unset", text: "No interval set" });
    expect(serviceState({ ...oil, status: "completed" }, { odometer: 200000 })).toMatchObject({ state: "off", text: "Not repeating" });
  });

  it("a service kept by date counts its km only once a last km is recorded, as the daily reminder does", () => {
    const byDate = { service_type: "Brake fluid", due_type: "days", interval_days: 360, interval_km: 15000, last_service_date: "2026-11-01", last_service_mileage: 0 };
    expect(serviceState(byDate, { odometer: 150000, today: "2026-11-10" })).toMatchObject({ state: "ok", km: null });
    expect(serviceState({ ...byDate, last_service_mileage: 130000 }, { odometer: 150000, today: "2026-11-10" })).toMatchObject({ state: "overdue", text: "Overdue by 5,000 km" });
  });

  it("the reminder days come from the settings, 14 if none", () => {
    expect(reminderDaysFrom([{ maintenance_reminder_days: 21 }])).toBe(21);
    expect(reminderDaysFrom([])).toBe(14);
    expect(reminderDaysFrom([{ maintenance_reminder_days: 0 }])).toBe(14);
  });
});

describe("words", () => {
  it("intervals in months when they divide evenly, else days", () => {
    expect(everyText(oil)).toBe("Every 10,000 km or 6 months");
    expect(everyText({ interval_days: 45 })).toBe("Every 45 days");
    expect(everyText({ interval_days: 30 })).toBe("Every 1 month");
    expect(everyText({})).toBe("No interval set");
    expect(daysText(0)).toBe("");
  });

  it("when it was last done, and dates the same in any time zone", () => {
    expect(lastText(oil)).toBe("Last done 1 Nov 2026 at 98,000 km");
    expect(lastText({ last_service_date: "2026-11-12" })).toBe("Last done 12 Nov 2026");
    expect(lastText({})).toBe("Not done here yet");
    expect(dayText("2026-11-12")).toBe("12 Nov 2026");
    expect(dayText("nope")).toBe("");
    // Ten at night on the 24th in Grenada is the 25th in UTC.
    expect(todayIso(new Date("2026-11-25T02:00:00Z"))).toBe("2026-11-24");
  });
});

describe("a bus's services and the fleet's", () => {
  const bus = (id, odometer, name = id) => ({ kind: "bus", id, name, record: { id, current_odometer: odometer, company_id: "a", company_name: "A" } });
  const schedules = [
    oil,
    { id: "s2", vehicle_id: "bus-a", service_type: "Air filter", due_type: "mileage", interval_km: 20000, last_service_mileage: 89300 },
    { id: "s3", vehicle_id: "bus-a", service_type: "Brake fluid", due_type: "days", interval_days: 360, last_service_date: "2026-01-01" },
    { id: "s4", vehicle_id: "bus-b", service_type: "Engine oil and filter", due_type: "mileage", interval_km: 10000, last_service_mileage: 50000 },
    { id: "s5", vehicle_id: "car-1", service_type: "Oil", due_type: "mileage", interval_km: 10000, last_service_mileage: 0 },
  ];
  const opts = { today: "2026-11-10", reminderDays: 14 };

  it("a bus's services, the most urgent first; a car has none here", () => {
    const items = servicesFor(schedules, bus("bus-a", 109000), opts);
    expect(items.map((i) => [i.schedule.service_type, i.state])).toEqual([
      ["Engine oil and filter", "overdue"], ["Air filter", "due"], ["Brake fluid", "ok"],
    ]);
    expect(servicesFor(schedules, { kind: "car", id: "car-1", record: {} }, opts)).toEqual([]);
    expect(busServiceFlag(items)).toBe("overdue");
    expect(busServiceFlag(items.slice(1))).toBe("due");
    expect(busServiceFlag(items.slice(2))).toBe("");
  });

  it("the fleet's, grouped", () => {
    const due = fleetDue(schedules, [bus("bus-a", 109000, "St.George"), bus("bus-b", 52000, "Grenville"), { kind: "car", id: "car-1", record: {} }], opts);
    expect(due.overdue.map((i) => i.vehicle.name)).toEqual(["St.George"]);
    expect(due.due.map((i) => i.schedule.id)).toEqual(["s2"]);
    expect(due.later.map((i) => i.schedule.id)).toEqual(["s3", "s4"]);
    expect(due.total).toBe(4);
  });

  it("a few words for the bus's Service link, and the status kept on the record", () => {
    const items = servicesFor(schedules, bus("bus-a", 109000), opts);
    expect(serviceHint(items)).toBe("1 overdue · 1 due soon");
    expect(serviceHint(items.slice(2))).toBe("Nothing due");
    expect(serviceHint([])).toBe("None set up yet");
    expect(serviceHint([{ state: "unset" }])).toBe("Set when each was last done");
    expect(["overdue", "due", "ok", "unset", "unknown"].map(savedStatus)).toEqual(["overdue", "due", "upcoming", "upcoming", "upcoming"]);
  });
});

describe("from the model page", () => {
  const facts = [
    { id: "f1", guide_id: "g1", section: "service", label: "Routine service", interval_km: 10000, interval_months: 6, sort_order: 20 },
    { id: "f2", guide_id: "g1", section: "service", label: "Diesel fuel filter", interval_km: 20000, interval_months: null, sort_order: 10 },
    { id: "f3", guide_id: "g1", section: "service", label: "Coolant", interval_km: null, interval_months: null, sort_order: 30 },
    { id: "f4", guide_id: "g1", section: "fluids", label: "Engine oil", value: "7 L", sort_order: 5 },
    { id: "f5", guide_id: "g2", section: "service", label: "Other model", interval_km: 5000, sort_order: 1 },
  ];

  it("the service intervals the bus doesn't have yet, in the page's order, months as days", () => {
    expect(fromModelPage(facts, "g1", [])).toEqual([
      { key: "f2", service_type: "Diesel fuel filter", interval_km: 20000, interval_days: 0 },
      { key: "f1", service_type: "Routine service", interval_km: 10000, interval_days: 180 },
    ]);
    expect(fromModelPage(facts, "g1", [{ service_type: " routine SERVICE " }]).map((p) => p.key)).toEqual(["f2"]);
    expect(fromModelPage(facts, "", [])).toEqual([]);
  });
});

describe("the form", () => {
  const vehicle = { kind: "bus", id: "bus-a", name: "St.George", record: { company_id: "a", company_name: "A", current_odometer: 105000 } };

  it("a new one starts today at the odometer now; an existing one shows its months or days", () => {
    expect(scheduleForm(null, { today: "2026-11-10", odometer: 105000 })).toEqual({ service_type: "", every_km: "", every_time: "", time_unit: "months", last_date: "2026-11-10", last_km: "105000", notes: "" });
    expect(scheduleForm(oil)).toMatchObject({ every_km: "10000", every_time: "6", time_unit: "months", last_date: "2026-11-01", last_km: "98000" });
    expect(scheduleForm({ ...oil, interval_days: 45 })).toMatchObject({ every_time: "45", time_unit: "days" });
  });

  it("says what's missing or wrong", () => {
    const ok = { service_type: "Oil", every_km: "10,000", every_time: "6", time_unit: "months", last_date: "2026-11-01", last_km: "98,000", notes: "" };
    const p = (change) => scheduleProblem({ ...ok, ...change }, { today: "2026-11-10" });
    expect(p({})).toBe("");
    expect(p({ service_type: " " })).toMatch(/Say what the service is/);
    expect(p({ every_km: "", every_time: "" })).toMatch(/Say how often/);
    expect(p({ every_km: "ten" })).toBe("Every km is a whole number.");
    expect(p({ every_time: "1.5" })).toBe("Every months is a whole number.");
    expect(p({ every_time: "130" })).toBe("That's more than ten years.");
    expect(p({ last_date: "" })).toMatch(/Say when it was last done/);
    expect(p({ last_date: "2026-12-01" })).toBe("The last date can't be in the future.");
    expect(p({ last_km: "" })).toMatch(/Say at what km/);
    expect(p({ every_km: "", last_km: "" })).toBe("");
    expect(p({ every_time: "", last_date: "" })).toBe("");
  });

  it("what is saved: months as days, km first, and a new one's bus", () => {
    const form = { service_type: " Routine service ", every_km: "10,000", every_time: "6", time_unit: "months", last_date: "2026-11-01", last_km: "98,000", notes: "" };
    expect(scheduleData(form)).toEqual({ service_type: "Routine service", interval_km: 10000, interval_days: 180, due_type: "mileage", last_service_date: "2026-11-01", last_service_mileage: 98000, notes: "" });
    expect(scheduleData({ ...form, every_km: "", time_unit: "days", every_time: "45" })).toMatchObject({ interval_km: 0, interval_days: 45, due_type: "days" });
    expect(scheduleData(form, vehicle)).toMatchObject({ vehicle_id: "bus-a", vehicle_name: "St.George", company_id: "a", company_name: "A" });
  });
});

describe("done", () => {
  it("records the day and the reading; without one the last km stays", () => {
    expect(doneData({ date: "2026-11-10", odometer: "108,250" }, oil)).toEqual({ last_service_date: "2026-11-10", last_service_mileage: 108250, status: "upcoming" });
    expect(doneData({ date: "2026-11-10", odometer: "" }, oil)).toEqual({ last_service_date: "2026-11-10", last_service_mileage: 98000, status: "upcoming" });
    expect(doneProblem({ date: "2026-11-11", odometer: "" }, { today: "2026-11-10" })).toBe("That day is in the future.");
    expect(doneProblem({ date: "", odometer: "" })).toBe("Say the day it was done.");
    expect(doneProblem({ date: "2026-11-10", odometer: "12.5" }, { today: "2026-11-10" })).toBe("The odometer is a whole number of km.");
  });

  it("a job ticks the services its title names", () => {
    const items = [{ schedule: oil }, { schedule: { id: "s2", service_type: "Air filter" } }];
    expect(ticksForJob({ title: " engine oil AND filter" }, items)).toEqual(["s1"]);
    expect(ticksForJob({ title: "Front brakes" }, items)).toEqual([]);
  });

  it("an odometer reading: a whole number, and a lower one is worth a second look", () => {
    expect(odometerProblem("")).toBe("Type the odometer reading.");
    expect(odometerProblem("12a")).toBe("The odometer is a whole number of km.");
    expect(odometerProblem("106,000")).toBe("");
    expect(odometerWarning("104000", 105000)).toBe("That's lower than the last reading (105,000 km). Check it before saving.");
    expect(odometerWarning("106000", 105000)).toBe("");
  });
});
