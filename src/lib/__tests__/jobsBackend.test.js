import { describe, it, expect } from "vitest";
import { digest, load, mock, request } from "../../../security-tests/helpers.js";

// Jobs dispatch gives a bus (airport runs, hotel tours, transfers): what the
// driver tablet gets and sends, who can read and change jobs, places, clients
// and invoices, and how invoices are made.

const PNG = "data:image/png;base64," + Buffer.from("fake-png-bytes").toString("base64");
const job = (over = {}) => ({
  id: "job-1", company_id: "a", company_name: "A", vehicle_id: "bus-a", vehicle_name: "Bus A", status: "scheduled",
  job_type: "airport_pickup", pickup_name: "Airport", pickup_lat: 12.0, pickup_lng: -61.78, dropoff_name: "Grand Hotel",
  dropoff_lat: 12.05, dropoff_lng: -61.75, scheduled_time: "2026-10-20T14:00:00Z", flight_number: "AA 123", guests: 3,
  price: 120, currency: "USD", client_id: "hotel", client_name: "Grand Hotel", invoice_id: "", ...over,
});

async function tablet(trips = [job()]) {
  const sdk = mock(null);
  sdk.tables.KioskDevice[0].kiosk_type = "driver";
  sdk.tables.Trip = trips.map((t) => structuredClone(t));
  const uploads = [];
  sdk.asServiceRole.integrations.Core.UploadPrivateFile = async ({ file }) => { uploads.push(file); return { file_uri: "private/sig-" + uploads.length + ".png" }; };
  sdk.asServiceRole.integrations.Core.UploadPublicFile = async () => { throw new Error("signatures must not be public"); };
  const api = load("driverSession", sdk, ["issueGrant"]);
  const grant = await api.issueGrant(sdk, sdk.tables.KioskDevice[0], "driver", "bus-a", 60000);
  const send = async (body) => {
    const res = await api.default(request({ device_id: "tablet", driver_grant: grant, ...body }));
    return { status: res.status, body: await res.json() };
  };
  return { sdk, send, uploads };
}

