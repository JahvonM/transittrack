import React, { useState, useEffect, useRef, useCallback } from "react";
import { base44 } from "@/api/base44Client";
import { Bus, Building2, DoorOpen, CreditCard, CheckCircle2, AlertCircle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  const [manualCode, setManualCode] = useState("");
  const [pairing, setPairing] = useState(false);
  const heartbeatId = useRef(null);

  const code = new URLSearchParams(window.location.search).get("code");
  const storedId = localStorage.getItem("tt_kiosk_device_id");

  // Shared by the initial ?code= flow and the error screen's manual-entry
  // fallback — a tablet that's been sitting at its bare bookmarked /kiosk
  // URL (no ?code=) with no localStorage entry (cleared after its pairing
  // was revoked server-side) previously had NO way to recover without
  // someone physically typing a full pairing URL on it. This lets whoever's
  // standing at the tablet just type the code an admin reads out to them.
  const pairWithCode = (value) => {
    setPairing(true);
    setError("");
    base44.functions.invoke("pairKioskDevice", { pairing_code: value })
      .then((res) => {
        if (!res.data?.device_id) { setStatus("error"); setError("Pairing failed."); return; }
        localStorage.setItem("tt_kiosk_device_id", res.data.device_id);
        setDevice(res.data);
        setDeviceId(res.data.device_id);
        setStatus("paired");
        setManualCode("");
        heartbeatId.current = setInterval(() => heartbeat(res.data.device_id), HEARTBEAT_MS);
      })
      .catch((e) => {
        setStatus("error");
        setError(e?.response?.data?.error || "Invalid or expired pairing code.");
      })
      .finally(() => setPairing(false));
  };

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

    pairWithCode(code);

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
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary/15 via-background to-background">
        <BusLoader label="Connecting this tablet…" />
      </div>
    );

  if (status === "error")
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-primary/15 via-background to-background">
        <Card className="max-w-md w-full rounded-3xl shadow-xl border-border/60 animate-in fade-in zoom-in-95 duration-300">
          <CardContent className="pt-8 pb-8 text-center space-y-5">
            <div className="mx-auto w-16 h-16 rounded-full bg-destructive/10 grid place-items-center">
              <AlertCircle className="w-9 h-9 text-destructive" />
            </div>
            <p className="text-sm text-muted-foreground">{error}</p>
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">Have a pairing code? Enter it below to reconnect this tablet.</p>
              <div className="flex gap-2">
                <Input
                  value={manualCode}
                  onChange={(e) => setManualCode(e.target.value.toUpperCase())}
                  placeholder="Pairing code"
                  className="text-center tracking-widest h-12 text-lg"
                  onKeyDown={(e) => { if (e.key === "Enter" && manualCode.trim()) pairWithCode(manualCode.trim()); }}
                />
                <Button className="h-12 px-6" onClick={() => pairWithCode(manualCode.trim())} disabled={!manualCode.trim() || pairing}>
                  {pairing ? "Pairing…" : "Pair"}
                </Button>
              </div>
            </div>
            <Button variant="outline" className="w-full h-11" onClick={() => { localStorage.removeItem("tt_kiosk_device_id"); window.location.reload(); }}>Retry</Button>
          </CardContent>
        </Card>
      </div>
    );

  // bus_boarding owns the whole viewport (top status bar, live map backdrop,
  // two-panel layout) — it doesn't fit inside the generic small centered
  // card the other two kiosk types use, and a big tablet has room to spare.
  if (device?.kiosk_type === "bus_boarding") {
    return <BusBoardingKiosk invoke={invoke} device={device} />;
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-primary/15 via-background to-background">
      <div className="max-w-md w-full space-y-4">
        <Card className="rounded-3xl shadow-xl border-border/60 overflow-hidden animate-in fade-in slide-in-from-top-4 duration-500">
          <CardHeader className="text-center pb-4 pt-6">
            {device?.company_logo_url ? (
              <img
                src={device.company_logo_url}
                alt={device.company_name || "Company logo"}
                className="mx-auto w-16 h-16 rounded-2xl object-cover shadow-md mb-2"
              />
            ) : (
              <div className="mx-auto w-14 h-14 rounded-2xl bg-gradient-to-br from-primary to-primary/60 grid place-items-center mb-2 shadow-md">
                <CheckCircle2 className="w-7 h-7 text-primary-foreground" />
              </div>
            )}
            <CardTitle className="text-lg flex items-center justify-center gap-2">
              <Icon className="w-5 h-5 text-primary" /> {meta?.label || "Kiosk"}
            </CardTitle>
          </CardHeader>
          {(device?.company_name || device?.vehicle_name) && (
            <CardContent className="pt-0 pb-5 flex flex-wrap justify-center gap-2 text-sm text-muted-foreground">
              {device?.company_name && (
                <span className="flex items-center gap-1.5 font-medium"><Building2 className="w-4 h-4" /> {device.company_name}</span>
              )}
              {device?.vehicle_name && (
                <span className="flex items-center gap-1.5"><Bus className="w-4 h-4" /> {device.vehicle_name}</span>
              )}
            </CardContent>
          )}
        </Card>

        <div key={device?.kiosk_type} className="animate-in fade-in zoom-in-95 duration-300">
          {device?.kiosk_type === "badge_registry" && <BadgeRegistryKiosk invoke={invoke} />}
          {device?.kiosk_type === "front_desk" && <FrontDeskKiosk invoke={invoke} />}
        </div>
      </div>
    </div>
  );
}
