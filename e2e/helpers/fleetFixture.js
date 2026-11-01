import { withAdminBatch } from "./adminBatchMock.js";

// One small, realistic fleet for browser tests: a company with two buses on
// a coastal route, passengers, drivers, tablets, jobs, faults and messages.
// Everything is answered in the browser; nothing reaches a real backend.

const now = Date.now();
const iso = (ms) => new Date(ms).toISOString();
const stops = [
  { name: "St. George's", lat: 12.05, lng: -61.75, order: 0 },
  { name: "True Blue", lat: 12.02, lng: -61.76, order: 1 },
  { name: "Grand Anse", lat: 12.01, lng: -61.77, order: 2 },
  { name: "Morne Rouge", lat: 12.0, lng: -61.78, order: 3 },
];

export function fleetData() {
  const company = { id: "a", name: "Grenada Transport Co.", access_code: "ABCD2345EFGH", phone: "+1 473 555 0200", service_types: ["staff_bus", "airport"] };
  const routes = [{ id: "route-a", company_id: "a", company_name: company.name, name: "Coastal route", type: "staff", active: true, stops }];
  const vehicles = [
    { id: "bus-a", company_id: "a", company_name: company.name, name: "Bus 1", plate_number: "PA 101", fleet_number: "01", type: "staff_bus", capacity: 25, route_id: "route-a", status: "on_trip", tracking_active: true, in_service: true, current_lat: 12.022, current_lng: -61.758, speed: 25, heading: 180, driver_name: "K. Thomas", driver_email: "driver.kt@login.test", last_location_update: iso(now - 20_000), location_shared: "shift" },
    { id: "bus-b", company_id: "a", company_name: company.name, name: "Bus 2", plate_number: "PA 102", fleet_number: "02", type: "staff_bus", capacity: 25, route_id: "route-a", status: "idle", tracking_active: false, in_service: true, current_lat: null, current_lng: null, driver_name: "", last_location_update: iso(now - 86_400_000), location_shared: "" },
  ];
  const trips = [
    { id: "staff-1", company_id: "a", vehicle_id: "bus-a", vehicle_name: "Bus 1", route_id: "route-a", route_name: "Coastal route", pickup_name: "St. George's", dropoff_name: "Morne Rouge", scheduled_time: iso(now + 3_600_000), status: "scheduled" },
    { id: "job-1", company_id: "a", vehicle_id: "bus-a", vehicle_name: "Bus 1", job_type: "airport_pickup", status: "on_the_way", shared_with_company: true, scheduled_time: iso(now + 1_800_000), pickup_name: "Maurice Bishop International Airport", dropoff_name: "Spice Island Beach Resort", passenger_name: "Mr and Mrs Lee", guests: 2, flight_number: "AA 1234", price: 120, currency: "XCD" },
    { id: "job-2", company_id: "a", vehicle_id: "bus-b", vehicle_name: "Bus 2", job_type: "transfer", status: "completed", scheduled_time: iso(now - 86_400_000), completed_at: iso(now - 80_000_000), pickup_name: "Lobby", dropoff_name: "Town", passenger_name: "Ms Ray", guests: 3 },
  ];
  const drivers = [
    { id: "drv-1", company_id: "a", company_name: company.name, full_name: "Kevin Thomas", username: "kthomas", phone: "+1 473 555 0111", phone_app_access: true },
    { id: "drv-2", company_id: "a", company_name: company.name, full_name: "Ana Joseph", username: "ajoseph", phone: "+1 473 555 0112", phone_app_access: false },
  ];
  const users = [
    { id: "u-admin", email: "admin@test.invalid", full_name: "Admin Person", role: "admin" },
    { id: "u-pass", email: "rider@test.invalid", full_name: "Rita Rider", role: "staff", company_id: "a" },
  ];
  const kiosks = [
    { id: "k-board", company_id: "a", company_name: company.name, vehicle_id: "bus-a", vehicle_name: "Bus 1", kiosk_type: "bus_boarding", label: "Bus 1 boarding", status: "active", paired: true, last_seen: iso(now - 30_000), directory_sent_at: iso(now - 600_000), helper_health: { model: "coolpad K18", reader: "Connected", battery: 88, hotspot: "Unknown", version: "native-0.2", reported_at: iso(now - 30_000) } },
    { id: "k-drive", company_id: "a", company_name: company.name, vehicle_id: "bus-a", vehicle_name: "Bus 1", kiosk_type: "driver", label: "Bus 1 driver", status: "active", paired: true, last_seen: iso(now - 40_000), helper_health: { model: "CRELANDER T30Pro", gps: "Fix (USB background GPS)", hotspot: "On", battery: 74, version: "native-0.2", reported_at: iso(now - 40_000) } },
  ];
  const shifts = [{ id: "sh-1", company_id: "a", vehicle_id: "bus-a", vehicle_name: "Bus 1", driver_name: "Kevin Thomas", started_at: iso(now - 7_200_000) }];
  const faults = [{ id: "f-1", company_id: "a", vehicle_id: "bus-b", vehicle_name: "Bus 2", title: "Left mirror loose", severity: "minor", status: "open", source: "inspection", created_date: iso(now - 3_600_000) }];
  const inspections = [{ id: "ins-1", company_id: "a", vehicle_id: "bus-a", vehicle_name: "Bus 1", driver_name: "Kevin Thomas", date: iso(now - 7_000_000), status: "passed", checklist: [], created_date: iso(now - 7_000_000) }];
  const templates = [{ id: "tpl-1", company_id: "a", name: "Daily walk-around", category: "daily", sections: [{ name: "Outside", items: ["Tyres", "Lights"] }] }];
  const messages = [{ id: "m-1", company_id: "a", vehicle_id: "bus-a", vehicle_name: "Bus 1", channel: "staff", sender_role: "driver", sender_name: "Kevin", text: "Running 5 minutes late", message_type: "text", created_date: iso(now - 900_000) }];
  const broadcasts = [{ id: "b-1", company_id: "a", type: "announcement", title: "Road works", message: "Expect delays on the Carenage.", created_date: iso(now - 3_600_000) }];
  const checkins = [{ id: "c-1", company_id: "a", vehicle_id: "bus-a", vehicle_name: "Bus 1", staff_name: "Rita Rider", status: "boarded", boarded_at: iso(now - 1_800_000), check_in_method: "nfc" }];
  const contacts = [{ id: "ct-1", company_id: "a", name: "Rita Rider", type: "staff", vehicle_id: "bus-a", vehicle_name: "Bus 1", pickup_name: "Grand Anse" }];
  const workplaces = [{ id: "w-1", company_id: "a", company_name: company.name, name: "Main office", lat: 12.0, lng: -61.79 }];
  const tables = {
    Company: [company], Route: routes, Vehicle: vehicles, Trip: trips, Driver: drivers, User: users, KioskDevice: kiosks,
    DriverShift: shifts, Fault: faults, Inspection: inspections, InspectionTemplate: templates, GroupMessage: messages,
    Broadcast: broadcasts, StaffCheckIn: checkins, Contact: contacts, Workplace: workplaces,
    Advertisement: [], AuditLog: [], ClientError: [], LostItemReport: [], Incident: [], DrivingEvent: [], LocationPing: [],
    RouteTravelTimes: [], Place: [], Client: [], Invoice: [], BookingRequest: [], DriverDocument: [], Part: [],
    MaintenanceSchedule: [], MaintenanceSettings: [], NfcCard: [], CardHolder: [], InspectionResult: [], PushToken: [],
  };
  return { company, routes, vehicles, trips, drivers, users, kiosks, tables, stops };
}

