import React, { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import AppLayout from "@/components/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Bus, ClipboardCheck, Mail, User } from "lucide-react";

export default function DriverProfile() {
  const { user } = useAuth();
  const [vehicles, setVehicles] = useState([]);
  const [inspections, setInspections] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user?.email) return;
    Promise.all([
      base44.entities.Vehicle.filter({ driver_email: user.email }, "-updated_date", 100),
      base44.entities.Inspection.filter({ driver_email: user.email }, "-date", 100),
    ]).then(([v, i]) => { setVehicles(v); setInspections(i); setLoading(false); });
  }, [user?.email]);

  return (
    <AppLayout title="Driver profile">
      {loading ? <p className="text-muted-foreground">Loading…</p> : (
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base flex items-center gap-2"><User className="w-4 h-4 text-primary" /> Contact</CardTitle></CardHeader>
            <CardContent className="text-sm space-y-1">
              <div className="flex items-center gap-2"><User className="w-4 h-4 text-muted-foreground" /> {user?.full_name || "—"}</div>
              <div className="flex items-center gap-2"><Mail className="w-4 h-4 text-muted-foreground" /> {user?.email}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base flex items-center gap-2"><Bus className="w-4 h-4 text-primary" /> Assigned buses ({vehicles.length})</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-sm">
              {vehicles.length === 0 && <p className="text-muted-foreground">No vehicles assigned.</p>}
              {vehicles.map((v) => (
                <div key={v.id} className="flex items-center justify-between border-b border-border/50 pb-2 last:border-0">
                  <span>{v.name} · {v.plate_number}</span>
                  <Badge variant="secondary">{v.status}</Badge>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base flex items-center gap-2"><ClipboardCheck className="w-4 h-4 text-primary" /> Inspection history ({inspections.length})</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-sm">
              {inspections.length === 0 && <p className="text-muted-foreground">No inspections recorded.</p>}
              {inspections.map((i) => (
                <div key={i.id} className="flex items-center justify-between border-b border-border/50 pb-2 last:border-0">
                  <span>{i.vehicle_name} · {i.date ? new Date(i.date).toLocaleDateString() : "—"}</span>
                  <Badge variant={i.status === "passed" ? "default" : "destructive"}>{i.status}</Badge>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      )}
    </AppLayout>
  );
}