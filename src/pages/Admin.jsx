import React, { useEffect, useMemo, useState } from "react";
import { Navigate, Link, useParams, useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import AppLayout from "@/components/AppLayout";
import AdminShell from "@/components/admin/AdminShell";
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
import Sparkline from "@/components/admin/Sparkline";
import RecentActivityFeed from "@/components/admin/RecentActivityFeed";
import FleetSyncTab from "@/components/admin/FleetSyncTab";
import Greeting from "@/components/Greeting";
import MapboxMap from "@/components/MapboxMap";
import DataTab from "@/components/admin/DataTab";
import FloatingChatbot from "@/components/admin/FloatingChatbot";
import FloatingMessages from "@/components/admin/FloatingMessages";
import useUserLocation from "@/hooks/useUserLocation";
import { usePushNotifications } from "@/hooks/usePushNotifications";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
  UserCircle,
  RefreshCw,
  AlertTriangle,
  BookOpen,
  Route,
  Users,
  FileText,
  History,
  ShieldCheck,
  Bell,
  CalendarClock,
  LifeBuoy,
  Map,
  Gauge,
  Siren,
} from "lucide-react";

const ROLE_LINKS = [
  { to: "/passenger", label: "Passenger view", icon: MapPin },
  { to: "/driver", label: "Driver app", icon: Car },
  { to: "/company", label: "Company dashboard", icon: LayoutDashboard },
  { to: "/staff", label: "Staff portal", icon: Hotel },
  { to: "/manager", label: "Fleet manager", icon: Radar },
];

const PORTAL_LINKS = [
  { to: "/admin/kiosks", label: "Bus Entry Kiosk", icon: Smartphone },
  { to: "/admin/kiosks", label: "Front Desk Kiosk", icon: DoorOpen },
  { to: "/reviewer-sandbox", label: "Reviewer Sandbox", icon: FlaskConical },
];

const MGMT_LINKS = [
  { to: "/vehicle-registry", label: "Vehicles & Drivers", icon: Car },
  { to: "/maintenance-queue", label: "Maintenance Queue", icon: Wrench },
  { to: "/service-history", label: "Service History", icon: History },
  { to: "/vehicle-logs", label: "Vehicle Logs", icon: FileText },
  { to: "/safety-standards", label: "Safety Standards", icon: ShieldCheck },
  { to: "/incident-reports", label: "Incident Reports", icon: AlertTriangle },
  { to: "/incident-report", label: "Report Incident", icon: LifeBuoy },
  { to: "/driving-reports", label: "Driving Reports", icon: Gauge },
  { to: "/location-timeline", label: "Location Timeline", icon: History },
  { to: "/route-planner", label: "Route Planner", icon: Map },
  { to: "/route-explorer", label: "Route Explorer", icon: Route },
  { to: "/route-analytics", label: "Route Analytics", icon: LineChart },
  { to: "/fleet-analytics", label: "Fleet Analytics", icon: LineChart },
  { to: "/fleet-sync", label: "Fleet Sync", icon: RefreshCw },
  { to: "/ride-history", label: "Ride History", icon: History },
  { to: "/passenger-bookings", label: "Passenger Bookings", icon: BookOpen },
  { to: "/staff-directory", label: "Staff Directory", icon: Users },
  { to: "/notifications", label: "Notifications", icon: Bell },
  { to: "/support", label: "Passenger Support", icon: LifeBuoy },
];

function Stat({ label, value }) {
  return (
    <div className="p-4 rounded-xl border bg-card">
      <div className="text-2xl font-bold">{value}</div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </div>
  );
}

