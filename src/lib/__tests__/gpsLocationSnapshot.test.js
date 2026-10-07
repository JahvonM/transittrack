import { it, expect } from "vitest";
import fs from "node:fs";
import { load, mock, request } from "../../../security-tests/helpers.js";

// Replays a fixed set of GPS updates through the bus tablet's live position
// update and checks every record it creates or changes against the recording
// taken before that code moved to shared/vehicleLocation.ts. A difference
// means tablet GPS behaviour changed: stop alerts, driving events, history.
it("tablet GPS updates behave exactly as recorded", async () => {
  const realNow = Date.now;
  const base = Date.parse("2026-10-07T10:00:00Z");
  const sdk = mock(null);
  sdk.tables.KioskDevice[0].kiosk_type = "driver";
  Object.assign(sdk.tables.Vehicle[0], { route_id: "route-a", driver_name: "Dana", driver_email: "d@test.invalid", type: "staff_bus" });
  sdk.tables.Route = [{ id: "route-a", company_id: "a", name: "Coastal", stops: [
    { name: "Town", lat: 12.05, lng: -61.75, order: 0 }, { name: "True Blue", lat: 12.02, lng: -61.76, order: 1 }, { name: "Grand Anse", lat: 12.0, lng: -61.78, order: 2 } ] }];
  sdk.tables.MaintenanceSettings = [];
  const api = load("driverSession", sdk, ["issueGrant"]);
  Date.now = () => base - 3600e3;
  const grant = await api.issueGrant(sdk, sdk.tables.KioskDevice[0], "driver", "bus-a", 48 * 3600e3);
  const steps = [
    { t: 0, lat: 12.05, lng: -61.75, speed: 0 },          // at Town
    { t: 8, lat: 12.045, lng: -61.752, speed: 12 },       // leaving Town
    { t: 16, lat: 12.04, lng: -61.754, speed: 25, trail: [{ lat: 12.05, lng: -61.75, t: "2026-10-07T10:00:00Z" }, { lat: 1, lng: 999, t: "x" }] },
    { t: 24, lat: 12.035, lng: -61.755, speed: 4 },       // hard brake
    { t: 32, lat: 12.03, lng: -61.757, speed: 25 },       // rapid accel
    { t: 40, lat: 12.025, lng: -61.758, speed: 1.2 },     // possible crash (>=40 km/h to <=5)
    { t: 48, lat: 12.0201, lng: -61.7601, speed: 0, status: "idle" }, // arrive True Blue
    { t: 47, lat: 12.0, lng: -61.0, speed: 0 },           // stale sample
    { t: 120, lat: 12.01, lng: -61.77, speed: 30, log_speeding: true },
    { t: 130, lat: 91, lng: 0 },                           // invalid
    { t: 140, lat: 12.0, lng: -61.78, speed: 101 },        // invalid speed
    { t: 150, lat: 12.0, lng: -61.78, speed: 0, status: "flying" }, // invalid status
    { t: 160, lat: 12.0, lng: -61.78, speed: 0, emergency: true },  // vehicle in SOS
    { t: 400, lat: 12.0005, lng: -61.7801, speed: 0 },
  ];
  const out = [];
  for (const s of steps) {
    Date.now = () => base + s.t * 1000 + 500;
    if (s.emergency) sdk.tables.Vehicle[0].status = "emergency";
    const { t, emergency, ...rest } = s;
    const res = await api.default(request({ action: "update_location", device_id: "tablet", driver_grant: grant, recorded_at: new Date(base + t * 1000).toISOString(), ...rest }));
    out.push({ status: res.status, body: await res.json() });
  }
  Date.now = realNow;
  const strip = (rows) => (rows || []).map(({ id, created_date, ...r }) => r);
  const snap = { responses: out, vehicle: sdk.tables.Vehicle[0], broadcasts: strip(sdk.tables.Broadcast), pings: strip(sdk.tables.LocationPing),
    incidents: strip(sdk.tables.Incident), events: strip(sdk.tables.DrivingEvent), writes: sdk.writes.filter((w) => w.name !== "VerificationGrant" && w.name !== "VerificationAttempt") };
  if (process.env.SNAP_OUT) fs.writeFileSync(process.env.SNAP_OUT, JSON.stringify(snap, null, 1));
  const recorded = JSON.parse(fs.readFileSync(new URL("./fixtures/gpsLocationSnapshot.json", import.meta.url), "utf8"));
  expect(JSON.parse(JSON.stringify(snap))).toEqual(recorded);
});