const ME = {
  admin: { id: "u-admin", email: "admin@test.invalid", full_name: "Admin Person", role: "admin" },
  company: { id: "u-co", email: "desk@hotel.invalid", full_name: "Front Desk", role: "company", company_id: "a" },
  mechanic: { id: "u-mech", email: "mech@test.invalid", full_name: "Mo Mechanic", role: "mechanic" },
  staff: { id: "u-pass", email: "rider@test.invalid", full_name: "Rita Rider", role: "staff", company_id: "a", favorite_stop: "Grand Anse" },
  driver: { id: "u-drv", email: "driver.kt@login.test", full_name: "Kevin Thomas", role: "driver", company_id: "a" },
};

// Requests and support cases, kept in `data.passengerCases` for the test.
function passengerCases(body, data) {
  const list = (data.passengerCases ||= []);
  const find = () => list.find((c) => c.id === body?.id);
  switch (body?.action) {
    case "mine": case "list": return { cases: body.action === "list" && body.show !== "all" ? list.filter((c) => ["requested", "pending"].includes(c.status)) : list };
    case "create": {
      const row = { id: "case-" + (list.length + 1), reference: "TT-TEST" + (list.length + 1), status: "requested", replies: [], unread: false, source: "case", vehicle_name: "Bus 1", user_name: "Rita Rider", created_date: new Date().toISOString(), ...body };
      delete row.action; list.unshift(row); return { ok: true, case: row };
    }
    case "reply": { const c = find(); c.replies = [...(c.replies || []), { from: "office", name: "Office", text: body.text, at: new Date().toISOString() }]; if (c.status === "requested") c.status = "pending"; return { ok: true, case: c }; }
    case "set_status": { const c = find(); c.status = body.status; return { ok: true, case: c }; }
    case "withdraw": { const c = find(); c.status = "closed"; return { ok: true, case: c }; }
    default: return { ok: true };
  }
}

