import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Bus, Building2, DoorOpen, CreditCard, CheckCircle2, AlertCircle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

const TYPE_META = {
  bus_boarding: { label: "Bus boarding", icon: Bus },
  front_desk: { label: "Front-desk sign-in", icon: DoorOpen },
  badge_registry: { label: "Badge / QR registry", icon: CreditCard },
};

export default function Kiosk() {
  const [device, setDevice] = useState(null);
  const [status, setStatus] = useState("pairing"); // pairing | paired | error
  const [error, setError] = useState("");

  const code = new URLSearchParams(window.location.search).get("code");
  const storedId = localStorage.getItem("tt_kiosk_device_id");

  useEffect(() => {
    if (!code) { setStatus("error"); setError("No pairing code in the URL. Ask your administrator for the kiosk link."); return; }
    if (storedId) { setStatus("paired"); return; }

    base44.functions.invoke("pairKioskDevice", { pairing_code: code })
      .then((res) => {
        if (!res.data?.device_id) { setStatus("error"); setError("Pairing failed."); return; }
        localStorage.setItem("tt_kiosk_device_id", res.data.device_id);
        setDevice(res.data);
        setStatus("paired");
      })
      .catch((e) => {
        setStatus("error");
        setError(e?.response?.data?.error || "Invalid or expired pairing code.");
      });
  }, [code, storedId]);

  const meta = device ? (TYPE_META[device.kiosk_type] || TYPE_META.bus_boarding) : null;
  const Icon = meta?.icon || Bus;

  if (status === "pairing")
    return <div className="min-h-screen flex items-center justify-center"><div className="w-8 h-8 border-4 border-muted border-t-primary rounded-full animate-spin" /></div>;

  if (status === "error")
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <Card className="max-w-sm w-full">
          <CardContent className="pt-6 text-center space-y-3">
            <AlertCircle className="w-10 h-10 text-destructive mx-auto" />
            <p className="text-sm text-muted-foreground">{error}</p>
            <Button variant="outline" onClick={() => localStorage.removeItem("tt_kiosk_device_id")}>Retry</Button>
          </CardContent>
        </Card>
      </div>
    );

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-background">
      <Card className="max-w-sm w-full">
        <CardHeader className="text-center">
          <div className="mx-auto w-12 h-12 rounded-xl bg-emerald-500/10 grid place-items-center mb-2">
            <CheckCircle2 className="w-6 h-6 text-emerald-500" />
          </div>
          <CardTitle className="text-xl">Tablet paired</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center gap-3 p-3 rounded-lg border bg-card">
            <Icon className="w-5 h-5 text-primary shrink-0" />
            <div>
              <div className="text-sm font-medium">{meta?.label || "Kiosk"}</div>
              <div className="text-xs text-muted-foreground">{device?.label || "Device"}</div>
            </div>
          </div>
          {device?.company_name && (
            <div className="flex items-center gap-3 p-3 rounded-lg border bg-card">
              <Building2 className="w-5 h-5 text-primary shrink-0" />
              <div>
                <div className="text-sm font-medium">{device.company_name}</div>
                <div className="text-xs text-muted-foreground">Company</div>
              </div>
            </div>
          )}
          {device?.vehicle_name && (
            <div className="flex items-center gap-3 p-3 rounded-lg border bg-card">
              <Bus className="w-5 h-5 text-primary shrink-0" />
              <div>
                <div className="text-sm font-medium">{device.vehicle_name}</div>
                <div className="text-xs text-muted-foreground">Assigned vehicle</div>
              </div>
            </div>
          )}
          <p className="text-xs text-muted-foreground text-center pt-2">This tablet is now paired and ready. Keep it open to stay connected.</p>
        </CardContent>
      </Card>
    </div>
  );
}