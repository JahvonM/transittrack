import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { load, mock, request } from "../../../security-tests/helpers.js";
import { serviceState } from "@/lib/serviceDue";

// The daily reminder (maintenanceAlerts) and the Workshop's Service section
// read a service the same way: km and date, whichever comes first.

const NOW = new Date("2026-11-10T11:00:00Z"); // the daily run: 7 in the morning in Grenada
const TODAY = "2026-11-10";

function fleet(schedules, odometer = 105000) {
  const sdk = mock("admin");
  Object.assign(sdk.tables, { MaintenanceSchedule: structuredClone(schedules), MaintenanceSettings: [{ id: "m", maintenance_reminder_days: 14 }], JobRun: [], NfcCard: [] });
  sdk.tables.Vehicle.find((v) => v.id === "bus-a").current_odometer = odometer;
  const run = async () => { const r = await load("maintenanceAlerts", sdk).default(request({})); return { status: r.status, body: await r.json() }; };
  return { sdk, run };
}
const service = (change = {}) => ({
  id: "s1", vehicle_id: "bus-a", vehicle_name: "Bus A", company_id: "a", service_type: "Routine service", status: "upcoming",
  due_type: "mileage", interval_km: 10000, interval_days: 180, last_service_mileage: 100000, last_service_date: "2026-08-01", ...change,
});

beforeEach(() => { vi.useFakeTimers({ now: NOW, toFake: ["Date"] }); });
afterEach(() => { vi.useRealTimers(); });

describe("the daily reminder, km or months, whichever comes first", () => {
  it("a service with plenty of km left but its months up is emailed and saved overdue", async () => {
    const { sdk, run } = fleet([service({ last_service_date: "2026-05-01" })], 105000);
    const res = await run();
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ alerted: true, dueCount: 1 });
    expect(sdk.tables.MaintenanceSchedule[0].status).toBe("overdue");
    expect(sdk.emails).toHaveLength(1);
    expect(sdk.emails[0].body).toContain("[OVERDUE] Bus A — Routine service");
    expect(sdk.emails[0].body).toContain("Due 2026-10-28");
    expect(sdk.emails[0].body).not.toContain("Due at 110,000 km");
  });

  it("close on km while the months are fine: due soon, by km", async () => {
    const { sdk, run } = fleet([service()], 109600);
    await run();
    expect(sdk.tables.MaintenanceSchedule[0].status).toBe("due");
    expect(sdk.emails[0].body).toContain("[DUE SOON] Bus A — Routine service");
    expect(sdk.emails[0].body).toContain("Due at 110,000 km (current 109,600 km)");
  });

  it("one no longer due goes back to upcoming, on a day with nothing to email", async () => {
    const { sdk, run } = fleet([service({ status: "overdue" })], 101000);
    const res = await run();
    expect(res.body).toMatchObject({ alerted: false });
    expect(sdk.tables.MaintenanceSchedule[0].status).toBe("upcoming");
    expect(sdk.emails).toEqual([]);
  });

  it("agrees with the Workshop on every case", async () => {
    const cases = [
      ["both fine", service(), 105000],
      ["km due, 300 left", service(), 109700],
      ["km at 500 left", service(), 109500],
      ["km at 501 left", service(), 109499],
      ["km reached", service(), 110000],
      ["km past", service(), 112000],
      ["date due today", service({ interval_km: 0, due_type: "days", last_service_date: "2026-05-14" }), 105000],
      ["date in 14 days", service({ interval_km: 0, due_type: "days", last_service_date: "2026-05-28" }), 105000],
      ["date in 15 days", service({ interval_km: 0, due_type: "days", last_service_date: "2026-05-29" }), 105000],
      ["date a day past", service({ interval_km: 0, due_type: "days", last_service_date: "2026-05-13" }), 105000],
      ["kept by date, km with no last km", service({ due_type: "days", last_service_mileage: 0 }), 105000],
      ["kept by date, km recorded and past", service({ due_type: "days", last_service_mileage: 90000 }), 105000],
      ["no odometer", service({ interval_days: 0 }), 0],
      ["no last date", service({ interval_km: 0, due_type: "days", last_service_date: null }), 105000],
    ];
    const saved = { overdue: "overdue", due: "due", ok: "upcoming", unknown: "upcoming", unset: "upcoming" };
    for (const [name, schedule, odometer] of cases) {
      const { sdk, run } = fleet([{ ...schedule, status: "due" }], odometer);
      await run();
      const workshop = serviceState(schedule, { odometer, today: TODAY, reminderDays: 14 }).state;
      expect(sdk.tables.MaintenanceSchedule[0].status, name).toBe(saved[workshop]);
    }
  });
});
