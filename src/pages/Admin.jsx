import React, { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import AppLayout from "@/components/AppLayout";
import { Building2, Users } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export default function Admin() {
  const { user } = useAuth();
  const [users, setUsers] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    const [u, c] = await Promise.all([
      base44.entities.User.list(),
      base44.entities.Company.list(),
    ]);
    setUsers(u);
    setCompanies(c);
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

  if (loading) return <AppLayout><p className="text-muted-foreground">Loading…</p></AppLayout>;

  return (
    <AppLayout title="Admin">
      <div className="grid lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Users className="w-5 h-5" /> Users & Roles</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
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
    </AppLayout>
  );
}