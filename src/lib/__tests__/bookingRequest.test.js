import { describe, it, expect, vi, beforeEach } from "vitest";
vi.mock("npm:@base44/sdk@0.8.44", () => ({ createClientFromRequest: vi.fn() }));
vi.mock("../../../base44/shared/forwardToSupabase.ts", () => ({ forwardToSupabase: vi.fn(async () => null) }));
vi.mock("../../../base44/shared/atomicOps.ts", () => ({ reserveAttempt: vi.fn(async () => true) }));
vi.mock("../../../base44/shared/notificationPolicy.ts", () => ({
  emailWithPolicy: vi.fn(async (_b, _key, recipients, sendOne) => { for (const r of recipients) await sendOne(r); return { sent: recipients.length }; }),
}));
import handler, { readRequest, emailHtml, grenadaTime } from "../../../base44/functions/bookingRequest/entry.ts";
import { createClientFromRequest } from "npm:@base44/sdk@0.8.44";
import { reserveAttempt } from "../../../base44/shared/atomicOps.ts";

// Rides asked for on the public website, and dispatch's answers.

const NOW = Date.parse("2026-10-25T12:00:00Z");
const form = (over = {}) => ({
  service: "airport_pickup", requested_time: "2026-10-27T15:30:00Z", pickup: "Maurice Bishop Airport", dropoff: "Spice Island Beach Resort",
  guests: 3, luggage: 4, flight_number: "bw 431", name: "Ana Joseph", phone: "+1 473 555 0101", email: "Ana@Example.com", notes: "Two car seats",
  ...over,
});

function setup({ role = null } = {}) {
  const rows = new Map();
  const sent = [];
  let n = 0;
  const db = {
    BookingRequest: {
      create: vi.fn(async (d) => { const r = { ...d, id: `req${++n}` }; rows.set(r.id, r); return r; }),
      get: vi.fn(async (id) => { if (!rows.has(id)) throw Object.assign(new Error("nf"), { status: 404 }); return { ...rows.get(id) }; }),
      update: vi.fn(async (id, d) => Object.assign(rows.get(id), d)),
      filter: vi.fn(async (q) => [...rows.values()].filter((r) => r.trip_id === q.trip_id)),
    },
    Trip: { get: vi.fn(async (id) => (id === "trip1" ? { id, company_id: "c1", vehicle_id: "bus1", vehicle_name: "Bus 3", plate_number: "PA 1", status: "scheduled", scheduled_time: "2026-10-27T15:30:00Z", pickup_name: "MBIA", dropoff_name: "Spice Island", price: 120, currency: "XCD" } : null)) },
    VerificationGrant: { filter: vi.fn(async () => []), update: vi.fn(), create: vi.fn(async (d) => d) },
    User: { filter: vi.fn(async () => [{ email: "dispatch@example.com", role: "admin" }]) },
  };
  vi.mocked(createClientFromRequest).mockReturnValue({
    auth: { me: async () => (role ? { id: "u1", role, email: "boss@example.com" } : null) },
    asServiceRole: { entities: db, integrations: { Core: { SendEmail: vi.fn(async (m) => { sent.push(m); }) } } },
  });
  return { db, rows, sent };
}
const call = async (body, headers = {}) => {
  const res = await handler(new Request("https://x/f", { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) }));
  return { status: res.status, body: await res.json() };
};

beforeEach(() => vi.mocked(reserveAttempt).mockResolvedValue(true));

