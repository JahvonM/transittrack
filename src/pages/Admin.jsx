import React, { useEffect, useState } from "react";
import { Navigate, Link } from "react-router-dom";
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
import MessagingTab from "@/components/admin/MessagingTab";
import AdsTab from "@/components/admin/AdsTab";
import CompaniesTab from "@/components/admin/CompaniesTab";
import UsersTab from "@/components/admin/UsersTab";
import ServiceQueueTab from "@/components/admin/ServiceQueueTab";
import FleetSyncTab from "@/components/admin/FleetSyncTab";
import Greeting from "@/components/Greeting";
import MapboxMap from "@/components/MapboxMap";
import AddVehicleQuick from "@/components/admin/AddVehicleQuick";
import DataTab from "@/components/admin/DataTab";
import FloatingChatbot from "@/components/admin/FloatingChatbot";
import useUserLocation from "@/hooks/useUserLocation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Car,
  CreditCard,
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
} from "lucide-react";

const ROLE_LINKS = [
  { to: "/passenger", label: "Passenger view", icon: MapPin },
  { to: "/driver", label: "Driver app", icon: Car },
  { to: "/company", label: "Company dashboard", icon: LayoutDashboard },
  { to: "/staff", label: "Staff portal", icon: Hotel },
  { to: "/manager", label: "Fleet manager", icon: Radar },
];

const PORTAL_LINKS = [
  { to: "/badge-registry", label: "Badge Registry", icon: CreditCard },
  { to: "/kiosk/bus", label: "Bus Entry Kiosk", icon: Smartphone },
  { to: "/kiosk/front-desk", label: "Front Desk Kiosk", icon: DoorOpen },
  { to: "/reviewer-sandbox", label: "Reviewer Sandbox", icon: FlaskConical },
];

const MGMT_LINKS = [
  { to: "/vehicle-registry", label: "Vehicle Registry", icon: Car },
  { to: "/driver-profile", label: "Driver Profiles", icon: UserCircle },
  { to: "/driver-schedule", label: "Driver Schedule", icon: CalendarClock },
  { to: "/maintenance-queue", label: "Maintenance Queue", icon: Wrench },
  { to: "/service-history", label: "Service History", icon: History },
  { to: "/vehicle-logs", label: "Vehicle Logs", icon: FileText },
  { to: "/safety-standards", label: "Safety Standards", icon: ShieldCheck },
  { to: "/incident-reports", label: "Incident Reports", icon: AlertTriangle },
  { to: "/incident-report", label: "Report Incident", icon: LifeBuoy },
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
  const [users, setUsers] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [routes, setRoutes] = useState([]);
  const [trips, setTrips] = useState([]);
  const [inspections, setInspections] = useState([]);
  const [loading, setLoading] = useState(true);
  const [section, setSection] = useState("overview");
  const { location: userLoc } = useUserLocation();

  const load = async () => {
    const [u, c, v, r, t, insp] = await Promise.all([
      base44.entities.User.list(),
      base44.entities.Company.list(),
      base44.entities.Vehicle.list(),
      base44.entities.Route.list(),
      base44.entities.Trip.list(),
      base44.entities.Inspection.list(),
    ]);
    setUsers(u);
    setCompanies(c);
    setVehicles(v);
    setRoutes(r);
    setTrips(t);
    setInspections(insp);
    setLoading(false);
  };
  useEffect(() => {
    load();
  }, []);

  if (user && user.role !== "admin") return <Navigate to="/" replace />;
  if (loading)
    return (
      <AppLayout>
        <p className="text-muted-foreground">Loading…</p>
      </AppLayout>
    );

  const activeTrips = trips.filter((t) =>
    ["scheduled", "on_the_way", "arrived"].includes(t.status)
  );
  const liveCount = vehicles.filter((v) => v.status !== "offline").length;

  return (
    <AppLayout>
      <AdminShell active={section} onNavigate={setSection}>
        {section === "overview" && (
          <div className="space-y-4">
            <Greeting subtitle="Admin control center" />
            <div className="rounded-2xl overflow-hidden border">
              <MapboxMap
                vehicles={vehicles.filter((v) => v.current_lat != null)}
                userLocation={userLoc}
                height="40vh"
              />
            </div>
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <button onClick={() => setSection("vehicles")} className="text-left p-4 rounded-xl border bg-card hover:border-primary transition-colors">
                <div className="text-2xl font-bold">{vehicles.length}</div>
                <div className="text-xs text-muted-foreground">Vehicles</div>
              </button>
              <button onClick={() => setSection("fleet")} className="text-left p-4 rounded-xl border bg-card hover:border-primary transition-colors">
                <div className="text-2xl font-bold">{liveCount}</div>
                <div className="text-xs text-muted-foreground">Live now</div>
              </button>
              <button onClick={() => setSection("trips")} className="text-left p-4 rounded-xl border bg-card hover:border-primary transition-colors">
                <div className="text-2xl font-bold">{activeTrips.length}</div>
                <div className="text-xs text-muted-foreground">Active trips</div>
              </button>
              <button onClick={() => setSection("companies")} className="text-left p-4 rounded-xl border bg-card hover:border-primary transition-colors">
                <div className="text-2xl font-bold">{companies.length}</div>
                <div className="text-xs text-muted-foreground">Companies</div>
              </button>
            </div>
            <AddVehicleQuick companies={companies} onChange={load} />
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
          </div>
        )}

        {section === "trips" && (
          <AssignTripsTab vehicles={vehicles} routes={routes} trips={trips} onChange={load} />
        )}
        {section === "fleet" && <LiveFleetTab vehicles={vehicles} />}
        {section === "vehicles" && (
          <VehiclesTab vehicles={vehicles} companies={companies} routes={routes} onChange={load} />
        )}
        {section === "billing" && <CompletedTripsTab trips={trips} />}
        {section === "users" && (
          <UsersTab users={users} companies={companies} currentUser={user} onChange={load} />
        )}
        {section === "service" && (
          <ServiceQueueTab inspections={inspections} onChange={load} />
        )}
        {section === "drivers" && (
          <DriversTab users={users} vehicles={vehicles} companies={companies} routes={routes} onChange={load} />
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
      <FloatingChatbot />
    </AppLayout>
  );
}