describe("driver tablet jobs", () => {
  it("gets open jobs without prices, invoices or signature files, even after 100 finished trips", async () => {
    const old = Array.from({ length: 120 }, (_, i) => job({ id: "old-" + i, status: "completed", scheduled_time: `2026-01-01T${String(i % 24).padStart(2, "0")}:00:00Z` }));
    const { send } = await tablet([...old, job({ pickup_signature_uri: "private/x.png", invoice_number: "INV-1" })]);
    const { status, body } = await send({ action: "heartbeat" });
    expect(status).toBe(200);
    expect(body.driver_unlocked).toBe(true);
    expect(body.trips.map((t) => t.id)).toEqual(["job-1"]);
    const [t] = body.trips;
    expect(t).toMatchObject({ job_type: "airport_pickup", flight_number: "AA 123", guests: 3, client_name: "Grand Hotel", stops: [] });
    for (const key of ["price", "currency", "invoice_id", "invoice_number", "client_id", "pickup_signature_uri"]) expect(t).not.toHaveProperty(key);
  });

  it("a locked tablet gets no jobs and says so", async () => {
    const sdk = mock(null);
    sdk.tables.KioskDevice[0].kiosk_type = "driver";
    sdk.tables.Trip = [job()];
    const res = await load("driverSession", sdk).default(request({ device_id: "tablet", action: "heartbeat" }));
    const body = await res.json();
    expect(body.trips).toEqual([]);
    expect(body.driver_unlocked).toBe(false);
  });

  it("steps only go forward, and a resent step changes nothing", async () => {
    const { sdk, send } = await tablet();
    expect((await send({ action: "update_trip_status", trip_id: "job-1", status: "arrived" })).body.trip.status).toBe("arrived");
    const again = await send({ action: "update_trip_status", trip_id: "job-1", status: "on_the_way" });
    expect(again.status).toBe(200);
    expect(sdk.tables.Trip[0].status).toBe("arrived");
    expect(again.body.trip).not.toHaveProperty("price");
  });

  it("a step saved offline keeps the time it happened", async () => {
    const { sdk, send } = await tablet();
    const at = new Date(Date.now() - 20 * 60_000).toISOString();
    await send({ action: "update_trip_status", trip_id: "job-1", status: "on_the_way", queue_replay: true, occurred_at: at,
      expected_device_id: "tablet", expected_company_id: "a", expected_vehicle_id: "bus-a" });
    expect(sdk.tables.Trip[0].started_at).toBe(at);
  });

  it("a saved step for a job dispatch cancelled or moved is let go, not refused", async () => {
    const { send } = await tablet([job({ status: "cancelled" }), job({ id: "job-2", vehicle_id: "bus-b" })]);
    const replay = { queue_replay: true, expected_device_id: "tablet", expected_company_id: "a", expected_vehicle_id: "bus-a" };
    for (const trip_id of ["job-1", "job-2", "missing"]) {
      const res = await send({ action: "update_trip_status", trip_id, status: "on_the_way", ...replay });
      expect(res.status).toBe(200);
      expect(res.body.skipped).toBe(true);
    }
    // Live, the driver is told.
    expect((await send({ action: "update_trip_status", trip_id: "job-1", status: "on_the_way" })).status).toBe(409);
    expect((await send({ action: "update_trip_status", trip_id: "job-2", status: "on_the_way" })).status).toBe(403);
  });

  it("signatures are private, with who, how many guests, where and when", async () => {
    const { sdk, send, uploads } = await tablet([job({ status: "on_the_way" })]);
    const res = await send({ action: "sign_trip", trip_id: "job-1", mode: "pickup", data_base64: PNG, mime_type: "image/png", signed_by: "Ms <b>Lee</b>", guests: 4, lat: 12.01, lng: -61.77, client_request_id: "req-pickup-1" });
    expect(res.status).toBe(200);
    expect(uploads).toHaveLength(1);
    expect(sdk.tables.Trip[0]).toMatchObject({ pickup_signature_uri: "private/sig-1.png", pickup_signed_by: "Ms bLee/b", pickup_signed_guests: 4, pickup_signed_lat: 12.01, pickup_signed_lng: -61.77 });
    expect(sdk.tables.Trip[0].pickup_signature_url).toBeUndefined();
    expect(res.body.trip).not.toHaveProperty("pickup_signature_uri");
    expect(res.body.trip.pickup_signed_at).toBeTruthy();
    // Sent again from the tablet's saved work: nothing new is uploaded.
    const again = await send({ action: "sign_trip", trip_id: "job-1", mode: "pickup", data_base64: PNG, signed_by: "Ms Lee", client_request_id: "req-pickup-1" });
    expect(again.status).toBe(200);
    expect(uploads).toHaveLength(1);
    // A second, different signature is refused.
    expect((await send({ action: "sign_trip", trip_id: "job-1", mode: "pickup", data_base64: PNG, signed_by: "Someone", client_request_id: "req-pickup-2" })).status).toBe(409);
  });

  it("records whether the guest or the hotel front desk signed", async () => {
    const { sdk, send } = await tablet([job({ status: "arrived" }), job({ id: "job-2", status: "on_the_way" })]);
    expect((await send({ action: "sign_trip", trip_id: "job-1", mode: "dropoff", data_base64: PNG, signed_by: "Mary", signed_role: "reception" })).body.trip.dropoff_signed_role).toBe("reception");
    expect(sdk.tables.Trip[0].dropoff_signed_role).toBe("reception");
    await send({ action: "sign_trip", trip_id: "job-2", mode: "pickup", data_base64: PNG, signed_by: "Ann", signed_role: "boss" });
    expect(sdk.tables.Trip[1].pickup_signed_role).toBe("guest");
  });

  it("the drop-off signature finishes the job; a bad position never stops it", async () => {
    const { sdk, send } = await tablet([job({ status: "arrived" })]);
    const res = await send({ action: "sign_trip", trip_id: "job-1", mode: "dropoff", data_base64: PNG, signed_by: "Desk", lat: 999, lng: "x" });
    expect(res.status).toBe(200);
    expect(sdk.tables.Trip[0]).toMatchObject({ status: "completed", dropoff_signed_lat: null, dropoff_signed_lng: null, dropoff_signed_guests: null });
    expect(sdk.tables.Vehicle[0].status).toBe("idle");
  });

  it("refuses a nonsense guest count and a cancelled job", async () => {
    const { send } = await tablet([job({ status: "on_the_way" }), job({ id: "job-2", status: "cancelled" })]);
    expect((await send({ action: "sign_trip", trip_id: "job-1", mode: "pickup", data_base64: PNG, guests: -2 })).status).toBe(400);
    expect((await send({ action: "sign_trip", trip_id: "job-2", mode: "pickup", data_base64: PNG })).status).toBe(409);
  });

  it("marks tour stops reached, once", async () => {
    const { sdk, send } = await tablet([job({ job_type: "hotel_tour", status: "on_the_way", stops: [{ name: "Fort George" }, { name: "Grand Etang" }] })]);
    const first = await send({ action: "reach_stop", trip_id: "job-1", index: 1 });
    expect(first.status).toBe(200);
    const at = sdk.tables.Trip[0].stops[1].reached_at;
    expect(at).toBeTruthy();
    expect(sdk.tables.Trip[0].stops[0].reached_at).toBeUndefined();
    await send({ action: "reach_stop", trip_id: "job-1", index: 1 });
    expect(sdk.tables.Trip[0].stops[1].reached_at).toBe(at);
    expect((await send({ action: "reach_stop", trip_id: "job-1", index: 5 })).status).toBe(400);
  });
});

