import React, { useState, useEffect, useRef, useCallback } from "react";
import { base44 } from "@/api/base44Client";
import { Bus, Building2, DoorOpen, CreditCard, CheckCircle2, AlertCircle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import BusBoardingKiosk from "@/components/kiosk/BusBoardingKiosk";
import BadgeRegistryKiosk from "@/components/kiosk/BadgeRegistryKiosk";
import FrontDeskKiosk from "@/components/kiosk/FrontDeskKiosk";

const TYPE_META = {
  bus_boarding: { label: "Bus boarding", icon: Bus },
  front_desk: { label: "Front-desk sign-in", icon: DoorOpen },
  badge_registry: { label: "Badge / QR registry", icon: CreditCard },
};

const HEARTBEAT_MS = 30000;

export default function Kiosk() {
  const [device, setDevice] = useState(null);
  const [deviceId, setDeviceId] = useState(null);
  const [status, setStatus] = useState("pairing"); // pairing | paired | error
  const [error, setError] = useState("");
  const heartbeatId = useRef(null);

  const code = new URLSearchParams(window.location.search).get("code");
  const storedId = localStorage.getItem("tt_kiosk_device_id");

  // Keeps `last_seen` fresh (admin's Kiosk Tablets screen shows this as
  // "Last seen: X ago") and re-syncs device details for the paired screen.
  // Without this, a paired kiosk looked perpetually stale to admin no matter
  // how actively it was being used — it only ever checked in once, at pairing.
  const heartbeat = (id) => {
    base44.functions
      .invoke("kioskHeartbeat", { device_id: id })
      .then((res) => {
        if (res.data?.error) {
          setStatus("error");
          setError("This device is no longer paired. Ask your administrator for a new pairing link.");
          localStorage.removeItem("tt_kiosk_device_id");
          if (heartbeatId.current) clearInterval(heartbeatId.current);
          return;
        }
        setDevice(res.data);
        setDeviceId(id);
        setStatus("paired");
      })
      .catch(() => {
        /* transient network issue — next heartbeat retries; don't drop paired state over one miss */
      });
  };

  useEffect(() => {
    if (!code && !storedId) {
      setStatus("error");
      setError("No pairing code in the URL. Ask your administrator for the kiosk link.");
      return;
    }

    if (storedId) {
      heartbeat(storedId);
      heartbeatId.current = setInterval(() => heartbeat(storedId), HEARTBEAT_MS);
      return () => { if (heartbeatId.current) clearInterval(heartbeatId.current); };
    }

    base44.functions.invoke("pairKioskDevice", { pairing_code: code })
      .then((res) => {
        if (!res.data?.device_id) { setStatus("error"); setError("Pairing failed."); return; }
        localStorage.setItem("tt_kiosk_device_id", res.data.device_id);
        setDevice(res.data);
        setDeviceId(res.data.device_id);
        setStatus("paired");
        heartbeatId.current = setInterval(() => heartbeat(res.data.device_id), HEARTBEAT_MS);
      })
      .catch((e) => {
        setStatus("error");
        setError(e?.response?.data?.error || "Invalid or expired pairing code.");
      });

    return () => { if (heartbeatId.current) clearInterval(heartbeatId.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code, storedId]);

  // Every kiosk action (search/lookup/check-in/register/sign-in) goes
  // through this one backend function, keyed by device_id like driverSession.
  const invoke = useCallback(async (action, payload = {}) => {
    const res = await base44.functions.invoke("kioskCheckIn", { device_id: deviceId, action, ...payload });
    return res.data;
  }, [deviceId]);

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
            <Button variant="outline" onClick={() => { localStorage.removeItem("tt_kiosk_device_id"); window.location.reload(); }}>Retry</Button>
          </CardContent>
        </Card>
      </div>
    );

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-background">
      <div className="max-w-sm w-full space-y-3">
        <Card>
          <CardHeader className="text-center pb-3">
            <div className="mx-auto w-10 h-10 rounded-xl bg-emerald-500/10 grid place-items-center mb-1">
              <CheckCircle2 className="w-5 h-5 text-emerald-500" />
            </div>
            <CardTitle className="text-base flex items-center justify-center gap-2">
              <Icon className="w-4 h-4 text-primary" /> {meta?.label || "Kiosk"}
            </CardTitle>
          </CardHeader>
          {(device?.company_name || device?.vehicle_name) && (
            <CardContent className="pt-0 pb-4 flex flex-wrap justify-center gap-2 text-xs text-muted-foreground">
              {device?.company_name && (
                <span className="flex items-center gap-1"><Building2 className="w-3.5 h-3.5" /> {device.company_name}</span>
              )}
              {device?.vehicle_name && (
                <span className="flex items-center gap-1"><Bus className="w-3.5 h-3.5" /> {device.vehicle_name}</span>
              )}
            </CardContent>
          )}
        </Card>

        {device?.kiosk_type === "bus_boarding" && <BusBoardingKiosk invoke={invoke} />}
        {device?.kiosk_type === "badge_registry" && <BadgeRegistryKiosk invoke={invoke} />}
        {device?.kiosk_type === "front_desk" && <FrontDeskKiosk invoke={invoke} />}
      </div>
    </div>
  );
}
