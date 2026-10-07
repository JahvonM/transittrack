import React, { useEffect, useState } from "react";
import { StatusChip } from "@/components/admin/kit";
import EmptyState from "@/components/EmptyState";
import BusLoader from "@/components/BusLoader";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import AppLayout from "@/components/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Bus, ClipboardCheck, Mail, User } from "lucide-react";
import { accountName } from "@/lib/userName";

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
    ])
      .then(([v, i]) => { setVehicles(v); setInspections(i); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [user?.email]);

  return (
    <AppLayout title="Driver profile">
      {loading ? <BusLoader label="Loading your profile…" className="py-10" /> : (
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base flex items-center gap-2"><User className="w-4 h-4 text-primary" /> Contact</CardTitle></CardHeader>
            <CardContent className="text-sm space-y-1">
              <div className="flex items-center gap-2"><User className="w-4 h-4 text-muted-foreground" /> {accountName(user) || "—"}</div>
              <div className="flex items-center gap-2"><Mail className="w-4 h-4 text-muted-foreground" /> {user?.email}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base flex items-center gap-2"><Bus className="w-4 h-4 text-primary" /> Assigned buses ({vehicles.length})</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-sm">
              {vehicles.length === 0 && <EmptyState text="No vehicles assigned." />}
              {vehicles.map((v) => (
                <div key={v.id} className="flex items-center justify-between border-b border-border/50 pb-2 last:border-0">
                  <span>{v.name} · {v.plate_number}</span>
                  <StatusChip status={v.status} />
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base flex items-center gap-2"><ClipboardCheck className="w-4 h-4 text-primary" /> Inspection history ({inspections.length})</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-sm">
              {inspections.length === 0 && <EmptyState text="No inspections recorded." />}
              {inspections.map((i) => (
                <div key={i.id} className="flex items-center justify-between border-b border-border/50 pb-2 last:border-0">
                  <span>{i.vehicle_name} · {i.date ? new Date(i.date).toLocaleDateString() : "—"}</span>
                  <StatusChip status={i.status} />
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      )}
    </AppLayout>
  );
}