describe("who can see and change jobs, places, clients and invoices", () => {
  const gateway = (role, setup = () => {}) => {
    const sdk = mock(role);
    sdk.tables.Trip = [job()];
    sdk.tables.Client = [{ id: "hotel", company_id: "a", name: "Grand Hotel", email: "desk@test.invalid" }];
    sdk.tables.Place = [{ id: "airport", company_id: "a", name: "Airport", kind: "airport", lat: 12, lng: -61.78 }];
    sdk.tables.Invoice = [{ id: "inv", company_id: "a", client_id: "hotel", number: "INV-2026-0001", total: 120, status: "draft", lines: [] }];
    setup(sdk);
    const handler = load("entityAccess", sdk).default;
    const call = async (body) => { const res = await handler(request(body)); return { status: res.status, body: await res.json() }; };
    return { sdk, call };
  };

  it("an administrator creates a job with its details, and the client's name comes from the client", async () => {
    const { sdk, call } = gateway("admin");
    const res = await call({ entity: "Trip", operation: "create", data: {
      vehicle_id: "bus-a", job_type: "hotel_tour", client_id: "hotel", client_name: "Anything", pickup_name: "Grand Hotel", dropoff_name: "Grand Hotel",
      stops: [{ name: "Fort George", lat: 12.05, lng: -61.75, sneaky: 1 }], guests: "6", price: "99.999", currency: "XCD", scheduled_time: "2026-10-21T13:00:00Z", status: "scheduled",
    } });
    expect(res.status).toBe(200);
    const row = sdk.tables.Trip.at(-1);
    expect(row).toMatchObject({ company_id: "a", client_name: "Grand Hotel", guests: 6, price: 100, stops: [{ name: "Fort George", address: "", lat: 12.05, lng: -61.75 }] });
  });

  it("refuses bad job details", async () => {
    const { call } = gateway("admin");
    for (const data of [{ job_type: "rocket" }, { guests: -1 }, { price: -5 }, { currency: "EUR" }, { client_id: "nobody" }, { stops: [{ name: "" }] }, { flight_time: "soon" }, { pickup_lat: 12 }]) {
      expect((await call({ entity: "Trip", operation: "update", id: "job-1", data })).status).toBe(400);
    }
  });

  it("signatures and invoice marks can't be written through the app's data gateway", async () => {
    const { call } = gateway("admin");
    for (const data of [{ pickup_signature_uri: "x" }, { dropoff_signed_guests: 3 }, { invoice_id: "inv" }, { invoice_number: "INV-9" }]) {
      expect((await call({ entity: "Trip", operation: "update", id: "job-1", data })).status).toBe(403);
    }
    expect((await call({ entity: "Invoice", operation: "update", id: "inv", data: { total: 1 } })).status).toBe(403);
    expect((await call({ entity: "Invoice", operation: "delete", id: "inv" })).status).toBe(403);
    expect((await call({ entity: "Invoice", operation: "create", data: { number: "X", client_id: "hotel" } })).status).toBe(403);
  });

  it("company managers can't see clients, places or invoices, or set a job's price or client", async () => {
    const { call } = gateway("company");
    for (const entity of ["Client", "Place", "Invoice"]) {
      const list = await call({ entity, operation: "list" });
      expect(list.status).toBe(200);
      expect(list.body.result).toEqual([]);
      expect((await call({ entity, operation: "create", data: entity === "Invoice" ? { number: "X" } : { name: "X" } })).status).toBe(403);
    }
    expect((await call({ entity: "Trip", operation: "update", id: "job-1", data: { price: 1 } })).status).toBe(403);
    expect((await call({ entity: "Trip", operation: "update", id: "job-1", data: { client_id: "hotel" } })).status).toBe(403);
  });

  it("passengers still see only a job's bare outline", async () => {
    const { call } = gateway("staff");
    const res = await call({ entity: "Trip", operation: "list" });
    expect(res.status).toBe(200);
    for (const row of res.body.result) {
      for (const key of ["price", "client_name", "passenger_name", "flight_number", "notes", "guests", "pickup_signature_uri"]) expect(row).not.toHaveProperty(key);
    }
  });

  it("places and clients are checked", async () => {
    const { call } = gateway("admin");
    expect((await call({ entity: "Place", operation: "create", data: { name: "Hotel", kind: "hotel", lat: 12, lng: -61.7 } })).status).toBe(200);
    expect((await call({ entity: "Place", operation: "create", data: { name: "", kind: "hotel" } })).status).toBe(400);
    expect((await call({ entity: "Place", operation: "create", data: { name: "X", lat: 200, lng: 0 } })).status).toBe(400);
    expect((await call({ entity: "Client", operation: "create", data: { name: "Resort", email: "not-an-email" } })).status).toBe(400);
    expect((await call({ entity: "Client", operation: "create", data: { name: "Resort", currency: "USD", email: "acc@test.invalid" } })).status).toBe(200);
  });
});

