import React, { Suspense, lazy, useEffect, useState } from "react";
import { Navigate, Link, useParams, useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { EmbeddedLayout } from "@/components/AppLayout";
import AdminShell from "@/components/admin/AdminShell";
import AdminOverview from "@/components/admin/AdminOverview";
import AssignTripsTab from "@/components/admin/AssignTripsTab";
import LiveFleetTab from "@/components/admin/LiveFleetTab";
import CompletedTripsTab from "@/components/admin/CompletedTripsTab";
import ProfileInfo from "@/components/ProfileInfo";
import DriversTab from "@/components/admin/DriversTab";
import CopilotTab from "@/components/admin/CopilotTab";
import VehiclesTab from "@/components/admin/VehiclesTab";
import KioskTablets from "@/components/admin/KioskTablets";
import CheckInLog from "@/components/admin/CheckInLog";
import MessagingTab from "@/components/admin/MessagingTab";
import AdsTab from "@/components/admin/AdsTab";
import CompaniesTab from "@/components/admin/CompaniesTab";
import UsersTab from "@/components/admin/UsersTab";
import ServiceQueueTab from "@/components/admin/ServiceQueueTab";
import FaultsTab from "@/components/admin/FaultsTab";
import PartsTab from "@/components/admin/PartsTab";
import MaintenanceScheduleTab from "@/components/admin/MaintenanceScheduleTab";
import MaintenanceCalendarTab from "@/components/admin/MaintenanceCalendarTab";
import InspectionTemplatesTab from "@/components/admin/InspectionTemplatesTab";
import InspectionHistoryTab from "@/components/admin/InspectionHistoryTab";
import DataTab from "@/components/admin/DataTab";
import FloatingChatbot from "@/components/admin/FloatingChatbot";
import FloatingMessages from "@/components/admin/FloatingMessages";
import { usePushNotifications } from "@/hooks/usePushNotifications";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  Car,
  ChevronDown,
  DoorOpen,
  ExternalLink,
  FlaskConical,
  Hotel,
  LayoutDashboard,
  MapPin,
  Radar,
  Smartphone,
  Link2,
  Wrench,
  LineChart,
  AlertTriangle,
  BookOpen,
  Route,
  Users,
  FileText,
  History,
  ShieldCheck,
  Bell,
  LifeBuoy,
  Map,
  Gauge,
  Siren,
} from "lucide-react";
import { loadFailed } from "@/lib/loadFailed";
import BusLoader from "@/components/BusLoader";
import ShiftsTab from "@/components/admin/ShiftsTab";
import AuditLogTab from "@/components/admin/AuditLogTab";
import CardIssuingTab from "@/components/admin/CardIssuingTab";
import FleetHealthTab from "@/components/admin/FleetHealthTab";
import LostItemsTab from "@/components/admin/LostItemsTab";
import TravelTimesTab from "@/components/admin/TravelTimesTab";

const ROLE_LINKS = [
  { to: "/passenger", label: "Passenger view", icon: MapPin },
  { to: "/driver", label: "Driver app", icon: Car },
  { to: "/company", label: "Company dashboard", icon: LayoutDashboard },
  { to: "/staff", label: "Passenger app", icon: Hotel },
  { to: "/manager", label: "Fleet manager", icon: Radar },
];

const PORTAL_LINKS = [
  { to: "/admin/kiosks", label: "Bus Entry Kiosk", icon: Smartphone },
  { to: "/admin/kiosks", label: "Front Desk Kiosk", icon: DoorOpen },
  { to: "/reviewer-sandbox", label: "Reviewer Sandbox", icon: FlaskConical },
];

// Full pages that also open inside the admin area, under the sidebar, so the
// management tools are one click away instead of behind the Overview.
const ADMIN_PAGES = {
  "vehicle-logs": lazy(() => import("@/pages/VehicleLogs")),
  "driving-reports": lazy(() => import("@/pages/DrivingReports")),
  "location-timeline": lazy(() => import("@/pages/LocationTimeline")),
  "route-analytics": lazy(() => import("@/pages/RouteAnalytics")),
  "fleet-analytics": lazy(() => import("@/pages/FleetAnalytics")),
  "route-planner": lazy(() => import("@/pages/RoutePlanner")),
  "route-explorer": lazy(() => import("@/pages/RouteExplorer")),
  "service-history": lazy(() => import("@/pages/ServiceHistory")),
  "incident-reports": lazy(() => import("@/pages/IncidentReports")),
  "safety-standards": lazy(() => import("@/pages/SafetyStandards")),
  directory: lazy(() => import("@/pages/StaffDirectory")),
  "ride-history": lazy(() => import("@/pages/RideHistory")),
  "passenger-bookings": lazy(() => import("@/pages/PassengerBookings")),
  support: lazy(() => import("@/pages/PassengerSupport")),
};