// Shapes the app's own server functions return, for the screens that open
// with one. Anything not listed answers { ok: true }.
function functionReply(name, body, data, role) {
  switch (name) {
    case "companyAccess": return { company: { id: "a", name: data.company.name }, my_bus: { id: "bus-a", name: "Bus 1" } };
    case "appSupport": return { whatsapp_number: "14735550100" };
    case "routeStops": return { stop: null, stops: [] };
    case "myNotifications": return { items: [], notifications: [] };
    case "notificationSettings": return { types: [], settings: [], people: [] };
    case "nfcCards": if (body?.action === "signup_state") return { company: { id: "a", name: data.company.name, join_code: data.company.access_code }, me: "Admin", people: [
      { key: "user:u-pass", ref: "email:rita@test.local", name: "Rita Rider", email: "rita@test.local", registered: true, app: "alerts", pickup: true, pickup_name: "True Blue", card: "", helper: null },
    ] };
    return { people: [{ key: "user:u-pass", source: "user", id: "u-pass", name: "Rita Rider", company_id: "a", company_name: data.company.name, vehicle_id: "bus-a", assigned_vehicle: "Bus 1", registered: true, status: "Active" }], cards: data.cards || [], vehicles: data.vehicles.map((v) => ({ id: v.id, name: v.name, company_id: "a" })), tablets: data.kiosks.map((k) => ({ id: k.id, label: k.label, vehicle_id: k.vehicle_id, paired: true, active: true, last_seen: k.last_seen, directory_sent_at: k.directory_sent_at || null })) };
    case "accessRoles": return { roles: [], assignments: [] };
    case "companyWorkspace": return { vehicles: [], routes: [], drivers: [], workplaces: [], contacts: [], devices: [], people: [] };
    case "bookingRequest": return body?.action === "company_requests" ? { requests: [] } : { ok: true };
    case "driverAccounts": return body?.action === "status" ? { is_driver: role === "driver", must_change_password: false } : { drivers: data.drivers, ok: true };
    case "passengerAccount": return body?.action === "rides" ? { events: [] } : body?.action === "today" ? { events: data.today || [] } : { card: { issued: false, active: false, status: "Not issued" }, history: [] };
    case "passengerCases": return passengerCases(body, data);
    case "jobBilling": return { invoices: [], groups: [], ok: true };
    case "driverRequests": return { requests: [] };
    case "helperRelease": return { version: "1.0", url: "" };
    case "driverSession": return { error: "Pair this device first" };
    default: return { ok: true };
  }
}

// Answers every backend call the app makes, as `role`. Returns what was
// asked for and anything that reached an address not answered here.
export async function mockFleet(page, { role = "admin", data = fleetData(), signedIn = true } = {}) {
  const calls = [];
  // A copy, so a profile change saved in one test never reaches another.
  const me = ME[role] ? structuredClone(ME[role]) : ME[role];
  await page.addInitScript(({ signedIn, role }) => {
    if (signedIn) localStorage.setItem("base44_access_token", "mock-authenticated-session");
    localStorage.setItem("tt-map-engine", "basic");
    if (role === "staff") localStorage.setItem("tt_company_access_grant", "a".repeat(64));
  }, { signedIn, role });
  await page.route("https://api.mapbox.com/**", (r) => r.fulfill({ status: 404, body: "" }));
  await page.route(/tile\.openstreetmap|basemaps\.cartocdn|arcgisonline|tiles\./, (r) => r.fulfill({ status: 204, body: "" }));
  await page.route("**/api.open-meteo.com/**", (r) => r.fulfill({ json: { current: { temperature_2m: 28, weather_code: 0 } } }));
  await page.route("**/api/**", withAdminBatch(async (route) => {
    const request = route.request(), url = request.url();
    if (url.includes("/entities/")) return route.fulfill({ status: 403, json: { error: "Direct entity access blocked" } });
    const fn = url.match(/\/functions\/([A-Za-z]+)/)?.[1];
    let body = null;
    try { body = request.postDataJSON(); } catch { body = null; }
    if (fn) calls.push({ fn, body });
    if (fn === "entityAccess") {
      if (!signedIn && body?.entity !== "Advertisement") return route.fulfill({ status: 401, json: { error: "Sign in required" } });
      const rows = data.tables[body?.entity] || [];
      let result = rows;
      if (body?.entity === "User" && body.operation === "get") result = me;
      // Saving your own profile (Skip today, Running late) is kept, as on the
      // real server, so the next profile read returns it.
      else if (body?.entity === "User" && body.operation === "update" && me && body.id === me.id) result = Object.assign(me, body.data || {});
      else if (body?.entity === "User") result = role === "admin" ? data.tables.User : [me];
      else if (body?.entity === "Bootstrap") result = { workplace: data.tables.Workplace[0], vehicles: data.vehicles, routes: data.routes, trips: data.trips.filter((t) => !t.job_type) };
      else if (body?.entity === "LiveLists") result = { lists: Object.fromEntries((body.entities || []).map((e) => [e, data.tables[e] || []])), errors: {} };
      else if (body?.operation === "get") result = rows.find((r) => r.id === body.id) || null;
      else if (["create", "update"].includes(body?.operation)) result = { id: body.id || "new-1", ...(rows.find((r) => r.id === body.id) || {}), ...(body.data || {}) };
      else if (body?.operation === "delete") result = { ok: true };
      if (result === null) return route.fulfill({ status: 404, json: { error: "Record not found" } });
      return route.fulfill({ json: { result } });
    }
    if (fn) return route.fulfill({ json: functionReply(fn, body, data, role) });
    if (url.includes("/public-settings/") || url.includes("/apps/")) return route.fulfill({ json: { id: "test-app", public_settings: { authentication_required: false } } });
    return route.fulfill({ json: {} });
  }));
  return { calls, me, data };
}