describe("invoices", () => {
  const billing = (role = "admin") => {
    const sdk = mock(role);
    sdk.tables.Client = [{ id: "hotel", name: "Grand Hotel", email: "desk@test.invalid", address: "Grand Anse" }];
    sdk.tables.Trip = [
      job({ id: "j1", status: "completed", completed_at: "2026-09-03T15:00:00Z", price: 100, currency: "USD" }),
      job({ id: "j2", status: "completed", completed_at: "2026-09-20T15:00:00Z", price: 50.5, currency: "USD" }),
      // 11pm on 30 September in Grenada is already 1 October in UTC: still September's.
      job({ id: "j3", status: "completed", completed_at: "2026-10-01T03:00:00Z", price: 25, currency: "USD" }),
      job({ id: "j4", status: "completed", completed_at: "2026-09-10T15:00:00Z", price: null }),
      job({ id: "j5", status: "completed", completed_at: "2026-10-05T15:00:00Z", price: 70, currency: "USD" }),
      job({ id: "j6", status: "scheduled", price: 80 }),
      job({ id: "j7", status: "completed", completed_at: "2026-09-12T15:00:00Z", price: 300, currency: "XCD" }),
    ];
    sdk.tables.Invoice = [];
    sdk.atomicFetch = async (url) => {
      if (url === "https://files.test/signed") return new Response(Buffer.from("png-bytes"));
      throw new Error("unexpected " + url);
    };
    sdk.asServiceRole.integrations.Core.CreateFileSignedUrl = async ({ file_uri }) => ({ signed_url: file_uri ? "https://files.test/signed" : "" });
    const handler = load("jobBilling", sdk).default;
    const call = async (body) => { const res = await handler(request({ time_zone: "America/Grenada", ...body })); return { status: res.status, body: await res.json() }; };
    return { sdk, call };
  };
  const september = { client_id: "hotel", from: "2026-09-01", to: "2026-09-30" };

  it("administrators only", async () => {
    for (const role of ["company", "staff", "mechanic"]) expect((await billing(role).call({ action: "preview_invoice", ...september })).status).toBe(403);
    expect((await billing(null).call({ action: "preview_invoice", ...september })).status).toBe(401);
  });

  it("previews the period's finished, priced jobs per currency, counting the unpriced ones", async () => {
    const { call } = billing();
    const { status, body } = await call({ action: "preview_invoice", ...september });
    expect(status).toBe(200);
    expect(body.unpriced).toBe(1);
    const usd = body.invoices.find((i) => i.currency === "USD");
    expect(usd.lines.map((l) => l.trip_id)).toEqual(["j1", "j2", "j3"]);
    expect(usd.total).toBe(175.5);
    expect(usd.lines[2].date).toBe("2026-09-30");
    expect(body.invoices.find((i) => i.currency === "XCD").total).toBe(300);
  });

  it("creates numbered invoices, marks the jobs, and never puts a job on two invoices", async () => {
    const { sdk, call } = billing();
    const { status, body } = await call({ action: "create_invoice", ...september, due_days: 14 });
    expect(status).toBe(200);
    expect(body.invoices).toHaveLength(2);
    const numbers = body.invoices.map((i) => i.number).sort();
    expect(numbers[0]).toMatch(/^INV-\d{4}-0001$/);
    expect(numbers[1]).toMatch(/^INV-\d{4}-0002$/);
    expect(sdk.tables.Trip.find((t) => t.id === "j1").invoice_number).toBeTruthy();
    expect(body.invoices[0]).toMatchObject({ client_name: "Grand Hotel", client_email: "desk@test.invalid", status: "draft" });
    // Again: nothing left to invoice, even if a job's mark were missing.
    sdk.tables.Trip.find((t) => t.id === "j2").invoice_id = "";
    expect((await call({ action: "create_invoice", ...september })).status).toBe(400);
  });

  it("voiding an invoice frees its jobs for a new one", async () => {
    const { sdk, call } = billing();
    const [usd] = (await call({ action: "create_invoice", ...september })).body.invoices.filter((i) => i.currency === "USD");
    expect((await call({ action: "set_invoice_status", invoice_id: usd.id, status: "paid" })).body.invoice.paid_at).toBeTruthy();
    expect((await call({ action: "void_invoice", invoice_id: usd.id })).status).toBe(200);
    expect(sdk.tables.Trip.find((t) => t.id === "j1").invoice_id).toBe("");
    expect((await call({ action: "set_invoice_status", invoice_id: usd.id, status: "sent" })).status).toBe(409);
    const again = await call({ action: "preview_invoice", ...september });
    expect(again.body.invoices.find((i) => i.currency === "USD").lines).toHaveLength(3);
  });

  it("refuses a bad period", async () => {
    const { call } = billing();
    expect((await call({ action: "preview_invoice", client_id: "hotel", from: "2026-09-30", to: "2026-09-01" })).status).toBe(400);
    expect((await call({ action: "preview_invoice", client_id: "hotel", from: "Sept", to: "2026-09-01" })).status).toBe(400);
    expect((await call({ action: "preview_invoice", client_id: "nobody", from: "2026-09-01", to: "2026-09-30" })).status).toBe(404);
  });

  it("opens private signatures as pictures; old public ones keep their link", async () => {
    const { sdk, call } = billing();
    sdk.tables.Trip[0].pickup_signature_uri = "private/sig.png";
    sdk.tables.Trip[0].dropoff_signature_url = "https://base44.app/old.png";
    const { status, body } = await call({ action: "signatures", trip_id: "j1" });
    expect(status).toBe(200);
    expect(body.pickup).toBe("data:image/png;base64," + Buffer.from("png-bytes").toString("base64"));
    expect(body.dropoff).toBe("https://base44.app/old.png");
  });
});