describe("the booking form", () => {
  it("keeps what dispatch needs, cleaned up", () => {
    const r = readRequest(form(), NOW);
    expect(r).toMatchObject({ service: "airport_pickup", email: "ana@example.com", flight_number: "BW 431", guests: 3, luggage: 4 });
    expect(r.requested_time).toBe("2026-10-27T15:30:00.000Z");
  });

  it("says plainly what to fix", () => {
    const why = (over) => { try { readRequest(form(over), NOW); return ""; } catch (e) { return e.message; } };
    expect(why({ service: "helicopter" })).toMatch(/kind of ride/);
    expect(why({ requested_time: "2026-10-25T12:30:00Z" })).toMatch(/at least an hour/);
    expect(why({ requested_time: "2028-01-01T00:00:00Z" })).toMatch(/within the next year/);
    expect(why({ email: "not-an-email" })).toMatch(/email address/);
    expect(why({ phone: "call me" })).toMatch(/phone number/);
    expect(why({ pickup: "" })).toMatch(/where to pick you up/);
    expect(why({ guests: 0 })).toMatch(/passengers from 1 to 60/);
    expect(why({ service: "transfer", flight_number: "BW431" })).toMatch(/flight number/);
    expect(why({ notes: "x".repeat(1001) })).toMatch(/too long/);
  });

  it("escapes everything a customer typed in the emails", () => {
    const html = emailHtml({ heading: "<b>Hi</b>", lines: ["a & b"], rows: [["Note", "<script>alert(1)</script>"]] });
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("&lt;b&gt;Hi&lt;/b&gt;");
    expect(grenadaTime("2026-10-27T15:30:00Z")).toMatch(/27 October/);
    expect(grenadaTime("2026-10-27T15:30:00Z")).toMatch(/11:30/); // Grenada is UTC-4
  });
});

