import { describe, it, expect } from "vitest";
import {
  ALERT_KINDS, FRESH_MS, addAlert, alertFromChange, lateJobs, loadAlertState, noteOwnChange, saveAlertState, unreadCount,
} from "@/lib/adminAlerts";
import { menuSections } from "@/lib/adminMenu";

// Admin -> the bell and the notices that drop in at the top of the page.

const NOW = Date.parse("2026-11-09T14:00:00Z"); // 10:00 in Grenada
const ago = (min) => new Date(NOW - min * 60_000).toISOString();
const job = (over = {}) => ({ id: "t1", job_type: "airport_pickup", status: "scheduled", scheduled_time: "2026-11-09T16:30:00Z", pickup_name: "Maurice Bishop Airport", vehicle_name: "Bus 3", created_date: ago(1), created_by: "office@example.com", ...over });
const change = (data, type = "update") => ({ type, id: data.id, data });

describe("what pops up", () => {
  it("a new job, unless you made it yourself", () => {
    const a = alertFromChange("Trip", change(job(), "create"), { now: NOW, me: "boss@example.com" });
    expect(a).toMatchObject({ key: "job_created:t1", kind: "job_created", title: "New job" });
    expect(a.detail).toBe("Airport pickup · 12:30 pm · Maurice Bishop Airport · Bus 3");
    expect(alertFromChange("Trip", change(job(), "create"), { now: NOW, me: "office@example.com" })).toBeNull();
  });

  it("a job started, completed or cancelled, from the time it happened", () => {
    expect(alertFromChange("Trip", change(job({ status: "on_the_way", started_at: ago(2) })), { now: NOW })).toMatchObject({ kind: "job_started", detail: "Bus 3 is on the way to Maurice Bishop Airport" });
    expect(alertFromChange("Trip", change(job({ status: "completed", completed_at: ago(3), dropoff_name: "Coyaba" })), { now: NOW })).toMatchObject({ kind: "job_completed", detail: "Bus 3 · Airport pickup · Coyaba" });
    expect(alertFromChange("Trip", change(job({ status: "cancelled", cancelled_at: ago(4) })), { now: NOW })).toMatchObject({ kind: "job_cancelled", title: "Job cancelled" });
    // Old news (a list catching up) doesn't pop up.
    expect(alertFromChange("Trip", change(job({ status: "completed", completed_at: ago(FRESH_MS / 60_000 + 1) })), { now: NOW })).toBeNull();
  });

  it("not route runs, deletions or your own cancellations", () => {
    expect(alertFromChange("Trip", change(job({ job_type: "" }), "create"), { now: NOW })).toBeNull();
    expect(alertFromChange("Trip", { type: "delete", id: "t1" }, { now: NOW })).toBeNull();
    noteOwnChange("t9");
    expect(alertFromChange("Trip", change(job({ id: "t9", status: "cancelled", cancelled_at: ago(0) })), { now: Date.now() })).toBeNull();
  });

  it("ride requests from the website and from company portals, without the customer's name", () => {
    const web = alertFromChange("BookingRequest", change({ id: "r1", status: "new", service: "transfer", requested_time: "2026-11-10T12:00:00Z", pickup: "Coyaba", name: "Ana Joseph", email: "ana@example.com", created_date: ago(1) }, "create"), { now: NOW });
    expect(web).toMatchObject({ kind: "request_new", title: "New ride request on the website", detail: "Transfer · 8:00 am · Coyaba" });
    expect(JSON.stringify(web)).not.toMatch(/Ana|ana@/);
    const company = alertFromChange("BookingRequest", change({ id: "r2", status: "new", service: "airport_pickup", company_id: "c1", company_name: "Six Senses", created_date: ago(1) }, "create"), { now: NOW });
    expect(company.title).toBe("Job request from Six Senses");
    expect(ALERT_KINDS.request_new.section).toBe("trips?view=requests");
  });

  it("problems: SOS (listed only: it has its red bar), incidents, faults and lost items", () => {
    const sos = alertFromChange("Incident", change({ id: "i1", type: "emergency", vehicle_name: "Bus 3", driver_name: "Kim", occurred_at: ago(0) }, "create"), { now: NOW });
    expect(sos).toMatchObject({ kind: "sos", title: "SOS from Bus 3" });
    expect(ALERT_KINDS.sos.quiet).toBe(true);
    expect(alertFromChange("Incident", change({ id: "i2", type: "breakdown", vehicle_name: "Bus 4", occurred_at: ago(1) }, "create"), { now: NOW })).toMatchObject({ kind: "incident", title: "Breakdown reported" });
    expect(alertFromChange("Fault", change({ id: "f1", title: "Brake light out", vehicle_name: "Bus 4", severity: "high", created_date: ago(1) }, "create"), { now: NOW })).toMatchObject({ kind: "fault", title: "New fault: Brake light out", detail: "Bus 4 · high severity" });
    expect(alertFromChange("LostItemReport", change({ id: "l1", description: "Blue backpack", created_date: ago(1) }, "create"), { now: NOW })).toMatchObject({ kind: "lost_item" });
    // An update to an old fault isn't news.
    expect(alertFromChange("Fault", change({ id: "f1", title: "x", created_date: ago(1) }), { now: NOW })).toBeNull();
  });

  it("a job not started 10 minutes after its time, for up to 3 hours", () => {
    const late = lateJobs([
      job({ id: "a", scheduled_time: ago(12) }),
      job({ id: "b", scheduled_time: ago(5) }),
      job({ id: "c", scheduled_time: ago(200) }),
      job({ id: "d", scheduled_time: ago(30), status: "on_the_way" }),
    ], NOW);
    expect(late.map((a) => a.key)).toEqual(["job_late:a"]);
    expect(late[0]).toMatchObject({ title: "Job not started", detail: "Bus 3 was due at 9:48 am · Airport pickup · Maurice Bishop Airport" });
    expect(ALERT_KINDS.job_late.sticky).toBe(true);
  });

  it("every notice opens a real Admin page", () => {
    const pages = new Set(menuSections());
    for (const [kind, meta] of Object.entries(ALERT_KINDS)) expect(pages.has(meta.section.split("?")[0]), kind).toBe(true);
  });
});

