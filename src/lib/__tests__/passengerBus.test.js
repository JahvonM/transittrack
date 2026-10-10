import { describe, it, expect } from "vitest";
import { load, mock, request } from "../../../security-tests/helpers.js";
import { passengerTripState } from "@/components/passenger/passengerState";

// The bus a passenger is put on in Admin → Passengers reaches their phone,
// and taking it away takes it off their phone.
const call = async (sdk, name, body) => { const r = await load(name, sdk).default(request(body)); return { status: r.status, body: await r.json() }; };
const join = (sdk) => call(sdk, "companyAccess", { action: "verify", code: "JOIN12345678" });

describe("the passenger app is told which bus is theirs", () => {
  it("returns the bus on the passenger's directory card, and none once it's removed", async () => {
    const sdk = mock("passenger"); // directory card: caller@test.invalid rides Bus A
    const joined = await join(sdk);
    expect(joined.status).toBe(200);
    expect(joined.body.my_bus).toEqual({ id: "bus-a", name: "Bus A" });
    sdk.tables.Contact[0].vehicle_id = "";
    const again = await call(sdk, "companyAccess", { action: "context", grant: joined.body.grant });
    expect(again.status).toBe(200);
    expect(again.body.my_bus).toBeNull();
  });

  it("uses the app membership when there's no directory card", async () => {
    const sdk = mock("passenger");
    sdk.tables.Contact = [];
    const joined = await join(sdk);
    expect(joined.body.my_bus).toBeNull();
    for (const m of sdk.tables.CompanyMembership) if (m.active) m.vehicle_id = "bus-a";
    expect((await call(sdk, "companyAccess", { action: "context", grant: joined.body.grant })).body.my_bus).toEqual({ id: "bus-a", name: "Bus A" });
  });

  it("never hands out another company's bus or someone else's assignment", async () => {
    const sdk = mock("passenger");
    sdk.tables.Contact = [
      { id: "other", type: "staff", company_id: "a", name: "Someone", email: "someone@test.invalid", vehicle_id: "bus-a" },
    ];
    const joined = await join(sdk);
    expect(joined.body.my_bus).toBeNull();
    for (const m of sdk.tables.CompanyMembership) if (m.active) m.vehicle_id = "bus-b";
    expect((await call(sdk, "companyAccess", { action: "context", grant: joined.body.grant })).body.my_bus).toBeNull();
  });
});

describe("adding and removing a passenger's bus keeps their card and account in step", () => {
  const setup = () => {
    const sdk = mock("admin");
    sdk.tables.Contact = [{ id: "card", type: "passenger", company_id: "a", name: "Pat", email: "Pat@Test.invalid" }];
    sdk.tables.User.push({ id: "pat", role: "passenger", email: "pat@test.invalid", full_name: "Pat" });
    sdk.tables.CompanyMembership.push({ id: "pat-m", user_id: "pat", company_id: "a", scope: "passenger", active: true });
    return sdk;
  };
  const setBus = (sdk, key, vehicle_id) => call(sdk, "nfcCards", { action: "set_bus", person_key: key, vehicle_id });
  const card = (sdk) => sdk.tables.Contact.find((c) => c.id === "card");
  const membership = (sdk) => sdk.tables.CompanyMembership.find((m) => m.id === "pat-m");

  it("from the directory card", async () => {
    const sdk = setup();
    expect((await setBus(sdk, "contact:card", "bus-a")).status).toBe(200);
    expect(card(sdk).vehicle_id).toBe("bus-a");
    expect(membership(sdk).vehicle_id).toBe("bus-a");
    expect((await setBus(sdk, "contact:card", "")).status).toBe(200);
    expect(card(sdk).vehicle_id).toBe("");
    expect(membership(sdk).vehicle_id).toBe("");
  });

  it("from the app account (when their card is linked to the account)", async () => {
    const sdk = setup();
    sdk.tables.NfcCard = [{ id: "nfc", holder_source: "user", holder_id: "pat", company_id: "a", is_active: true, card_uid: "AABBCCDD" }];
    expect((await setBus(sdk, "user:pat", "bus-a")).status).toBe(200);
    expect(membership(sdk).vehicle_id).toBe("bus-a");
    expect(card(sdk).vehicle_id).toBe("bus-a");
    await setBus(sdk, "user:pat", "");
    expect(membership(sdk).vehicle_id).toBe("");
    expect(card(sdk).vehicle_id).toBe("");
  });
});

describe("the passenger home with no bus assigned", () => {
  it("says so instead of guessing a bus", () => {
    const stop = { name: "Town", lat: 12, lng: -61 };
    expect(passengerTripState({ stop, approaching: null, eta: null, myVehicle: null, busAssigned: false }).kind).toBe("unassigned");
    expect(passengerTripState({ stop: null, approaching: null, eta: null, myVehicle: null, busAssigned: false }).kind).toBe("choose");
    expect(passengerTripState({ stop, approaching: null, eta: null, myVehicle: { id: "bus-a", name: "Bus A" }, busAssigned: true }).kind).toBe("not_started");
  });
});
