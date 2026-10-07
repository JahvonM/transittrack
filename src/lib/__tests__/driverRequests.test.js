import { describe, it, expect } from "vitest";
import { load, mock, request } from "../../../security-tests/helpers.js";

// Step 3: day-off and swap requests from the phone, answered by admin.
const day = (offset) => { const d = new Date(Date.now() + offset * 86400000); return d.toLocaleDateString("en-CA", { timeZone: "America/Grenada" }); };
function setup(role = "staff") {
  const sdk = mock(role);
  sdk.tables.Driver = [
    { id: "drv", full_name: "Dana Driver", email: "caller@test.invalid", company_id: "a", phone_app_access: true },
    { id: "drv2", full_name: "Sam Other", email: "sam@test.invalid", company_id: "a" },
    { id: "drvb", full_name: "Bea Elsewhere", email: "bea@test.invalid", company_id: "b" },
  ];
  sdk.tables.DriverRequest = [];
  const phone = load("driverPhone", sdk);
  const send = async (body) => { const r = await phone.default(request(body)); return { status: r.status, body: await r.json() }; };
  return { sdk, send };
}
const asAdmin = async (sdk, body, role = "admin") => {
  sdk.tables.User[0].role = role;
  const r = await load("driverRequests", sdk).default(request(body));
  return { status: r.status, body: await r.json() };
};

describe("driver requests from the phone", () => {
  it("asks for days off and swaps with a colleague from the same company only", async () => {
    const { sdk, send } = setup();
    const list = await send({ action: "requests" });
    expect(list.body.colleagues).toEqual([{ id: "drv2", name: "Sam Other" }]);
    expect((await send({ action: "request", kind: "day_off", start_date: day(3), end_date: day(4), note: "Family" })).status).toBe(200);
    expect((await send({ action: "request", kind: "swap", start_date: day(5), swap_with_driver_id: "drv2" })).status).toBe(200);
    expect((await send({ action: "request", kind: "swap", start_date: day(5), swap_with_driver_id: "drvb" })).status).toBe(400);
    expect(sdk.tables.DriverRequest.map((r) => [r.kind, r.status, r.driver_id, r.swap_with_name || ""])).toEqual([
      ["day_off", "pending", "drv", ""], ["swap", "pending", "drv", "Sam Other"],
    ]);
  });

  it("refuses past dates, reversed ranges and long ranges", async () => {
    const { send } = setup();
    expect((await send({ action: "request", kind: "day_off", start_date: day(-1) })).status).toBe(400);
    expect((await send({ action: "request", kind: "day_off", start_date: day(4), end_date: day(3) })).status).toBe(400);
    expect((await send({ action: "request", kind: "day_off", start_date: day(1), end_date: day(40) })).status).toBe(400);
    expect((await send({ action: "request", kind: "day_off", start_date: "2026-02-30" })).status).toBe(400);
  });

  it("lets drivers cancel only their own waiting requests", async () => {
    const { sdk, send } = setup();
    const made = await send({ action: "request", kind: "day_off", start_date: day(2) });
    sdk.tables.DriverRequest.push({ id: "other", driver_id: "drv2", company_id: "a", status: "pending", kind: "day_off", start_date: day(2) });
    expect((await send({ action: "cancel_request", request_id: "other" })).status).toBe(404);
    expect((await send({ action: "cancel_request", request_id: made.body.request.id })).body.request.status).toBe("cancelled");
    expect((await send({ action: "cancel_request", request_id: made.body.request.id })).status).toBe(409);
  });
});

describe("answering requests", () => {
  it("admins approve once; passengers and drivers cannot answer", async () => {
    const { sdk, send } = setup();
    const made = await send({ action: "request", kind: "day_off", start_date: day(2) });
    const id = made.body.request.id;
    expect((await asAdmin(sdk, { action: "list" }, "staff")).status).toBe(403);
    expect((await asAdmin(sdk, { action: "decide", request_id: id, decision: "approved" }, "driver")).status).toBe(403);
    const ok = await asAdmin(sdk, { action: "decide", request_id: id, decision: "approved", note: "Enjoy" });
    expect(ok.body.request).toMatchObject({ status: "approved", decision_note: "Enjoy", decided_by_name: "Caller" });
    expect((await asAdmin(sdk, { action: "decide", request_id: id, decision: "declined" })).status).toBe(409);
    expect((await send({ action: "requests" })).body.requests[0]).toMatchObject({ status: "approved", decision_note: "Enjoy" });
  });

  it("a company manager sees and answers only their own company's requests", async () => {
    const { sdk } = setup();
    sdk.tables.DriverRequest = [
      { id: "ra", company_id: "a", driver_id: "drv", status: "pending", kind: "day_off", start_date: day(2) },
      { id: "rb", company_id: "b", driver_id: "drvb", status: "pending", kind: "day_off", start_date: day(2) },
    ];
    sdk.tables.CompanyMembership[0].scope = "manager"; // an approved manager of company A
    const list = await asAdmin(sdk, { action: "list" }, "company");
    expect(list.body.requests.map((r) => r.id)).toEqual(["ra"]);
    expect((await asAdmin(sdk, { action: "decide", request_id: "rb", decision: "approved" }, "company")).status).toBe(404);
  });

  it("is not readable through the app's general data access", async () => {
    const { sdk } = setup("admin");
    const r = await load("entityAccess", sdk).default(request({ entity: "DriverRequest", operation: "list" }));
    expect(r.status).toBe(403);
  });
});
