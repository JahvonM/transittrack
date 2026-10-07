import { describe, it, expect } from "vitest";
import { load, mock, request } from "../../../security-tests/helpers.js";

// Driver phone app: a signed-in person is a driver only when an admin put
// their email on a Driver record and switched the phone app on.
function phone({ role = "staff", access = true, email = "Caller@Test.invalid" } = {}) {
  const sdk = mock(role);
  sdk.tables.Driver = [
    { id: "drv", full_name: "Dana Driver", email, phone: "+1 473 555 0100", company_id: "a", company_name: "A", phone_app_access: access },
  ];
  sdk.tables.Vehicle[0].driver_email = "caller@test.invalid";
  sdk.tables.Vehicle[0].route_id = "route-a";
  sdk.tables.Vehicle[1].driver_email = "caller@test.invalid"; // another company's bus
  sdk.tables.Route = [{ id: "route-a", company_id: "a", name: "Coastal", stops: [
    { name: "Grand Anse", lat: 12.0, lng: -61.78, order: 2 },
    { name: "Town", lat: 12.05, lng: -61.75, order: 0 },
  ] }];
  sdk.tables.User.push(
    { id: "p1", role: "staff", email: "p1@test.invalid", full_name: "Jane Rider", pickup_lat: 12.049, pickup_lng: -61.751, phone: "555" },
    { id: "p2", role: "staff", email: "p2@test.invalid", full_name: "Other Bus", pickup_lat: 12.0, pickup_lng: -61.78 },
    { id: "p3", role: "staff", email: "p3@test.invalid", full_name: "Sam", skip_pickup_today: true, skip_pickup_until: new Date(Date.now() + 3600e3).toISOString() },
  );
  sdk.tables.CompanyMembership.push(
    { id: "m1", user_id: "p1", company_id: "a", scope: "passenger", active: true, vehicle_id: "bus-a" },
    { id: "m2", user_id: "p2", company_id: "a", scope: "passenger", active: true, vehicle_id: "bus-other" },
    { id: "m3", user_id: "p3", company_id: "a", scope: "passenger", active: true },
  );
  sdk.tables.CompanyMembership[0].vehicle_id = "bus-other"; // the caller rides a different bus
  sdk.tables.Contact = [];
  sdk.tables.GroupMessage = [
    { id: "g1", vehicle_id: "bus-a", company_id: "a", channel: "dispatch", sender_role: "admin", sender_name: "Dispatch", text: "Road closed", created_date: "2026-10-07T08:00:00Z" },
    { id: "g2", vehicle_id: "bus-a", company_id: "a", channel: "staff", sender_role: "staff", sender_name: "Jane", text: "Passenger chat", created_date: "2026-10-07T08:01:00Z" },
    { id: "g3", vehicle_id: "bus-b", company_id: "b", channel: "dispatch", sender_role: "admin", text: "Other company", created_date: "2026-10-07T08:02:00Z" },
  ];
  sdk.tables.DriverDocument = [
    { id: "d1", driver_id: "drv", company_id: "a", kind: "license", file_uri: "private/licence.jpg", expiry_date: "2027-01-01" },
    { id: "d2", driver_id: "drv", company_id: "b", kind: "insurance", file_uri: "private/foreign.jpg" },
  ];
  sdk.tables.PushToken = [];
  const uploads = [];
  sdk.asServiceRole.integrations.Core.UploadPrivateFile = async ({ file }) => { uploads.push(file); return { file_uri: `private/${file.name}` }; };
  sdk.asServiceRole.integrations.Core.CreateFileSignedUrl = async ({ file_uri, expires_in }) => ({ signed_url: `https://signed.test/${file_uri}?ttl=${expires_in}` });
  const api = load("driverPhone", sdk, ["driverPhoneTokens"]);
  const send = async (body) => {
    const res = await api.default(request(body));
    return { status: res.status, body: await res.json() };
  };
  return { sdk, api, send, uploads };
}
const photo = (mime = "image/jpeg") => ({ data_base64: btoa("fake-image-bytes"), mime_type: mime });

describe("driver phone sign-in", () => {
  it("refuses people who are not signed in", async () => {
    const { send } = phone({ role: null });
    expect((await send({ action: "me" })).status).toBe(401);
  });

  it("refuses a signed-in person with no driver record, whatever role they picked", async () => {
    const { sdk, send } = phone({ role: "driver" });
    sdk.tables.Driver = [];
    const res = await send({ action: "me" });
    expect(res.status).toBe(403);
    expect(res.body.code).toBe("NOT_A_DRIVER");
  });

  it("refuses a driver record whose phone app switch is off", async () => {
    const { send } = phone({ access: false });
    expect((await send({ action: "today" })).status).toBe(403);
  });

  it("refuses an email listed as a driver by two companies", async () => {
    const { sdk, send } = phone();
    sdk.tables.Driver.push({ id: "drv-b", full_name: "Dana", email: "caller@test.invalid", company_id: "b", phone_app_access: true });
    expect((await send({ action: "me" })).status).toBe(403);
  });

  it("matches the email without caring about case and lists only that company's assigned buses", async () => {
    const { send } = phone();
    const res = await send({ action: "me" });
    expect(res.status).toBe(200);
    expect(res.body.driver.name).toBe("Dana Driver");
    expect(res.body.buses.map((b) => b.id)).toEqual(["bus-a"]);
  });
});

