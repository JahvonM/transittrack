import React, { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import AppLayout from "@/components/AppLayout";
import AssignTripsTab from "@/components/admin/AssignTripsTab";
import LiveFleetTab from "@/components/admin/LiveFleetTab";
import CompletedTripsTab from "@/components/admin/CompletedTripsTab";
import { Building2, CalendarPlus, MapPin, Trash2, UserPlus, Users } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export default function Admin() {
  const { user } = useAuth();
  const [users, setUsers] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [routes, setRoutes] = useState([]);
  const [trips, setTrips] = useState([]);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("passenger");
  const [inviting, setInviting] = useState(false);
  const [loading, setLoading] = useState(true);

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

  const setRole = async (u, role) => {
    await base44.entities.User.update(u.id, { role });
    load();
  };
  const setCompany = async (u, companyId) => {
    await base44.entities.User.update(u.id, { company_id: companyId === "none" ? null : companyId });
    load();
  };
  const invite = async () => {
    if (!inviteEmail.trim()) return;
    setInviting(true);
    try {
      await base44.users.inviteUser(inviteEmail.trim(), inviteRole);
      setInviteEmail("");
      load();
    } finally {
      setInviting(false);
    }
  };
  const removeUser = async (u) => {
    await base44.entities.User.delete(u.id);
    load();
  };

  if (loading) return <AppLayout><p className="text-muted-foreground">Loading…</p></AppLayout>;

  return (
    <AppLayout title="Admin">
      <Tabs defaultValue="trips">
        <TabsList className="flex-wrap">
          <TabsTrigger value="trips"><CalendarPlus className="w-4 h-4 mr-1.5" />Trips</TabsTrigger>
          <TabsTrigger value="fleet"><MapPin className="w-4 h-4 mr-1.5" />Live fleet</TabsTrigger>
          <TabsTrigger value="billing"><Building2 className="w-4 h-4 mr-1.5" />Completed &amp; billing</TabsTrigger>
          <TabsTrigger value="users"><Users className="w-4 h-4 mr-1.5" />Users &amp; roles</TabsTrigger>
        </TabsList>

        <TabsContent value="trips" className="mt-4">
          <AssignTripsTab vehicles={vehicles} routes={routes} trips={trips} onChange={load} />
        </TabsContent>

        <TabsContent value="fleet" className="mt-4">
          <LiveFleetTab vehicles={vehicles} />
        </TabsContent>

        <TabsContent value="billing" className="mt-4">
          <CompletedTripsTab trips={trips} />
        </TabsContent>

        <TabsContent value="users" className="mt-4">
          <div className="grid lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><Users className="w-5 h-5" /> Users &amp; Roles</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="flex flex-wrap items-center gap-2 p-3 rounded-lg border bg-muted/40">
                  <UserPlus className="w-4 h-4 text-muted-foreground shrink-0" />
                  <Input
                    type="email"
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    placeholder="invite by email"
                    className="flex-1 min-w-[160px] h-8"
                  />
                  <Select value={inviteRole} onValueChange={setInviteRole}>
                    <SelectTrigger className="w-[130px] h-8"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="passenger">Passenger</SelectItem>
                      <SelectItem value="company">Company</SelectItem>
                      <SelectItem value="driver">Driver</SelectItem>
                      <SelectItem value="staff">Hotel staff</SelectItem>
                      <SelectItem value="admin">Admin</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button size="sm" onClick={invite} disabled={inviting || !inviteEmail.trim()}>
                    {inviting ? "Inviting…" : "Invite"}
                  </Button>
                </div>
                {users.map((u) => (
                  <div key={u.id} className="flex flex-wrap items-center gap-2 p-3 rounded-lg border">
                    <div className="flex-1 min-w-[160px]">
                      <div className="font-medium text-sm">{u.full_name || u.email}</div>
                      <div className="text-xs text-muted-foreground">{u.email}</div>
                    </div>
                    <Badge variant="outline">{u.role}</Badge>
                    <Select value={u.role} onValueChange={(r) => setRole(u, r)}>
                      <SelectTrigger className="w-[130px] h-8"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="passenger">Passenger</SelectItem>
                        <SelectItem value="company">Company</SelectItem>
                        <SelectItem value="driver">Driver</SelectItem>
                        <SelectItem value="staff">Hotel staff</SelectItem>
                        <SelectItem value="admin">Admin</SelectItem>
                      </SelectContent>
                    </Select>
                    {u.role === "company" && (
                      <Select value={u.company_id || "none"} onValueChange={(c) => setCompany(u, c)}>
                        <SelectTrigger className="w-[160px] h-8"><SelectValue placeholder="No company" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">No company</SelectItem>
                          {companies.map((c) => (
                            <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                    {u.id !== user?.id && (
                      <Button variant="ghost" size="icon" onClick={() => removeUser(u)}>
                        <Trash2 className="w-4 h-4 text-destructive" />
                      </Button>
                    )}
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><Building2 className="w-5 h-5" /> Companies</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {companies.length === 0 && <p className="text-sm text-muted-foreground">No companies yet. Companies are created by their operators from the Dashboard.</p>}
                {companies.map((c) => (
                  <div key={c.id} className="p-3 rounded-lg border">
                    <div className="font-medium">{c.name}</div>
                    <div className="text-xs text-muted-foreground mt-0.5 flex flex-wrap gap-1">
                      {(c.service_types || []).map((t) => (
                        <Badge key={t} variant="secondary" className="capitalize">{t.replace("_", " ")}</Badge>
                      ))}
                    </div>
                    {c.phone && <div className="text-xs text-muted-foreground mt-1">{c.phone}</div>}
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </AppLayout>
  );
}