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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Car, ExternalLink, Hotel, LayoutDashboard, MapPin } from "lucide-react";

const ROLE_LINKS = [
  { to: "/passenger", label: "Passenger view", icon: MapPin },
  { to: "/driver", label: "Driver app", icon: Car },
  { to: "/company", label: "Company dashboard", icon: LayoutDashboard },
  { to: "/staff", label: "Staff portal", icon: Hotel },
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
  const [loading, setLoading] = useState(true);
  const [section, setSection] = useState("overview");

  const load = async () => {
    const [u, c, v, r, t] = await Promise.all([
      base44.entities.User.list(),
      base44.entities.Company.list(),
      base44.entities.Vehicle.list(),
      base44.entities.Route.list(),
      base44.entities.Trip.list(),
    ]);
    setUsers(u);
    setCompanies(c);
    setVehicles(v);
    setRoutes(r);
    setTrips(t);
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
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <Stat label="Vehicles" value={vehicles.length} />
              <Stat label="Live now" value={liveCount} />
              <Stat label="Active trips" value={activeTrips.length} />
              <Stat label="Companies" value={companies.length} />
            </div>
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
        {section === "drivers" && (
          <DriversTab users={users} vehicles={vehicles} companies={companies} onChange={load} />
        )}
        {section === "companies" && <CompaniesTab companies={companies} onChange={load} />}
        {section === "messaging" && <MessagingTab vehicles={vehicles} />}
        {section === "ads" && <AdsTab />}
        {section === "copilot" && <CopilotTab />}
        {section === "profile" && (
          <div className="max-w-xl">
            <ProfileInfo />
          </div>
        )}
      </AdminShell>
    </AppLayout>
  );
}