describe("the bell list", () => {
  const memory = () => { const m = new Map(); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v), m }; };

  it("lists each notice once, newest first, and counts the unread", () => {
    let s = { items: [], seen: [], read: [], muted: false };
    const one = alertFromChange("Trip", change(job({ status: "completed", completed_at: ago(1) })), { now: NOW });
    const two = alertFromChange("Fault", change({ id: "f1", title: "Mirror", created_date: ago(0) }, "create"), { now: NOW });
    s = addAlert(addAlert(addAlert(s, one), two), one);
    expect(s.items.map((i) => i.key)).toEqual(["fault:f1", "job_completed:t1"]);
    expect(unreadCount(s)).toBe(2);
    expect(unreadCount({ ...s, read: ["fault:f1"] })).toBe(1);
  });

  it("is kept in this browser per admin, so a reload doesn't pop it all up again", () => {
    const store = memory();
    const a = alertFromChange("Fault", change({ id: "f1", title: "Mirror", created_date: ago(0) }, "create"), { now: NOW });
    saveAlertState("Boss@Example.com", { ...addAlert({ items: [], seen: [], read: [], muted: true }, a) }, store);
    const back = loadAlertState("boss@example.com", store);
    expect(back).toMatchObject({ muted: true, seen: ["fault:f1"], items: [{ key: "fault:f1", title: "New fault: Mirror" }] });
    expect(loadAlertState("other@example.com", store).items).toEqual([]);
  });

  it("ignores anything odd in storage, and works when storage is blocked", () => {
    const store = memory();
    store.setItem("tt-admin-alerts:boss@example.com", JSON.stringify({ items: [{ key: "x", kind: "nope", title: "?", at: "bad" }, 5], seen: [1, "a"], muted: "yes" }));
    expect(loadAlertState("boss@example.com", store)).toEqual({ items: [], seen: ["a"], read: [], muted: false });
    const blocked = { getItem() { throw new Error("blocked"); }, setItem() { throw new Error("blocked"); } };
    expect(loadAlertState("boss@example.com", blocked)).toEqual({ items: [], seen: [], read: [], muted: false });
    expect(() => saveAlertState("boss@example.com", { items: [], seen: [], read: [], muted: false }, blocked)).not.toThrow();
  });
});
