import { describe, it, expect } from "vitest";
import { load, mock, request } from "../../../security-tests/helpers.js";

// Stop names repeat across routes ("Stop 5" on three of them). The "one stop
// away" alert goes to passengers riding this bus (or with no bus yet), not to
// those waiting at another route's stop with the same name.

const SECRETS = { TT_ATOMIC_STORE_URL: "https://example.supabase.co", TT_ATOMIC_SERVICE_ROLE_KEY: "sb_secret_synthetic-test-key-never-real", FIREBASE_SERVICE_ACCOUNT: "{}" };
const STOPS = [
  { name: "Stop 4", lat: 12.0265, lng: -61.7367, order: 0 },
  { name: "Stop 5", lat: 12.0257, lng: -61.7392, order: 1 },
  { name: "Stop 6", lat: 12.0228, lng: -61.74, order: 2 },
];

async function tablet() {
  const sdk = mock(null);
  sdk.testSecrets = SECRETS;
  sdk.tables.KioskDevice[0].kiosk_type = "driver";
  // At Stop 4, about to leave it.
  Object.assign(sdk.tables.Vehicle[0], { route_id: "route-dy", trip_direction: "to_work", tracking_active: true, near_stop_id: "Stop 4", current_lat: 12.0265, current_lng: -61.7367, last_location_update: new Date(Date.now() - 30_000).toISOString() });
  sdk.tables.Vehicle.push({ id: "bus-other", company_id: "a", name: "Other bus", route_id: "route-other" });
  sdk.tables.Route = [
    { id: "route-dy", company_id: "a", name: "dy", stops: STOPS },
    { id: "route-other", company_id: "a", name: "Bus one", stops: [{ name: "Stop 5", lat: 12.0135, lng: -61.7361, order: 0 }] },
  ];
  const rider = (id, bus, extra = {}) => {
    sdk.tables.User.push({ id, role: "staff", email: id + "@test.invalid", full_name: id, favorite_stop: "Stop 5", stop_alerts: true, ...extra });
    sdk.tables.CompanyMembership.push({ id: "m-" + id, user_id: id, company_id: "a", scope: "passenger", active: true, vehicle_id: bus });
  };
  rider("on-this-bus", "bus-a");
  rider("other-bus", "bus-other");
  rider("no-bus-yet", "");
  rider("alerts-off", "bus-a", { stop_alerts: false });
  // The directory card says this one rides the other bus, whatever the membership says.
  rider("card-other-bus", "bus-a");
  sdk.tables.Contact = [{ id: "card-1", company_id: "a", type: "staff", name: "Card", email: "Card-Other-Bus@test.invalid", vehicle_id: "bus-other" }];
  sdk.tables.PushToken = sdk.tables.User.filter((u) => u.id !== "caller").map((u) => ({ email: u.email, token: "TOKEN-" + u.id }));
  sdk.tables.NotificationLog = [];
  const api = load("driverSession", sdk, ["issueGrant"]);
  const grant = await api.issueGrant(sdk, sdk.tables.KioskDevice[0], "driver", "bus-a", 60000);
  const send = async (body) => {
    const res = await api.default(request({ device_id: "tablet", driver_grant: grant, ...body }));
    return { status: res.status, body: await res.json() };
  };
  const told = () => sdk.tables.NotificationLog.flatMap((row) => row.recipients || []).sort();
  return { sdk, send, told };
}

describe("one stop away, on this bus's route only", () => {
  it("tells this bus's passengers and those with no bus, not another route's", async () => {
    const { sdk, send, told } = await tablet();
    // Pulls away from Stop 4 towards Stop 5.
    const res = await send({ action: "update_location", lat: 12.0262, lng: -61.738, speed: 8, status: "on_trip", recorded_at: new Date().toISOString() });
    expect(res.status).toBe(200);
    expect(sdk.tables.Vehicle[0].near_stop_id).toBe("");
    expect(told()).toEqual(["no-bus-yet@test.invalid", "on-this-bus@test.invalid"]);
  });
});