export default function Admin() {
  const { user } = useAuth();
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
  const { location: userLoc } = useUserLocation();

  const go = (s) => navigate("/admin/" + s);

  const load = async () => {
    const [u, c, v, r, t, insp, dr, fl, pt, sch, tmpl, ir] = await Promise.all([
      base44.entities.User.list(),
      base44.entities.Company.list(),
      base44.entities.Vehicle.list(),
      base44.entities.Route.list(),
      base44.entities.Trip.list(),
      base44.entities.Inspection.list(),
      base44.entities.Driver.list(),
      base44.entities.Fault.list(),
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
    setLoading(false);
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
    <div className="fixed inset-0 z-[999] bg-destructive text-destructive-foreground flex flex-col items-center justify-center p-6 text-center">
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
        <AppLayout>
          <p className="text-muted-foreground">Loading…</p>
        </AppLayout>
      </>
    );

  const activeTrips = trips.filter((t) =>
    ["scheduled", "on_the_way", "arrived"].includes(t.status)
  );
  const liveCount = vehicles.filter((v) => v.status !== "offline").length;
  const openFaultsCount = faults.filter((f) => f.status === "open").length;
  const maintenanceDueCount = schedules.filter((s) => s.status === "due" || s.status === "overdue").length;

  // 7-day daily counts for the two stat tiles where a trend is meaningful
  // (Trips/Faults have a created_date to bucket by day; Vehicles/Companies/
  // Parts/Maintenance-due are point-in-time snapshots, not naturally a
  // trend, so they stay plain numbers).
  const last7Days = useMemo(() => {
    const days = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      d.setHours(0, 0, 0, 0);
      days.push(d);
    }
    return days;
  }, []);
  const dailyTrend = (records, dateField) =>
    last7Days.map((d) => {
      const next = new Date(d);
      next.setDate(d.getDate() + 1);
      const value = records.filter((r) => {
        const t = r[dateField] && new Date(r[dateField]);
        return t && t >= d && t < next;
      }).length;
      return { label: d.toLocaleDateString(undefined, { weekday: "short" }), value };
    });
  const tripsTrend = useMemo(() => dailyTrend(trips, "created_date"), [trips, last7Days]);
  const faultsTrend = useMemo(() => dailyTrend(faults, "created_date"), [faults, last7Days]);

  return (
    <>
      {emergencyOverlay}
      <AppLayout>
      <AdminShell active={section} onNavigate={go} alertVehicles={emergencyVehicles}>
        {section === "overview" && (
          <div className="space-y-4">
            <Greeting subtitle="Admin control center" />
            {pushPermission !== "granted" && pushPermission !== "unsupported" && (
              <Button variant="outline" size="sm" onClick={enableNotifications}>
                <Bell className="w-4 h-4 mr-1.5" /> Enable notifications (SOS alerts on this device)
              </Button>
            )}
            <div className="rounded-2xl overflow-hidden border">
              <MapboxMap
                vehicles={vehicles.filter((v) => v.current_lat != null)}
                userLocation={userLoc}
                height="40vh"
              />
            </div>
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <button onClick={() => go("vehicles")} className="text-left p-4 rounded-xl border bg-card hover:border-primary transition-colors">
                <div className="text-2xl font-bold">{vehicles.length}</div>
                <div className="text-xs text-muted-foreground">Vehicles</div>
              </button>
              <button onClick={() => go("fleet")} className="text-left p-4 rounded-xl border bg-card hover:border-primary transition-colors">
                <div className="text-2xl font-bold">{liveCount}</div>
                <div className="text-xs text-muted-foreground">Live now</div>
              </button>
              <button onClick={() => go("trips")} className="text-left p-4 rounded-xl border bg-card hover:border-primary transition-colors">
                <div className="text-2xl font-bold">{activeTrips.length}</div>
                <div className="text-xs text-muted-foreground">Active trips</div>
              </button>
              <button onClick={() => go("companies")} className="text-left p-4 rounded-xl border bg-card hover:border-primary transition-colors">
                <div className="text-2xl font-bold">{companies.length}</div>
                <div className="text-xs text-muted-foreground">Companies</div>
              </button>
              <button onClick={() => go("faults")} className="text-left p-4 rounded-xl border bg-card hover:border-primary transition-colors">
                <div className="text-2xl font-bold">{openFaultsCount}</div>
                <div className="text-xs text-muted-foreground">Open faults</div>
              </button>
              <button onClick={() => go("schedule")} className="text-left p-4 rounded-xl border bg-card hover:border-primary transition-colors">
                <div className="text-2xl font-bold">{maintenanceDueCount}</div>
                <div className="text-xs text-muted-foreground">Maintenance due</div>
              </button>
              <button onClick={() => go("parts")} className="text-left p-4 rounded-xl border bg-card hover:border-primary transition-colors">
                <div className="text-2xl font-bold">{parts.length}</div>
                <div className="text-xs text-muted-foreground">Parts</div>
              </button>
            </div>
            <Collapsible open={moreOpen} onOpenChange={setMoreOpen}>
              <CollapsibleTrigger asChild>
                <Button variant="outline" className="w-full justify-between">
                  <span className="flex items-center gap-2">
                    <Wrench className="w-4 h-4" /> More tools & shortcuts
                  </span>
                  <ChevronDown className={`w-4 h-4 transition-transform ${moreOpen ? "rotate-180" : ""}`} />
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent className="space-y-4 pt-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-base">
                      <ExternalLink className="w-4 h-4" /> Test as another role
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground mb-3">
                      Admins can open any role's view to test the experience end-to-end.
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {ROLE_LINKS.map((r) => {
                        const Icon = r.icon;
                        return (
                          <Button asChild key={r.to} variant="outline" size="sm">
                            <Link to={r.to}>
                              <Icon className="w-4 h-4 mr-1.5" />
                              {r.label}
                            </Link>
                          </Button>
                        );
                      })}
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-base">
                      <Link2 className="w-4 h-4" /> Portals & kiosks
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="flex flex-wrap gap-2">
                      {PORTAL_LINKS.map((r) => {
                        const Icon = r.icon;
                        return (
                          <Button asChild key={r.to} variant="outline" size="sm">
                            <Link to={r.to}>
                              <Icon className="w-4 h-4 mr-1.5" />
                              {r.label}
                            </Link>
                          </Button>
                        );
                      })}
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-base">
                      <Wrench className="w-4 h-4" /> Management tools
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="flex flex-wrap gap-2">
                      {MGMT_LINKS.map((r) => {
                        const Icon = r.icon;
                        return (
                          <Button asChild key={r.to} variant="outline" size="sm">
                            <Link to={r.to}>
                              <Icon className="w-4 h-4 mr-1.5" />
                              {r.label}
                            </Link>
                          </Button>
                        );
                      })}
                    </div>
                  </CardContent>
                </Card>
              </CollapsibleContent>
            </Collapsible>
          </div>
        )}

        {section === "trips" && (
          <AssignTripsTab vehicles={vehicles} routes={routes} trips={trips} onChange={load} />
        )}
        {section === "fleet" && (
          <LiveFleetTab
            vehicles={vehicles}
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
        {section === "templates" && <InspectionTemplatesTab templates={templates} companies={companies} onChange={load} />}
        {section === "inspection-history" && <InspectionHistoryTab results={inspectionResults} vehicles={vehicles} />}
        {section === "drivers" && (
          <DriversTab drivers={drivers} vehicles={vehicles} companies={companies} routes={routes} onChange={load} />
        )}
        {section === "sync" && <FleetSyncTab />}
        {section === "companies" && <CompaniesTab companies={companies} onChange={load} />}
        {section === "messaging" && <MessagingTab vehicles={vehicles} />}
        {section === "ads" && <AdsTab />}
        {section === "copilot" && <CopilotTab />}
        {section === "data" && <DataTab />}
        {section === "profile" && (
          <div className="max-w-xl">
            <ProfileInfo />
          </div>
        )}
      </AdminShell>
      <FloatingMessages vehicles={vehicles} />
      <FloatingChatbot />
      </AppLayout>
    </>
  );
}