describe("driver phone today", () => {
  it("shows the bus, ordered stops and who is picked up where, without addresses or numbers", async () => {
    const { send } = phone();
    const res = await send({ action: "today" });
    expect(res.status).toBe(200);
    expect(res.body.route.stops.map((s) => s.name)).toEqual(["Town", "Grand Anse"]);
    expect(res.body.pickups).toEqual([
      { name: "Jane R.", stop: "Town", skipping: false, late: false },
      { name: "Sam", stop: "", skipping: true, late: false },
    ]);
    expect(JSON.stringify(res.body.pickups)).not.toMatch(/555|12\.049|p1@/);
  });

  it("will not open another company's bus", async () => {
    const { send } = phone();
    expect((await send({ action: "today", vehicle_id: "bus-b" })).status).toBe(403);
    expect((await send({ action: "messages", vehicle_id: "bus-b" })).status).toBe(403);
  });
});

describe("driver phone messages", () => {
  it("shows only dispatch and company messages for the driver's bus", async () => {
    const { send } = phone();
    const res = await send({ action: "messages" });
    expect(res.body.messages.map((m) => m.id)).toEqual(["g1"]);
  });

  it("sends as the driver on the dispatch channel", async () => {
    const { sdk, send } = phone();
    const res = await send({ action: "send", channel: "staff", text: " Running <b>5</b> min late " });
    expect(res.status).toBe(200);
    expect(sdk.tables.GroupMessage.at(-1)).toMatchObject({
      vehicle_id: "bus-a", company_id: "a", channel: "dispatch", sender_role: "driver", sender_name: "Dana Driver", text: "Running b5/b min late",
    });
    expect(res.body.message.mine).toBe(true);
    expect((await send({ action: "send", text: "   " })).status).toBe(400);
  });
});

describe("driver phone problem reports", () => {
  it("stores photos privately and links them to the report", async () => {
    const { sdk, send, uploads } = phone();
    const res = await send({ action: "report", type: "breakdown", details: "Flat tyre", photos: [photo(), photo("image/png")] });
    expect(res.status).toBe(200);
    expect(uploads).toHaveLength(2);
    expect(sdk.tables.Incident.at(-1)).toMatchObject({
      vehicle_id: "bus-a", company_id: "a", type: "breakdown", details: "Flat tyre", source: "driver_phone", status: "open",
      driver_email: "Caller@Test.invalid", photo_uris: [expect.stringMatching(/^private\/report-.*\.jpg$/), expect.stringMatching(/\.png$/)],
    });
  });

  it("refuses too many photos, other file types and empty reports", async () => {
    const { sdk, send } = phone();
    expect((await send({ action: "report", details: "x", photos: [photo(), photo(), photo(), photo()] })).status).toBe(400);
    expect((await send({ action: "report", details: "x", photos: [photo("text/html")] })).status).toBe(400);
    expect((await send({ action: "report", details: "  " })).status).toBe(400);
    expect(sdk.tables.Incident || []).toHaveLength(0);
  });
});

describe("driver phone documents and alerts", () => {
  it("returns only the driver's own company documents through short-lived links", async () => {
    const { send } = phone();
    const res = await send({ action: "documents" });
    expect(res.body.documents).toEqual([
      expect.objectContaining({ kind: "license", expiry_date: "2027-01-01", url: "https://signed.test/private/licence.jpg?ttl=120" }),
    ]);
  });

  it("reaches the phone only while the switch is on and the driver is on that bus", async () => {
    const { sdk, send, api } = phone();
    expect((await send({ action: "register_push", token: "PHONE-TOKEN-0123456789" })).status).toBe(200);
    expect(sdk.tables.PushToken).toEqual([expect.objectContaining({ token: "PHONE-TOKEN-0123456789", role: "driver_phone", company_id: "a" })]);
    const bus = () => sdk.tables.Vehicle[0];
    expect(await api.driverPhoneTokens(sdk, bus())).toEqual(["PHONE-TOKEN-0123456789"]);
    sdk.tables.Driver[0].phone_app_access = false;
    expect(await api.driverPhoneTokens(sdk, bus())).toEqual([]);
    sdk.tables.Driver[0].phone_app_access = true;
    bus().driver_email = "someone-else@test.invalid";
    expect(await api.driverPhoneTokens(sdk, bus())).toEqual([]);
  });

  it("never takes over another person's notification row", async () => {
    const { sdk, send } = phone();
    sdk.tables.PushToken = [{ id: "t-admin", token: "SHARED-TOKEN-0123456789", email: "admin@test.invalid", role: "admin" }];
    await send({ action: "register_push", token: "SHARED-TOKEN-0123456789" });
    expect(sdk.tables.PushToken.find((t) => t.id === "t-admin")).toMatchObject({ email: "admin@test.invalid", role: "admin" });
  });
});

describe("driver phone fields in admin screens", () => {
  const call = (sdk, body) => load("entityAccess", sdk).default(request(body));
  it("lets only administrators switch the phone app on", async () => {
    const manager = mock("company");
    manager.tables.Driver = [{ id: "drv", full_name: "Dana", company_id: "a" }];
    expect((await call(manager, { entity: "Driver", operation: "update", id: "drv", data: { phone_app_access: true } })).status).toBe(403);
    const admin = mock("admin");
    admin.tables.Driver = [{ id: "drv", full_name: "Dana", company_id: "a" }];
    expect((await call(admin, { entity: "Driver", operation: "update", id: "drv", data: { phone_app_access: true } })).status).toBe(200);
    expect(admin.tables.Driver[0].phone_app_access).toBe(true);
  });

  it("never lets the app write report photo links directly", async () => {
    const admin = mock("admin");
    admin.tables.Incident = [{ id: "inc", company_id: "a", type: "other" }];
    expect((await call(admin, { entity: "Incident", operation: "update", id: "inc", data: { photo_uris: ["private/licence.jpg"] } })).status).toBe(403);
  });
});
