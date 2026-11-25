import { describe, it, expect } from "vitest";
import { load, mock, request } from "../../../security-tests/helpers.js";

// Admin → Companies → Find records from removed companies → tick → Delete selected.
const call = async (sdk, body) => { const r = await load("companyHistoryCleanup", sdk).default(request(body)); return { status: r.status, body: await r.json() }; };
function setup(role = "admin") {
  const sdk = mock(role);
  Object.assign(sdk.tables, {
    Trip: [{ id: "t1", company_id: "gone" }, { id: "t2", company_id: "gone" }, { id: "t3", company_id: "a" }],
    Fault: [{ id: "f1", company_id: "gone" }],
    GroupMessage: [{ id: "m1", company_id: "gone" }],
    Vehicle: [...sdk.tables.Vehicle, { id: "bus-gone", company_id: "gone", name: "Old bus" }],
    AuditLog: [],
  });
  return sdk;
}

describe("deleting what a removed company left behind", () => {
  it("deletes only the kinds of history that were ticked, and only that company's", async () => {
    const sdk = setup();
    const res = await call(sdk, { company_id: "gone", types: ["Trip", "Fault"] });
    expect(res).toMatchObject({ status: 200, body: { ok: true, deleted: { Trip: 2, Fault: 1 } } });
    expect(sdk.tables.Trip.map((t) => t.id)).toEqual(["t3"]);
    expect(sdk.tables.Fault).toHaveLength(0);
    expect(sdk.tables.GroupMessage).toHaveLength(1);
    expect(sdk.tables.AuditLog).toHaveLength(1);
  });
  it("never deletes still-linked records like buses, or anything of a company that still exists", async () => {
    const sdk = setup();
    expect((await call(sdk, { company_id: "gone", types: ["Vehicle"] })).status).toBe(400);
    expect((await call(sdk, { company_id: "a", types: ["Trip"] })).status).toBe(409);
    expect(sdk.tables.Vehicle.some((v) => v.id === "bus-gone")).toBe(true);
    expect(sdk.tables.Trip).toHaveLength(3);
  });
  it.each(["company", "staff", "driver", "mechanic"])("refuses a %s", async (role) => {
    const sdk = setup(role);
    expect((await call(sdk, { company_id: "gone", types: ["Trip"] })).status).toBe(403);
    expect(sdk.tables.Trip).toHaveLength(3);
  });
});