const MGMT_LINKS = [
  { to: "/vehicle-registry", label: "Vehicles & Drivers", icon: Car },
  { to: "/admin/service-history", label: "Service History", icon: History },
  { to: "/admin/vehicle-logs", label: "Vehicle Logs", icon: FileText },
  { to: "/admin/safety-standards", label: "Safety Standards", icon: ShieldCheck },
  { to: "/admin/incident-reports", label: "Incident Reports", icon: AlertTriangle },
  { to: "/incident-report", label: "Report Incident", icon: LifeBuoy },
  { to: "/admin/driving-reports", label: "Driving Reports", icon: Gauge },
  { to: "/admin/location-timeline", label: "Location Timeline", icon: History },
  { to: "/admin/route-planner", label: "Route Planner", icon: Map },
  { to: "/admin/route-explorer", label: "Route Explorer", icon: Route },
  { to: "/admin/route-analytics", label: "Route Analytics", icon: LineChart },
  { to: "/admin/fleet-analytics", label: "Fleet Analytics", icon: LineChart },
  { to: "/admin/ride-history", label: "Ride History", icon: History },
  { to: "/admin/passenger-bookings", label: "Passenger Bookings", icon: BookOpen },
  { to: "/admin/directory", label: "Passenger directory", icon: Users },
  { to: "/notifications", label: "Notifications", icon: Bell },
  { to: "/admin/support", label: "Passenger Support", icon: LifeBuoy },
];

