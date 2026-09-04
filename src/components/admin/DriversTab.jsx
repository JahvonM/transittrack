import React from "react";
import { base44 } from "@/api/base44Client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Bus, Car, X } from "lucide-react";

export default function DriversTab({ users, vehicles, companies, onChange }) {
  const drivers = users.filter((u) => u.role === "driver");

  const assign = async (driver, vehicleId) => {
    if (!vehicleId) return;
    await base44.entities.Vehicle.update(vehicleId, {
      driver_email: driver.email,
      driver_name: driver.full_name || driver.email,
    });
    onChange();
  };

  const unassign = async (vehicleId) => {
    await base44.entities.Vehicle.update(vehicleId, { driver_email: null, driver_name: null });
    onChange();
  };

  return (
    <div className="space-y-3">
      {drivers.length === 0 && (
        <p className="text-sm text-muted-foreground py-8 text-center">
          No drivers yet. Invite a user with the Driver role, then assign buses here.
        </p>
      )}
      {drivers.map((d) => {
        const assigned = vehicles.filter((v) => v.driver_email === d.email);
        const companyName = companies.find((c) => c.id === d.company_id)?.name;
        const pool = vehicles.filter(
          (v) => (!d.company_id || v.company_id === d.company_id) && v.driver_email !== d.email
        );
        return (
          <Card key={d.id}>
            <CardHeader className="pb-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <CardTitle className="text-base flex items-center gap-2">
                  {d.full_name || d.email}
                  {companyName && <Badge variant="secondary" className="font-normal">{companyName}</Badge>}
                </CardTitle>
                <span className="text-xs text-muted-foreground">
                  {assigned.length} {assigned.length === 1 ? "bus" : "buses"} assigned
                </span>
              </div>
            </CardHeader>
            <CardContent className="space-y-2">
              {assigned.length === 0 && (
                <p className="text-sm text-muted-foreground">No buses assigned yet.</p>
              )}
              {assigned.map((v) => (
                <div key={v.id} className="flex items-center gap-3 p-2 rounded-lg border">
                  <div className="w-8 h-8 rounded-lg bg-primary/10 grid place-items-center shrink-0">
                    {v.type === "taxi" ? <Car className="w-4 h-4" /> : <Bus className="w-4 h-4" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{v.name}</div>
                    <div className="text-xs text-muted-foreground truncate">
                      {v.plate_number} · {v.company_name}
                    </div>
                  </div>
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => unassign(v.id)}>
                    <X className="w-4 h-4 text-destructive" />
                  </Button>
                </div>
              ))}
              {pool.length > 0 && (
                <Select onValueChange={(vid) => assign(d, vid)}>
                  <SelectTrigger className="h-8">
                    <SelectValue placeholder="+ Assign a bus to this driver" />
                  </SelectTrigger>
                  <SelectContent>
                    {pool.map((v) => (
                      <SelectItem key={v.id} value={v.id}>
                        {v.name} · {v.plate_number} ({v.company_name})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}