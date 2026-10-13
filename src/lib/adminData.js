// What each Admin section actually shows, and how much of it to ask for.
//
// Initial lists are combined through AdminBootstrap using fixed server queries.
// The individual loaders remain for paginated reads and existing tools. A
// section loads only its own lists and keeps them. The long histories —
// completed trips, the service queue — load a page at a time and can be
// extended with "Show more" instead of pulling a thousand rows at once.
import { base44 } from "@/api/base44Client";

export const PAGE = 200;

const ACTIVE_TRIP_STATUSES = ["scheduled", "on_the_way", "arrived"];

// Datasets with a `page(skip)` can be extended; `load()` is the first page.
const completedTrips = (skip) =>
  base44.entities.Trip.filter({ status: "completed" }, "-completed_at", PAGE, skip);
const serviceQueue = (skip) =>
  base44.entities.Inspection.filter({ needs_service: true }, "-created_date", PAGE, skip);

export const DATASETS = {
  checkIns: {load:()=>base44.entities.StaffCheckIn.list("-created_date",500)},
  kiosks: { load: () => base44.entities.KioskDevice.list() },
  vehicles: { load: () => base44.entities.Vehicle.list() },
  companies: { load: () => base44.entities.Company.list() },
  routes: { load: () => base44.entities.Route.list() },
  users: { load: () => base44.entities.User.list() },
  drivers: { load: () => base44.entities.Driver.list() },
  parts: { load: () => base44.entities.Part.list() },
  templates: { load: () => base44.entities.InspectionTemplate.list() },
  schedules: { load: () => base44.entities.MaintenanceSchedule.list() },
  // Only what needs attention: the overview and the vehicle list never show
  // the completed services.
  schedulesDue: {
    load: () => base44.entities.MaintenanceSchedule.filter({ status: { $in: ["due", "overdue"] } }, "-created_date", 500),
  },
  faults: { load: () => base44.entities.Fault.list("-created_date", 500) },
  faultsOpen: {
    load: () => base44.entities.Fault.filter({ status: { $ne: "resolved" } }, "-created_date", 500),
  },
  trips: {
    load: () => base44.entities.Trip.filter({ status: { $in: ACTIVE_TRIP_STATUSES } }, "-created_date", 500),
  },
  completedTrips: { load: () => completedTrips(0), page: completedTrips },
  serviceQueue: { load: () => serviceQueue(0), page: serviceQueue },
  inspectionResults: { load: () => base44.entities.InspectionResult.list("-inspection_date", 500) },
  // Jobs: saved places, clients and invoices (administrators only).
  places: { load: () => base44.entities.Place.list("name", 1000) },
  clients: { load: () => base44.entities.Client.list("name", 1000) },
  invoices: { load: () => base44.entities.Invoice.list("-issued_at", 500) },
};

// "vehicles" is added to every section by the console itself (the SOS banner
// and the shell watch the fleet from any screen).
export const SECTION_DATA = {
  overview: ["routes", "companies", "parts", "faultsOpen", "schedulesDue", "trips", "kiosks", "checkIns"],
  trips: ["routes", "trips", "completedTrips", "places", "clients"],
  fleet: ["routes"],
  vehicles: ["companies", "routes", "faultsOpen", "schedulesDue", "inspectionResults"],
  health: [],
  kiosks: ["companies"],
  checkins: [],
  billing: ["completedTrips", "clients", "invoices", "companies"],
  users: ["users", "companies"],
  service: ["serviceQueue"],
  faults: ["faults"],
  parts: ["parts", "companies"],
  schedule: ["schedules"],
  calendar: ["schedules"],
  templates: ["templates", "companies"],
  "inspection-history": ["inspectionResults"],
  drivers: ["drivers", "companies", "routes"],
  companies: ["companies"],
  messaging: [],
};