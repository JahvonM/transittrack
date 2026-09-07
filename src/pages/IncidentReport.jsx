import React, { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import AppLayout from "@/components/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/components/ui/use-toast";
import { AlertTriangle } from "lucide-react";

export default function IncidentReport() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [vehicles, setVehicles] = useState([]);
  const [vehicleId, setVehicleId] = useState("");
  const [type, setType] = useState("breakdown");
  const [details, setDetails] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    base44.entities.Vehicle.list("-created_date", 100).then(setVehicles).catch(() => {});
  }, []);

  const submit = async () => {
    if (!vehicleId || !details) {
      toast({ title: "Please fill in all fields", variant: "destructive" });
      return;
    }
    setSubmitting(true);
    try {
      const v = vehicles.find((x) => x.id === vehicleId);
      await base44.entities.Incident.create({
        vehicle_id: vehicleId,
        vehicle_name: v?.name || "",
        company_id: v?.company_id || "",
        company_name: v?.company_name || "",
        driver_name: user?.full_name || user?.email,
        driver_email: user?.email,
        type,
        details,
        occurred_at: new Date().toISOString(),
        status: "open",
      });
      toast({ title: "Incident reported", description: "Your company has been notified." });
      setVehicleId("");
      setDetails("");
      setType("breakdown");
    } catch (e) {
      toast({ title: "Failed to submit", description: e.message, variant: "destructive" });
    }
    setSubmitting(false);
  };

  return (
    <AppLayout title="Incident Report">
      <Card className="max-w-lg mx-auto">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-primary" /> Report an incident
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label>Vehicle</Label>
            <Select value={vehicleId} onValueChange={setVehicleId}>
              <SelectTrigger><SelectValue placeholder="Select vehicle" /></SelectTrigger>
              <SelectContent>
                {vehicles.map((v) => (
                  <SelectItem key={v.id} value={v.id}>{v.name} · {v.plate_number}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Incident type</Label>
            <Select value={type} onValueChange={setType}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="breakdown">Mechanical / Breakdown</SelectItem>
                <SelectItem value="emergency">Accident / Emergency</SelectItem>
                <SelectItem value="speeding">Speeding</SelectItem>
                <SelectItem value="other">Other</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Details</Label>
            <Textarea value={details} onChange={(e) => setDetails(e.target.value)} placeholder="Describe what happened…" rows={4} />
          </div>
          <Button className="w-full" onClick={submit} disabled={submitting}>
            {submitting ? "Submitting…" : "Submit report"}
          </Button>
        </CardContent>
      </Card>
    </AppLayout>
  );
}