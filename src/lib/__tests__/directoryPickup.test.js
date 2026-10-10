import { describe, it, expect } from "vitest";
import { load, mock, request } from "../../../security-tests/helpers.js";
const point = { pickup_name: "Belmont junction", pickup_lat: 12.049, pickup_lng: -61.748 };
const save = (sdk, person_key, extra = {}) => load("nfcCards", sdk).default(request({ action: "set_pickup", person_key, ...point, ...extra }));
const setup = (role = "admin") => {
  const sdk = mock(role);
  sdk.tables.Contact = [{ id: "pat-card", type: "staff", company_id: "a", name: "Pat", email: "Pat@Test.invalid", vehicle_id: "bus-a", nfc_card_tag: "CARD", dropoff_name: "Hotel" }];
  sdk.tables.User.push({ id: "pat", role: "staff", email: "pat@test.invalid", full_name: "Pat", company_id: "b", pickup_route_id: "old-route" });
  sdk.tables.CompanyMembership.push({ id: "pat-m", user_id: "pat", company_id: "a", scope: "passenger", active: true, vehicle_id: "bus-a" });
  return sdk;
};
describe("directory pickup editing", () => {
  it("saves linked contact and account pickups, preserves credentials, bus and role, and clears stale route", async () => {
    const sdk = setup();
    const res = await save(sdk, "contact:pat-card", { role: "admin", vehicle_id: "bus-b", company_id: "b", nfc_card_tag: "REPLACED" });
    expect(res.status).toBe(200);
    const pat = sdk.tables.User.find(u => u.id === "pat");
    expect(pat).toMatchObject({ ...point, role: "staff", company_id: "b", pickup_route_id: "" });
    expect(sdk.tables.Contact[0]).toMatchObject({ ...point, vehicle_id: "bus-a", nfc_card_tag: "CARD", dropoff_name: "Hotel" });
    expect(sdk.tables.CompanyMembership.find(m => m.id === "pat-m").vehicle_id).toBe("bus-a");
    expect(sdk.tables.KioskDevice[0].directory_sent_at).toBeTruthy();
    expect(await res.json()).not.toHaveProperty("card_uid");
  });
  it("updates both representations when the account owns their NFC card", async () => {
    const sdk = setup();
    sdk.tables.NfcCard = [{ id: "nfc", holder_source: "user", holder_id: "pat", company_id: "a", is_active: true, card_uid: "AABBCCDD" }];
    expect((await save(sdk, "user:pat")).status).toBe(200);
    expect(sdk.tables.Contact[0]).toMatchObject(point);
    expect(sdk.tables.User.find(u => u.id === "pat")).toMatchObject(point);
    expect(sdk.tables.NfcCard[0].card_uid).toBe("AABBCCDD");
    const directory = await load("nfcCards", sdk).default(request({ action: "directory" }));
    expect((await directory.json()).people.find(p => p.key === "user:pat")).toMatchObject(point);
  });
  it("allows an admin to set an unassigned email passenger's pickup without creating a contact", async () => {
    const sdk = setup(); sdk.tables.Contact = []; sdk.tables.CompanyMembership = [];
    expect((await save(sdk, "user:pat")).status).toBe(200);
    expect(sdk.tables.User.find(u => u.id === "pat")).toMatchObject(point);
    expect(sdk.tables.Contact).toEqual([]);
  });
  it("company manager can edit own passenger but cannot target another company", async () => {
    const sdk = setup("company");
    sdk.tables.Contact.push({ id: "foreign", type: "staff", company_id: "b", name: "Other" });
    expect((await save(sdk, "contact:pat-card")).status).toBe(200);
    const writes = sdk.writes.length;
    expect((await save(sdk, "contact:foreign", { company_id: "a" })).status).toBe(404);
    expect(sdk.writes).toHaveLength(writes);
    expect(sdk.tables.Contact.find(c => c.id === "foreign")).not.toHaveProperty("pickup_lat");
  });
  it("does not alter a same-email account or contact from a different company", async () => {
    const sdk = setup("company");
    sdk.tables.Contact.push({ id: "foreign", type: "staff", company_id: "b", name: "Other", email: "pat@test.invalid" });
    sdk.tables.CompanyMembership.find(m => m.id === "pat-m").company_id = "b";
    expect((await save(sdk, "contact:pat-card")).status).toBe(200);
    expect(sdk.tables.User.find(u => u.id === "pat")).not.toHaveProperty("pickup_lat");
    expect(sdk.tables.Contact.find(c => c.id === "foreign")).not.toHaveProperty("pickup_lat");
  });
  it.each([null, "staff", "passenger", "driver", "mechanic"])("rejects role %s without writes", async role => {
    const sdk = mock(role);
    expect((await save(sdk, "contact:rider")).status).toBe(403);
    expect(sdk.writes).toEqual([]);
  });
  it("rejects stale administrator identity", async () => {
    const sdk = setup(); sdk.auth.me = async () => ({ id: "caller", role: "admin" }); sdk.tables.User[0].role = "passenger";
    expect((await save(sdk, "contact:pat-card")).status).toBe(403); expect(sdk.writes).toEqual([]);
  });
  it.each([{pickup_lat:null},{pickup_lat:91},{pickup_lng:181},{pickup_lat:"12"},{pickup_name:""}])("rejects invalid pickup %j", async extra => {
    const sdk = setup(); expect((await save(sdk, "contact:pat-card", extra)).status).toBe(400); expect(sdk.writes).toEqual([]);
  });
  it("new pickup is used by Plan pickups", async () => {
    const sdk = setup();
    sdk.tables.Route = [{ id: "r1", company_id: "a", name: "Belmont", path: [{lat:12.04,lng:-61.748},{lat:12.06,lng:-61.748}] }];
    sdk.tables.Vehicle[0].route_id = "r1";
    await save(sdk, "contact:pat-card");
    const res = await load("routeStops", sdk).default(request({ action: "plan" }));
    const pat = (await res.json()).people.find(p => p.key === "contact:pat-card");
    expect(pat).toMatchObject({ pickup: { name: point.pickup_name, lat: point.pickup_lat, lng: point.pickup_lng }, status: "ok", route_id: "r1" });
  });
});