describe("booking on the website", () => {
  it("saves the request and emails the customer and dispatch", async () => {
    const { rows, sent } = setup();
    const res = await call({ action: "request", form_ms: 45000, ...form({ requested_time: new Date(Date.now() + 3 * 86400_000).toISOString() }) });
    expect(res).toMatchObject({ status: 200, body: { ok: true, id: "req1" } });
    expect(rows.get("req1")).toMatchObject({ status: "new", email: "ana@example.com" });
    expect(sent.map((m) => m.to)).toEqual(["ana@example.com", "dispatch@example.com"]);
    expect(sent[0].subject).toBe("We have your ride request");
    expect(sent[0].body).toMatch(/Nothing is booked until then/);
  });

  it("the first email to the address on the form holds nothing the visitor typed", async () => {
    // Anyone can put anyone's email on the form: the reply must not carry their text.
    const { sent } = setup();
    const bait = { name: "Visit evil.example now", pickup: "Your account is locked", dropoff: "call 555 0000", notes: "phish" };
    await call({ action: "request", form_ms: 45000, ...form({ requested_time: new Date(Date.now() + 3 * 86400_000).toISOString(), ...bait }) });
    const toCustomer = sent.find((m) => m.to === "ana@example.com");
    for (const text of Object.values(bait)) expect(toCustomer.body).not.toContain(text);
    expect(toCustomer.body).toMatch(/Airport pickup|Airport drop-off|Transfer|Island tour|Staff transport/);
    // Dispatch still sees everything.
    const toDispatch = sent.find((m) => m.to === "dispatch@example.com");
    for (const text of ["Visit evil.example now", "Your account is locked", "call 555 0000"]) expect(toDispatch.body).toContain(text);
  });

  it("quietly ignores bots and turns away floods", async () => {
    const { rows, sent } = setup();
    const later = new Date(Date.now() + 3 * 86400_000).toISOString();
    expect((await call({ action: "request", form_ms: 45000, website: "http://spam", ...form({ requested_time: later }) })).body).toEqual({ ok: true });
    expect((await call({ action: "request", form_ms: 800, ...form({ requested_time: later }) })).body).toEqual({ ok: true });
    expect(rows.size).toBe(0);
    expect(sent).toHaveLength(0);
    vi.mocked(reserveAttempt).mockResolvedValue(false);
    expect((await call({ action: "request", form_ms: 45000, ...form({ requested_time: later }) })).status).toBe(429);
    expect(rows.size).toBe(0);
  });

  it("only admins answer requests", async () => {
    setup({ role: "staff" });
    for (const action of ["confirm", "decline", "spam", "send_tracking"]) {
      expect((await call({ action, request_id: "req1", trip_id: "trip1" })).status, action).toBe(403);
    }
    setup();
    expect((await call({ action: "confirm", request_id: "req1", trip_id: "trip1" })).status).toBe(401);
  });

  it("confirming emails the customer their ride and a tracking link", async () => {
    const { rows, sent, db } = setup({ role: "admin" });
    rows.set("req1", { id: "req1", status: "new", email: "ana@example.com", service: "airport_pickup", requested_time: "2026-10-27T15:30:00Z", pickup: "MBIA", dropoff: "Hotel" });
    const res = await call({ action: "confirm", request_id: "req1", trip_id: "trip1" });
    expect(res.body).toEqual({ ok: true, emailed: true, tracking: true });
    expect(rows.get("req1")).toMatchObject({ status: "confirmed", trip_id: "trip1", handled_by: "boss@example.com" });
    expect(db.VerificationGrant.create).toHaveBeenCalledOnce();
    expect(sent[0]).toMatchObject({ to: "ana@example.com", subject: "Your ride is confirmed" });
    expect(sent[0].body).toMatch(/https:\/\/app\.mcsweenstransport\.com\/track#trip=[a-f0-9]{64}/);
    expect(sent[0].body).toMatch(/120\.00 XCD/);
    // Answered once only.
    expect((await call({ action: "confirm", request_id: "req1", trip_id: "trip1" })).status).toBe(409);
  });

  it("declining explains, and spam is closed without an email", async () => {
    const { rows, sent } = setup({ role: "admin" });
    rows.set("req1", { id: "req1", status: "new", email: "ana@example.com", service: "transfer", requested_time: "2026-10-27T15:30:00Z", pickup: "A", dropoff: "B" });
    rows.set("req2", { id: "req2", status: "new", email: "bot@example.com", service: "transfer", requested_time: "2026-10-27T15:30:00Z", pickup: "A", dropoff: "B" });
    expect((await call({ action: "decline", request_id: "req1", reason: "No bus free that morning." })).body).toEqual({ ok: true, emailed: true });
    expect(sent[0].body).toMatch(/No bus free that morning/);
    expect((await call({ action: "spam", request_id: "req2" })).body).toEqual({ ok: true, emailed: false });
    expect(sent).toHaveLength(1);
    expect(rows.get("req2")).toMatchObject({ status: "declined", decline_reason: "spam" });
  });
});

// A company asking for a job from its portal.
describe("job requests from a company portal", () => {
  function companySetup({ role = "company", membership = { scope: "manager", active: true, company_id: "c1" } } = {}) {
    const env = setup({ role });
    const manager = { id: "u1", role, email: "frontdesk@hotel.example", display_name: "Front desk", phone: "" };
    env.db.User.get = vi.fn(async (id) => (id === "u1" ? manager : null));
    env.db.CompanyMembership = { filter: vi.fn(async () => (membership ? [{ id: "m1", user_id: "u1", ...membership }] : [])) };
    env.db.Company = { get: vi.fn(async (id) => (id === "c1" ? { id: "c1", name: "Six Senses", phone: "+1 473 555 0200" } : null)) };
    env.db.BookingRequest.filter = vi.fn(async (q) => [...env.rows.values()].filter((r) => (q.company_id ? r.company_id === q.company_id : r.trip_id === q.trip_id)));
    env.db.Trip.update = vi.fn(async (id, d) => ({ id, ...d }));
    return env;
  }
  const later = () => new Date(Date.now() + 3 * 86400_000).toISOString();
  const jobForm = (over = {}) => ({ action: "company_request", service: "airport_pickup", requested_time: later(), pickup: "Maurice Bishop Airport", dropoff: "Six Senses", guests: 2, flight_number: "AA 1234", name: "Mr and Mrs Lee", notes: "VIP", ...over });

  it("saves the request for the company and emails dispatch", async () => {
    const { rows, sent } = companySetup();
    const res = await call(jobForm());
    expect(res).toMatchObject({ status: 200, body: { ok: true, id: "req1" } });
    // The company's phone stands in when the form has none; replies go to the account's own email.
    expect(rows.get("req1")).toMatchObject({ status: "new", company_id: "c1", company_name: "Six Senses", requested_by_id: "u1", name: "Mr and Mrs Lee", email: "frontdesk@hotel.example", phone: "+1 473 555 0200" });
    const toDispatch = sent.find((m) => m.to === "dispatch@example.com");
    expect(toDispatch.subject).toMatch(/^Job request from Six Senses: Airport pickup/);
    for (const text of ["Six Senses asked for a job", "Mr and Mrs Lee", "Front desk", "AA 1234", "VIP"]) expect(toDispatch.body).toContain(text);
    const toCompany = sent.find((m) => m.to === "frontdesk@hotel.example");
    expect(toCompany.subject).toBe("We have your job request");
    expect(toCompany.body).toContain("your company account asked for this ride");
  });

  it("is only for approved company accounts", async () => {
    companySetup({ role: "staff" });
    expect((await call(jobForm())).status).toBe(403);
    companySetup({ membership: null });
    expect((await call(jobForm())).body.error).toMatch(/administrator approval/);
    // A passenger membership is not a manager's.
    companySetup({ membership: { scope: "passenger", active: true, company_id: "c1" } });
    expect((await call(jobForm())).status).toBe(403);
    setup();
    expect((await call(jobForm())).status).toBe(401);
  });

  it("asks for the guest and a sensible time", async () => {
    const { rows } = companySetup();
    expect((await call(jobForm({ name: "" }))).body.error).toBe("Please add the guest's name.");
    expect((await call(jobForm({ requested_time: new Date(Date.now() + 10 * 60_000).toISOString() }))).body.error).toMatch(/at least an hour/);
    expect(rows.size).toBe(0);
    vi.mocked(reserveAttempt).mockResolvedValue(false);
    expect((await call(jobForm())).status).toBe(429);
  });

  it("lists only the company's own requests, without other customers' details", async () => {
    const { rows } = companySetup();
    rows.set("w1", { id: "w1", status: "new", email: "tourist@example.com", name: "Website customer" });
    rows.set("c1r", { id: "c1r", status: "declined", decline_reason: "No bus", company_id: "c1", email: "frontdesk@hotel.example", requested_by_id: "u1", name: "Guest" });
    const res = await call({ action: "company_requests" });
    expect(res.body.requests.map((r) => r.id)).toEqual(["c1r"]);
    expect(res.body.requests[0]).toMatchObject({ status: "declined", decline_reason: "No bus" });
    expect(res.body.requests[0]).not.toHaveProperty("email");
    expect(res.body.requests[0]).not.toHaveProperty("requested_by_id");
  });

  it("confirming a company's request shares the job with that company", async () => {
    const { rows, sent, db } = companySetup({ role: "admin" });
    rows.set("req1", { id: "req1", status: "new", email: "frontdesk@hotel.example", company_id: "c1", service: "airport_pickup", requested_time: "2026-10-27T15:30:00Z", pickup: "MBIA", dropoff: "Hotel" });
    expect((await call({ action: "confirm", request_id: "req1", trip_id: "trip1" })).body).toMatchObject({ ok: true });
    expect(db.Trip.update).toHaveBeenCalledWith("trip1", { shared_with_company: true });
    expect(sent[0].body).toContain("company portal under Jobs");
    // A website request does not share the job.
    db.Trip.update.mockClear();
    rows.set("req2", { id: "req2", status: "new", email: "ana@example.com", service: "airport_pickup", requested_time: "2026-10-27T15:30:00Z", pickup: "MBIA", dropoff: "Hotel" });
    await call({ action: "confirm", request_id: "req2", trip_id: "trip1" });
    expect(db.Trip.update).not.toHaveBeenCalled();
  });
});