export default function Admin() {
  const { user, logout } = useAuth();
  const { permission: pushPermission, enableNotifications } = usePushNotifications({ email: user?.email, role: "admin" });
  const navigate = useNavigate();
  const { section: urlSection } = useParams();
  const section = urlSection || "overview";
  const [users, setUsers] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [routes, setRoutes] = useState([]);
  const [trips, setTrips] = useState([]);
  const [inspections, setInspections] = useState([]);
  const [drivers, setDrivers] = useState([]);
  const [faults, setFaults] = useState([]);
  const [parts, setParts] = useState([]);
  const [schedules, setSchedules] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [inspectionResults, setInspectionResults] = useState([]);
  const [loading, setLoading] = useState(true);
  const [moreOpen, setMoreOpen] = useState(false);
  const [acknowledged, setAcknowledged] = useState(() => new Set());

  const go = (s) => navigate("/admin/" + s);

  const load = async () => {
    try {
      const [u, c, v, r, t, insp, dr, fl, pt, sch, tmpl, ir] = await Promise.all([
        base44.entities.User.list(),
        base44.entities.Company.list(),
        base44.entities.Vehicle.list(),
        base44.entities.Route.list(),
        base44.entities.Trip.list("-created_date", 1000),
        base44.entities.Inspection.list("-created_date", 1000),
        base44.entities.Driver.list(),
        base44.entities.Fault.list("-created_date", 1000),
        base44.entities.Part.list(),
        base44.entities.MaintenanceSchedule.list(),
        base44.entities.InspectionTemplate.list(),
        base44.entities.InspectionResult.list("-inspection_date", 500),
      ]);
      setFaults(fl);
      setParts(pt);
      setSchedules(sch);
      setTemplates(tmpl);
      setInspectionResults(ir);
      setUsers(u);
      setCompanies(c);
      setVehicles(v);
      setRoutes(r);
      setTrips(t);
      setInspections(insp);
      setDrivers(dr);
    } catch {
      loadFailed(load);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    load();
  }, []);

  // Keep vehicle statuses live so an SOS triggered by a driver lights up the
  // admin screen immediately, without waiting for a manual refresh.
  useEffect(() => {
    const unsub = base44.entities.Vehicle.subscribe((event) => {
      setVehicles((prev) => {
        if (event.type === "delete") return prev.filter((v) => v.id !== event.id);
        const rec = event.data;
        if (!rec) return prev;
        const idx = prev.findIndex((v) => v.id === event.id);
        return idx === -1 ? [...prev, rec] : prev.map((v) => (v.id === event.id ? rec : v));
      });
    });
    return unsub;
  }, []);

  // An acknowledgment only clears a vehicle's CURRENT emergency — if it drops
  // out of emergency status and later fires SOS again, it must take over the
  // screen again rather than staying silently acknowledged forever.
  useEffect(() => {
    setAcknowledged((prev) => {
      if (prev.size === 0) return prev;
      const stillEmergency = new Set(vehicles.filter((v) => v.status === "emergency").map((v) => v.id));
      let changed = false;
      const next = new Set();
      prev.forEach((id) => {
        if (stillEmergency.has(id)) next.add(id);
        else changed = true;
      });
      return changed ? next : prev;
    });
  }, [vehicles]);

  if (user && user.role !== "admin") return <Navigate to="/" replace />;

  const emergencyVehicles = vehicles.filter((v) => v.status === "emergency");
  const unacknowledged = emergencyVehicles.filter((v) => !acknowledged.has(v.id));
  const acknowledgeAll = () => {
    setAcknowledged((prev) => {
      const next = new Set(prev);
      unacknowledged.forEach((v) => next.add(v.id));
      return next;
    });
  };

  // Actually clears the emergency (the driver's own GPS heartbeat no longer
  // will — it now preserves 'emergency' status until this happens). Separate
  // from Acknowledge, which only dismisses the takeover without resolving it.
  const resolveAll = async () => {
    await Promise.all(unacknowledged.map((v) => base44.entities.Vehicle.update(v.id, { status: "on_trip" })));
    setVehicles((prev) => prev.map((v) => (unacknowledged.some((u) => u.id === v.id) ? { ...v, status: "on_trip" } : v)));
    acknowledgeAll();
  };

  const emergencyOverlay = unacknowledged.length > 0 && (
    <div className="fixed inset-0 z-[999] bg-danger text-danger-foreground flex flex-col items-center justify-center p-6 text-center">
      <Siren className="w-20 h-20 mb-4 animate-pulse" />
      <h1 className="text-3xl sm:text-4xl font-heading font-bold mb-3">EMERGENCY SOS</h1>
      <div className="space-y-1 mb-8 max-w-md">
        {unacknowledged.map((v) => (
          <div key={v.id} className="text-lg font-medium">
            {v.name} — {v.company_name || "Unknown company"}
          </div>
        ))}
      </div>
      <div className="flex flex-wrap items-center justify-center gap-3">
        <Button
          size="lg"
          variant="secondary"
          className="h-14 px-10 text-lg font-semibold"
          onClick={acknowledgeAll}
        >
          Acknowledge
        </Button>
        <Button
          size="lg"
          variant="outline"
          className="h-14 px-10 text-lg font-semibold bg-transparent border-destructive-foreground/40 text-destructive-foreground hover:bg-destructive-foreground/10"
          onClick={resolveAll}
        >
          Mark resolved
        </Button>
      </div>
      <p className="text-sm text-destructive-foreground/80 mt-4 max-w-sm">
        Acknowledge just clears this screen — the alert can return. Mark resolved once the situation is actually handled.
      </p>
    </div>
  );

  if (loading)
    return (
      <>
        {emergencyOverlay}
        <AdminShell active={section} onNavigate={go} alertVehicles={emergencyVehicles} user={user} onSignOut={() => logout()}>
          <BusLoader className="py-8" />
        </AdminShell>
      </>
    );

  const linkGroup = (title, Icon, links, note) => (
    <div>
      <h3 className="flex items-center gap-2 text-body-sm font-bold uppercase tracking-wide text-muted-foreground">
        <Icon className="h-4 w-4" aria-hidden="true" /> {title}
      </h3>
      {note && <p className="mt-1 text-body-sm text-muted-foreground">{note}</p>}
      <div className="mt-2 flex flex-wrap gap-2">
        {links.map((r) => {
          const LinkIcon = r.icon;
          return (
            <Link key={r.label} to={r.to} className="inline-flex min-h-[40px] items-center gap-2 rounded-lg border border-border bg-background px-3 text-body-sm font-semibold hover:bg-accent">
              <LinkIcon className="h-4 w-4 text-muted-foreground" aria-hidden="true" /> {r.label}
            </Link>
          );
        })}
      </div>
    </div>
  );

  const toolsPanel = (
    <Collapsible open={moreOpen} onOpenChange={setMoreOpen} className="rounded-2xl border border-border bg-card">
      <CollapsibleTrigger asChild>
        <button type="button" className="flex min-h-[56px] w-full items-center justify-between gap-3 rounded-2xl px-5 text-left font-semibold hover:bg-accent/60">
          <span className="flex items-center gap-2"><Wrench className="h-5 w-5 text-muted-foreground" aria-hidden="true" /> More tools and shortcuts</span>
          <ChevronDown className={`h-5 w-5 text-muted-foreground transition-transform ${moreOpen ? "rotate-180" : ""}`} aria-hidden="true" />
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent className="space-y-5 border-t border-border px-5 py-4">
        {linkGroup("Test as another role", ExternalLink, ROLE_LINKS, "Open any role's view to test the experience end to end.")}
        {linkGroup("Portals and kiosks", Link2, PORTAL_LINKS)}
        {linkGroup("Management tools", Wrench, MGMT_LINKS)}
      </CollapsibleContent>
    </Collapsible>
  );

  return (
    <>
      {emergencyOverlay}
      <AdminShell
        active={section}
        onNavigate={go}
        alertVehicles={emergencyVehicles}
        user={user}
        onSignOut={() => logout()}
        pushPermission={pushPermission}
        onEnableNotifications={enableNotifications}
      >
        {section === "overview" && (
          <AdminOverview
            vehicles={vehicles}
            routes={routes}
            trips={trips}
            faults={faults}
            schedules={schedules}
            companies={companies}
            parts={parts}
            onNavigate={go}
            tools={toolsPanel}
          />
        )}

        {section === "trips" && (
          <AssignTripsTab vehicles={vehicles} routes={routes} trips={trips} onChange={load} />
        )}
        {section === "fleet" && (
          <LiveFleetTab
            vehicles={vehicles}
            routes={routes}
            onVehicleUpdate={(updated) =>
              setVehicles((prev) => prev.map((v) => (v.id === updated.id ? updated : v)))
            }
          />
        )}
        {section === "vehicles" && (
          <VehiclesTab
            vehicles={vehicles}
            companies={companies}
            routes={routes}
            onChange={load}
            faults={faults}
            schedules={schedules}
            inspectionResults={inspectionResults}
          />
        )}
        {section === "health" && <FleetHealthTab vehicles={vehicles} />}
        {section === "kiosks" && <KioskTablets vehicles={vehicles} companies={companies} onChange={load} />}
        {section === "checkins" && <CheckInLog vehicles={vehicles} onChange={load} />}
        {section === "billing" && <CompletedTripsTab trips={trips} />}
        {section === "users" && (
          <UsersTab users={users} companies={companies} currentUser={user} onChange={load} />
        )}
        {section === "service" && (
          <ServiceQueueTab inspections={inspections} onChange={load} />
        )}
        {section === "faults" && <FaultsTab faults={faults} onChange={load} />}
        {section === "parts" && <PartsTab parts={parts} companies={companies} onChange={load} />}
        {section === "schedule" && <MaintenanceScheduleTab schedules={schedules} vehicles={vehicles} onChange={load} />}
        {section === "calendar" && <MaintenanceCalendarTab schedules={schedules} vehicles={vehicles} />}
        {section === "templates" && <InspectionTemplatesTab templates={templates} companies={companies} vehicles={vehicles} onChange={load} />}
        {section === "inspection-history" && <InspectionHistoryTab results={inspectionResults} vehicles={vehicles} />}
        {section === "drivers" && (
          <DriversTab drivers={drivers} vehicles={vehicles} companies={companies} routes={routes} onChange={load} />
        )}
        {section === "shifts" && <ShiftsTab />}
        {section === "cards" && <CardIssuingTab companies={companies} />}
        {section === "audit" && <AuditLogTab />}
        {section === "lost-items" && <LostItemsTab />}
        {section === "companies" && <CompaniesTab companies={companies} onChange={load} />}
        {section === "messaging" && <MessagingTab vehicles={vehicles} />}
        {section === "ads" && <AdsTab />}
        {section === "copilot" && <CopilotTab />}
        {section === "data" && <DataTab />}
        {section === "travel-times" && <TravelTimesTab />}
        {ADMIN_PAGES[section] && (
          <EmbeddedLayout.Provider value={true}>
            <Suspense fallback={<BusLoader className="py-12" />}>
              {React.createElement(ADMIN_PAGES[section])}
            </Suspense>
          </EmbeddedLayout.Provider>
        )}
        {section === "profile" && (
          <div className="max-w-xl">
            <ProfileInfo />
          </div>
        )}
      </AdminShell>
      <FloatingMessages vehicles={vehicles} />
      <FloatingChatbot />
    </>
  );
}