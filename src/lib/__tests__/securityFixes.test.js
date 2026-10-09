import { describe, it, expect } from "vitest";
import { load, mock, request } from "../../../security-tests/helpers.js";

// Fixes from the October 2026 security audit.
const driverTablet = { id: "drv", created_date: "2026-10-01T00:00:00Z", status: "active", paired: true, kiosk_type: "driver", company_id: "a", company_name: "A", vehicle_id: "bus-a", pairing_code: "PAIR12345678" };
const call = async (sdk, name, body) => { const r = await load(name, sdk).default(request(body)); return { status: r.status, body: await r.json() }; };

function tabletSetup() {
  const sdk = mock("staff");
  sdk.tables.KioskDevice = [structuredClone(driverTablet), ...sdk.tables.KioskDevice];
  sdk.tables.Vehicle.push({ id: "bus-a2", company_id: "a", name: "Other bus" });
  sdk.tables.Contact.push(
    { id: "other-bus", type: "passenger", company_id: "a", name: "Rides Other Bus", phone: "+1 473 555 0100", pickup_lat: 12.05, pickup_lng: -61.75, vehicle_id: "bus-a2" },
    { id: "no-bus", type: "passenger", company_id: "a", name: "No Bus Yet", phone: "+1 473 555 0101", pickup_lat: 12.06, pickup_lng: -61.76 },
  );
  sdk.tables.Trip = [{ id: "t", company_id: "a", vehicle_id: "bus-a", status: "scheduled", passenger_name: "Taxi Rider", passenger_phone: "555" }];
  return sdk;
}

describe("driver tablet passenger list", () => {
  it("is empty, with no trips or chat, until the driver unlocks the tablet", async () => {
    const sdk = tabletSetup();
    const res = await call(sdk, "driverSession", { device_id: "drv", action: "heartbeat" });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ staff: [], trips: [], group_messages: [] });
    expect(res.body.vehicle.name).toBe("Bus A");
  });

  it("after the PIN, lists this bus's riders and unassigned passengers only", async () => {
    const sdk = tabletSetup();
    const unlock = await call(sdk, "driverSession", { device_id: "drv", action: "verify_pin", pin: "1234" });
    expect(unlock.status).toBe(200);
    const res = await call(sdk, "driverSession", { device_id: "drv", action: "heartbeat", driver_grant: unlock.body.driver_grant });
    expect(res.body.staff.map((s) => s.id).sort()).toEqual(["no-bus", "rider"]);
    expect(res.body.trips.map((t) => t.id)).toEqual(["t"]);
  });
});

describe("bus PIN attempts", () => {
  it("a burst of wrong PINs sent at once can't get past the five-try limit", async () => {
    const sdk = tabletSetup();
    // One loaded function, as in production, where requests share it.
    const handler = load("driverSession", sdk).default;
    const results = await Promise.all(Array.from({ length: 10 }, async (_, i) => {
      const r = await handler(request({ device_id: "drv", action: "verify_pin", pin: String(5000 + i) }));
      return { status: r.status };
    }));
    expect(results.filter((r) => r.status === 403)).toHaveLength(5);
    expect(results.filter((r) => r.status === 429)).toHaveLength(5);
    expect((await call(sdk, "driverSession", { device_id: "drv", action: "verify_pin", pin: "1234" })).status).toBe(429);
  });
});

describe("boarding tablet codes", () => {
  it("a code for another bus doesn't say whose it is or which bus", async () => {
    const sdk = mock("staff");
    sdk.tables.Contact.push({ id: "p2", type: "passenger", company_id: "a", name: "Victim Name", access_code: "987654321098", vehicle_id: "bus-a2", vehicle_name: "Bus 9" });
    const res = await call(sdk, "kioskCheckIn", { device_id: "tablet", action: "lookup_code", code: "987654321098" });
    expect(res.status).toBe(403);
    expect(res.body.error).toBe("wrong_bus");
    expect(JSON.stringify(res.body)).not.toMatch(/Victim|Bus 9/);
  });

  it("pauses the keypad after many codes that match nobody", async () => {
    const sdk = mock("staff");
    sdk.tables.VerificationAttempt = Array.from({ length: 30 }, (_, i) => ({ id: "m" + i, scope: "passenger-code-miss:tablet", attempted_at: new Date().toISOString() }));
    const res = await call(sdk, "kioskCheckIn", { device_id: "tablet", action: "lookup_code", code: "000011112222" });
    expect(res.status).toBe(429);
  });

  it("records a miss for a code that matches nobody", async () => {
    const sdk = mock("staff");
    await call(sdk, "kioskCheckIn", { device_id: "tablet", action: "lookup_code", code: "000011112222" });
    expect((sdk.tables.VerificationAttempt || []).filter((r) => r.scope === "passenger-code-miss:tablet")).toHaveLength(1);
  });
});

