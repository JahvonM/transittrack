import useFutureAppearance from "@/hooks/useFutureAppearance";
import React, { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from "react";
import SupportNumberSetting from "@/components/admin/SupportNumberSetting";
import { Navigate, Link, useParams, useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { EmbeddedLayout } from "@/components/AppLayout";
import PullToRefresh from "@/components/PullToRefresh";
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
  Palette,
  Building2,
  ListChecks,
  ScrollText,
  Database,
  ChevronRight,
} from "lucide-react";
import { loadFailed } from "@/lib/loadFailed";
import { DATASETS, PAGE, SECTION_DATA } from "@/lib/adminData";
import BusLoader from "@/components/BusLoader";
import ShiftsTab from "@/components/admin/ShiftsTab";
import AuditLogTab from "@/components/admin/AuditLogTab";
import CardIssuingTab from "@/components/admin/CardIssuingTab";
import CardDesignerTab from "@/components/admin/CardDesignerTab";
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
  { to: "/admin/kiosks", label: "Kiosk tablets", icon: Smartphone },
  { to: "/reviewer-sandbox", label: "Reviewer Sandbox", icon: FlaskConical },
];

// Full pages that also open inside the admin area, under the sidebar, so the
// management tools are one click away instead of behind the Overview.
const ADMIN_PAGES = {
  "vehicle-logs": lazy(() => import("@/pages/VehicleLogs")),
  "driving-reports": lazy(() => import("@/pages/DrivingReports")),
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
  useFutureAppearance(user?.role === "admin");
  const { permission: pushPermission, enableNotifications } = usePushNotifications({ email: user?.email, role: "admin" });
  const navigate = useNavigate();
  const { section: urlSection } = useParams();
  const section = urlSection === "location-timeline" ? "fleet" : urlSection || "overview";
  // Each section asks only for the lists it shows (see lib/adminData). Lists
  // are kept once loaded, so coming back to a section is instant, and a change
  // made inside a tab refreshes just that section's lists.
  const [data, setData] = useState({});
  const [settled, setSettled] = useState({});
  const [attempted, setAttempted] = useState({});
  const [more, setMore] = useState({});
  const [moreBusy, setMoreBusy] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [acknowledged, setAcknowledged] = useState(() => new Set());
  const settledRef = useRef({});

  const go = (s) => navigate("/admin/" + s);

  const sectionKeys = useMemo(
    () => ["vehicles", ...(SECTION_DATA[section] || [])].filter((k, i, a) => a.indexOf(k) === i),
    [section]
  );

  const ensure = useCallback(async (keys, force = false) => {
    const need = keys.filter((k) => force || !settledRef.current[k]);
    if (!need.length) return;
    // Each list settles on its own: one failure must not wipe the whole screen,
    // so whatever loaded is shown and the rest keeps what it already had.
    const results = await Promise.allSettled(need.map((k) => DATASETS[k].load()));
    if (results.every((r) => r.status === "rejected")) {
      loadFailed(() => ensure(keys, true));
      return;
    }
    const next = {}, done = {}, marks = {}, pages = {};
    results.forEach((r, i) => {
      const key = need[i];
      marks[key] = true;
      if (r.status !== "fulfilled") return;
      next[key] = r.value;
      done[key] = true;
      if (DATASETS[key].page) pages[key] = r.value.length >= PAGE;
    });
    settledRef.current = { ...settledRef.current, ...done };
    setData((prev) => ({ ...prev, ...next }));
    setSettled((prev) => ({ ...prev, ...done }));
    setAttempted((prev) => ({ ...prev, ...marks }));
    setMore((prev) => ({ ...prev, ...pages }));
  }, []);

  useEffect(() => {
    ensure(sectionKeys);
  }, [sectionKeys, ensure]);

  // A tab that saved something re-reads its own section, not the whole console.
  // Whatever another section had cached may now be out of date, so it re-reads
  // the next time it is opened instead of showing a stale number.
  const refresh = async () => {
    await ensure(sectionKeys, true);
    const keep = new Set(sectionKeys);
    Object.keys(settledRef.current).forEach((k) => { if (!keep.has(k)) delete settledRef.current[k]; });
    setSettled((prev) => Object.fromEntries(Object.entries(prev).filter(([k]) => keep.has(k))));
  };

  const loadMore = async (key) => {
    setMoreBusy(true);
    try {
      const page = await DATASETS[key].page((data[key] || []).length);
      setData((prev) => ({ ...prev, [key]: [...(prev[key] || []), ...page] }));
      setMore((prev) => ({ ...prev, [key]: page.length >= PAGE }));
    } finally {
      setMoreBusy(false);
    }
  };

  const {
    vehicles = [], companies = [], routes = [], users = [], drivers = [], parts = [],
    schedules = [], schedulesDue = [], templates = [], faults = [], faultsOpen = [],
    trips = [], completedTrips = [], serviceQueue = [], inspectionResults = [], kiosks = [],
  } = data;

  // Every list this section shows has been asked for at least once.
  const ready = sectionKeys.every((k) => attempted[k]);

  // Keep vehicle statuses live so an SOS triggered by a driver lights up the
  // admin screen immediately, without waiting for a manual refresh.
  useEffect(() => {
    const unsub = base44.entities.Vehicle.subscribe((event) => {
      setData((prev) => {
        const list = prev.vehicles;
        if (!list) return prev; // the fleet list itself is on its way
        const next =
          event.type === "delete"
            ? list.filter((v) => v.id !== event.id)
            : !event.data
              ? list
              : list.some((v) => v.id === event.id)
                ? list.map((v) => (v.id === event.id ? event.data : v))
                : [...list, event.data];
        return next === list ? prev : { ...prev, vehicles: next };
      });
    });
    return unsub;
  }, []);

  // Tablet reports update the overview while it is open, using the same
  // authorized entity subscription as the fleet rather than polling all lists.
  useEffect(() => {
    if (section !== "overview") return;
    return base44.entities.KioskDevice.subscribe((event) => {
      setData((prev) => {
        const list = prev.kiosks;
        if (!list) return prev;
        const next = event.type === "delete"
          ? list.filter((d) => d.id !== event.id)
          : !event.data ? list
            : list.some((d) => d.id === event.id)
              ? list.map((d) => d.id === event.id ? event.data : d)
              : [...list, event.data];
        return next === list ? prev : { ...prev, kiosks: next };
      });
    });
  }, [section]);

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
    setData((prev) => ({
      ...prev,
      vehicles: (prev.vehicles || []).map((v) => (unacknowledged.some((u) => u.id === v.id) ? { ...v, status: "on_trip" } : v)),
    }));
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

  if (!ready)
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
        <PullToRefresh onRefresh={refresh}>
        {section === "overview" && (
          <AdminOverview
            vehicles={vehicles}
            kiosks={kiosks}
            kiosksReady={!!settled.kiosks}
            routes={routes}
            trips={trips}
            faults={faultsOpen}
            schedules={schedulesDue}
            companies={companies}
            parts={parts}
            onNavigate={go}
            tools={toolsPanel}
          />
        )}

        {section === "trips" && (
          <AssignTripsTab
            vehicles={vehicles}
            routes={routes}
            trips={trips}
            completedTrips={completedTrips}
            onChange={refresh}
          />
        )}
        {section === "fleet" && (
          <LiveFleetTab
            vehicles={vehicles}
            routes={routes}
            initialView={urlSection === "location-timeline" ? "history" : "live"}
            onVehicleUpdate={(updated) =>
              setData((prev) => ({
                ...prev,
                vehicles: (prev.vehicles || []).map((v) => (v.id === updated.id ? updated : v)),
              }))
            }
          />
        )}
        {section === "vehicles" && (
          <VehiclesTab
            vehicles={vehicles}
            companies={companies}
            routes={routes}
            onChange={refresh}
            faults={faultsOpen}
            schedules={schedulesDue}
            inspectionResults={inspectionResults}
          />
        )}
        {section === "health" && <FleetHealthTab vehicles={vehicles} />}
        {section === "kiosks" && <KioskTablets vehicles={vehicles} companies={companies} onChange={refresh} />}
        {section === "checkins" && <CheckInLog vehicles={vehicles} onChange={refresh} />}
        {section === "billing" && (
          <CompletedTripsTab
            trips={completedTrips}
            hasMore={!!more.completedTrips}
            loadingMore={moreBusy}
            onLoadMore={() => loadMore("completedTrips")}
          />
        )}
        {section === "users" && (
          <UsersTab users={users} companies={companies} currentUser={user} onChange={refresh} />
        )}
        {section === "service" && (
          <ServiceQueueTab
            inspections={serviceQueue}
            onChange={refresh}
            hasMore={!!more.serviceQueue}
            loadingMore={moreBusy}
            onLoadMore={() => loadMore("serviceQueue")}
          />
        )}
        {section === "faults" && <FaultsTab faults={faults} onChange={refresh} />}
        {section === "parts" && <PartsTab parts={parts} companies={companies} onChange={refresh} />}
        {section === "schedule" && <MaintenanceScheduleTab schedules={schedules} vehicles={vehicles} onChange={refresh} />}
        {section === "calendar" && <MaintenanceCalendarTab schedules={schedules} vehicles={vehicles} />}
        {section === "templates" && <InspectionTemplatesTab templates={templates} companies={companies} vehicles={vehicles} onChange={refresh} />}
        {section === "inspection-history" && <InspectionHistoryTab results={inspectionResults} vehicles={vehicles} />}
        {section === "drivers" && (
          <DriversTab drivers={drivers} vehicles={vehicles} companies={companies} routes={routes} onChange={refresh} />
        )}
        {section === "shifts" && <ShiftsTab />}
        {section === "cards" && <CardIssuingTab companies={companies} />}
        {section === "card-designs" && <CardDesignerTab />}
        {section === "audit" && <AuditLogTab />}
        {section === "lost-items" && <LostItemsTab />}
        {section === "companies" && <CompaniesTab companies={companies} onChange={refresh} />}
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
          <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
            <div className="space-y-4">
              <ProfileInfo />
              <SupportNumberSetting />
            </div>
            <section className="rounded-2xl border border-border bg-card" aria-label="Settings">
              <h2 className="px-5 pb-2 pt-4 text-title-sm font-bold">Settings</h2>
              <ul className="divide-y divide-border px-2 pb-2">
                {[
                  { to: "/account", icon: Palette, title: "Account and appearance", detail: "Theme, colours, password and sign-in" },
                  { go: "companies", icon: Building2, title: "Companies", detail: "Operators, contact numbers and access codes" },
                  { go: "kiosks", icon: Smartphone, title: "Kiosk tablets", detail: "Pair and update boarding and driver tablets" },
                  { go: "templates", icon: ListChecks, title: "Inspection templates", detail: "Checklists drivers and mechanics complete" },
                  { go: "audit", icon: ScrollText, title: "Change history", detail: "Every create, edit and delete" },
                  { go: "data", icon: Database, title: "Data manager", detail: "Browse and export every collection" },
                ].map((it) => {
                  const Icon = it.icon;
                  const inner = (
                    <>
                      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-secondary" aria-hidden="true"><Icon className="h-5 w-5" /></span>
                      <span className="min-w-0 flex-1">
                        <span className="block font-semibold">{it.title}</span>
                        <span className="block truncate text-body-sm text-muted-foreground">{it.detail}</span>
                      </span>
                      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                    </>
                  );
                  const cls = "flex min-h-[60px] w-full items-center gap-3 rounded-lg px-3 py-2 text-left hover:bg-accent/60";
                  return (
                    <li key={it.title}>
                      {it.to ? <Link to={it.to} className={cls}>{inner}</Link> : <button type="button" onClick={() => go(it.go)} className={cls}>{inner}</button>}
                    </li>
                  );
                })}
                {pushPermission !== "granted" && pushPermission !== "unsupported" && (
                  <li>
                    <button type="button" onClick={enableNotifications} className="flex min-h-[60px] w-full items-center gap-3 rounded-lg px-3 py-2 text-left hover:bg-accent/60">
                      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-warning/14 text-warning" aria-hidden="true"><Bell className="h-5 w-5" /></span>
                      <span className="min-w-0 flex-1">
                        <span className="block font-semibold">Turn on SOS notifications</span>
                        <span className="block truncate text-body-sm text-muted-foreground">Get emergency alerts on this device</span>
                      </span>
                    </button>
                  </li>
                )}
              </ul>
            </section>
          </div>
        )}
        </PullToRefresh>
      </AdminShell>
      <FloatingMessages vehicles={vehicles} />
      <FloatingChatbot />
    </>
  );
}