describe("signing tablet", () => {
  const TOKEN = "c".repeat(64);
  const signer = { id: "signer", kiosk_type: "job_signing", status: "active", paired: true, company_id: "a", company_name: "A", vehicle_id: "bus-a", vehicle_name: "Bus A", pairing_code: "PAIRSIGN1234", created_date: "2026-10-12T00:00:00Z" };
  const setup = (trips = [job({ status: "on_the_way", passenger_phone: "+1 473 555 0100", notes: "VIP guest" })]) => {
    const sdk = mock(null);
    sdk.tables.KioskDevice.push(structuredClone(signer));
    sdk.tables.DeviceCredential = [{ id: "cred", device_id: "signer", token_hash: digest(TOKEN), company_id: "a", vehicle_id: "bus-a", kiosk_type: "job_signing", pairing_code_hash: digest("PAIRSIGN1234"), issued_at: "2026-10-12T00:00:00Z", expires_at: "2099-01-01T00:00:00Z" }];
    sdk.tables.Trip = trips.map((t) => structuredClone(t));
    sdk.asServiceRole.integrations.Core.UploadPrivateFile = async () => ({ file_uri: "private/guest-sig.png" });
    const handler = load("jobSigning", sdk).default;
    const call = async (body, token = TOKEN) => { const res = await handler(request({ device_id: "signer", device_token: token, ...body })); return { status: res.status, body: await res.json() }; };
    return { sdk, call };
  };

  it("shows only the bus's jobs under way, with only what guests may see", async () => {
    const { call } = setup([job({ status: "on_the_way", passenger_phone: "+1 473 555 0100", notes: "VIP guest" }), job({ id: "done", status: "completed" }),
      job({ id: "later", status: "scheduled", passenger_name: "Next group" }), job({ id: "other-bus", vehicle_id: "bus-b", status: "on_the_way" })]);
    const { status, body } = await call({ action: "state" });
    expect(status).toBe(200);
    expect(body.jobs.map((j) => j.id)).toEqual(["job-1"]);
    expect(body.jobs[0]).toMatchObject({ pickup_name: "Airport", dropoff_name: "Grand Hotel", guests: 3, flight_number: "AA 123" });
    for (const key of ["passenger_phone", "notes", "price", "client_name", "client_id", "invoice_id", "pickup_signature_uri"]) expect(body.jobs[0]).not.toHaveProperty(key);
  });

  it("only its own current token lets it in, and only signing tablets", async () => {
    const { sdk, call } = setup();
    expect((await call({ action: "state" }, "d".repeat(64))).status).toBe(401);
    expect((await call({ action: "state" }, "")).status).toBe(401);
    sdk.tables.KioskDevice.find((d) => d.id === "signer").kiosk_type = "bus_boarding";
    expect((await call({ action: "state" })).status).toBe(401);
  });

  it("saves the guest's signature privately and refuses it twice", async () => {
    const { sdk, call } = setup();
    const res = await call({ action: "sign", trip_id: "job-1", mode: "pickup", data_base64: PNG, signed_by: "Mr Smith", guests: 4, client_request_id: "guest-req-1" });
    expect(res.status).toBe(200);
    expect(sdk.tables.Trip[0]).toMatchObject({ pickup_signature_uri: "private/guest-sig.png", pickup_signed_by: "Mr Smith", pickup_signed_guests: 4 });
    expect(res.body.trip).not.toHaveProperty("notes");
    expect((await call({ action: "sign", trip_id: "job-1", mode: "pickup", data_base64: PNG, signed_by: "Someone else", client_request_id: "guest-req-2" })).status).toBe(409);
  });

  it("can't sign another bus's job, or replay work saved for another tablet", async () => {
    const { call } = setup([job({ id: "other", vehicle_id: "bus-b", status: "on_the_way" })]);
    expect((await call({ action: "sign", trip_id: "other", mode: "pickup", data_base64: PNG })).status).toBe(403);
    expect((await call({ action: "sign", trip_id: "other", mode: "pickup", data_base64: PNG, queue_replay: true, expected_device_id: "someone", expected_company_id: "a", expected_vehicle_id: "bus-a" })).status).toBe(409);
  });

  it("can't use the boarding tablet's passenger lookups", async () => {
    const { sdk } = setup();
    const res = await load("kioskCheckIn", sdk).default(request({ device_id: "signer", device_token: TOKEN, action: "search_staff", query: "Ca" }));
    expect(res.status).toBe(401);
  });

  it("the driver tablet knows the bus has one", async () => {
    const { send, sdk } = await tablet();
    expect((await send({ action: "heartbeat" })).body.has_signing_tablet).toBe(false);
    sdk.tables.KioskDevice.push(structuredClone(signer));
    expect((await send({ action: "heartbeat" })).body.has_signing_tablet).toBe(true);
    expect((await send({ action: "heartbeat", light: true })).body).not.toHaveProperty("has_signing_tablet");
  });
});

describe("front-desk kiosk", () => {
  it("the front-desk sign-in is gone", async () => {
    const sdk = mock(null);
    Object.assign(sdk.tables.KioskDevice[0], { kiosk_type: "front_desk", vehicle_id: "" });
    const res = await load("kioskCheckIn", sdk).default(request({ device_id: "tablet", action: "front_desk_sign_in", full_name: "Visitor" }));
    expect(res.status).toBe(400);
    expect(sdk.tables.FrontDeskSignIns).toBeUndefined();
  });
});