describe("passenger-chosen boarding codes", () => {
  const setCode = (sdk, code) => call(sdk, "generateOneTimeCode", { action: "boarding_set_code", code });
  it("refuses codes anyone would guess first", async () => {
    for (const code of ["111111", "123456", "654321", "121212", "123123", "112233", "147258"]) {
      const res = await setCode(mock("staff"), code);
      expect([code, res.status]).toEqual([code, 400]);
      expect(res.body.error).toMatch(/too easy/);
    }
  });
  it("allows only five changes a day", async () => {
    const sdk = mock("staff");
    sdk.tables.VerificationAttempt = Array.from({ length: 5 }, (_, i) => ({ id: "c" + i, scope: "boarding-code-change:caller", attempted_at: new Date().toISOString() }));
    expect((await setCode(sdk, "583920")).status).toBe(429);
  });
});

describe("chat links", () => {
  const send = (role, data) => call(mock(role), "entityAccess", { entity: "GroupMessage", operation: "create", data: { company_id: "a", vehicle_id: "bus-a", channel: role === "company" ? "company" : "staff", ...data } });
  it("passengers can only post photos and voice notes uploaded in the app", async () => {
    expect((await send("staff", { message_type: "image", media_url: "https://tracker.example.com/pixel.png" })).status).toBe(400);
    expect((await send("staff", { message_type: "image", media_url: "javascript:alert(1)" })).status).toBe(400);
    expect((await send("staff", { message_type: "image", media_url: "http://base44.app/api/apps/x/files/a.png" })).status).toBe(400);
    expect((await send("staff", { message_type: "script", text: "x" })).status).toBe(400);
    expect((await send("staff", { message_type: "image", media_url: "https://base44.app/api/apps/x/files/mp/public/x/a.jpg" })).status).toBe(200);
  });
  it("admins may use other https links, never script links", async () => {
    const sdk = mock("admin");
    const make = (data) => call(sdk, "entityAccess", { entity: "Advertisement", operation: "create", data: { title: "Ad", ...data } });
    expect((await make({ image_url: "https://cdn.example.com/a.png", link: "https://example.com" })).status).toBe(200);
    expect((await make({ image_url: "javascript:alert(1)" })).status).toBe(400);
    expect((await make({ link: "javascript:alert(1)" })).status).toBe(400);
  });
});

describe("tablet uploads", () => {
  it("refuse web pages, oversized files and non-PNG signatures", async () => {
    const sdk = tabletSetup();
    const unlock = await call(sdk, "driverSession", { device_id: "drv", action: "verify_pin", pin: "1234" });
    const g = unlock.body.driver_grant;
    const media = (extra) => call(sdk, "driverSession", { device_id: "drv", driver_grant: g, action: "send_chat_media", channel: "staff", data_base64: "AAAA", ...extra });
    expect((await media({ message_type: "image", mime_type: "text/html" })).status).toBe(400);
    expect((await media({ message_type: "audio", mime_type: "image/svg+xml" })).status).toBe(400);
    expect((await media({ message_type: "image", mime_type: "image/jpeg", data_base64: "A".repeat(12 * 1024 * 1024) })).status).toBe(413);
    const sign = await call(sdk, "driverSession", { device_id: "drv", driver_grant: g, action: "sign_trip", trip_id: "t", mode: "pickup", data_base64: "AAAA", mime_type: "text/html" });
    expect(sign.status).toBe(400);
  });
});

describe("usage limits", () => {
  it("a passenger can make at most ten taxi bookings an hour", async () => {
    const sdk = mock("staff");
    sdk.tables.Company[1].service_types = ["taxi"];
    sdk.tables.VerificationAttempt = Array.from({ length: 10 }, (_, i) => ({ id: "b" + i, scope: "taxi-booking:caller", attempted_at: new Date().toISOString() }));
    const res = await call(sdk, "bookTaxi", { passenger_name: "Pat", phone: "555", pickup_name: "Here", dropoff_name: "There", company_id: "b" });
    expect(res.status).toBe(429);
    expect(sdk.tables.Trip || []).toHaveLength(0);
  });
});
