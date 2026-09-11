import React, { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { useDriverSession } from "@/hooks/useDriverSession";
import DriverPairing from "@/components/driver/DriverPairing";
import DriverGreeting from "@/components/driver/DriverGreeting";
import PinGate from "@/components/driver/PinGate";
import PreTripInspection from "@/components/driver/PreTripInspection";
import DriverTrackingDashboard from "@/components/driver/DriverTrackingDashboard";
import DriverNavMap from "@/components/driver/DriverNavMap";
import DriverMessages from "@/components/DriverMessages";
import DriverDevicePanel from "@/components/driver/DriverDevicePanel";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

const TRACKING_TABS = ["track", "navigate", "messages", "profile"];

export default function DriverApp() {
  const navigate = useNavigate();
  const { stage: urlStage } = useParams();
  const [deviceId, setDeviceId] = useState(() => localStorage.getItem("tt_driver_device_id"));
  const [unlocked, setUnlocked] = useState(false);
  const { session, loading, invoke } = useDriverSession(deviceId);

  // Auto-pair when a pairing code is provided in the URL (?code=AB3D9K)
  const [autoPairing, setAutoPairing] = useState(false);
  const pairCode = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("code") : null;

  useEffect(() => {
    if (!deviceId && pairCode && !autoPairing) {
      setAutoPairing(true);
      base44.functions.invoke("pairKioskDevice", { pairing_code: pairCode })
        .then((res) => {
          if (res.data?.kiosk_type === "driver" && res.data?.vehicle_id) {
            localStorage.setItem("tt_driver_device_id", res.data.device_id);
            setDeviceId(res.data.device_id);
            navigate("/driver", { replace: true });
          } else {
            setAutoPairing(false);
          }
        })
        .catch(() => setAutoPairing(false));
    }
  }, [deviceId, pairCode, autoPairing, navigate]);

  const isMorning = new Date().getHours() >= 4 && new Date().getHours() < 11;
  const stage = urlStage || "pin";

  const handlePaired = (id) => { localStorage.setItem("tt_driver_device_id", id); setDeviceId(id); };
  const handleUnpair = () => { localStorage.removeItem("tt_driver_device_id"); setDeviceId(null); setUnlocked(false); navigate("/driver"); };

  if (!deviceId) {
    if (autoPairing)
      return <div className="min-h-screen flex items-center justify-center"><div className="w-8 h-8 border-4 border-muted border-t-primary rounded-full animate-spin" /></div>;
    return <DriverPairing onPaired={handlePaired} />;
  }

  if (loading && !session)
    return <div className="min-h-screen flex items-center justify-center"><div className="w-8 h-8 border-4 border-muted border-t-primary rounded-full animate-spin" /></div>;

  if (!session?.vehicle)
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6 text-center">
        <AlertCircle className="w-10 h-10 text-muted-foreground mb-3" />
        <p className="text-muted-foreground max-w-md mb-4">No vehicle is assigned to this tablet. Ask your administrator to assign a vehicle.</p>
        <Button variant="outline" onClick={handleUnpair}>Unpair tablet</Button>
      </div>
    );

  const vehicle = session.vehicle;
  const driverName = session.driver_name || "Driver";
  const goStage = (s) => navigate("/driver/" + s);

  if (!unlocked) {
    return (
      <div className="min-h-screen p-4 safe-area-top safe-area-x">
        <div className="space-y-4 max-w-3xl mx-auto">
          <DriverGreeting driverName={driverName} subtitle={vehicle.name} />
          <PinGate vehicle={vehicle} onUnlock={() => { setUnlocked(true); goStage(isMorning ? "inspection" : "track"); }} />
        </div>
      </div>
    );
  }

  if (stage === "inspection") {
    return (
      <div className="min-h-screen p-4 safe-area-top safe-area-x">
        <div className="space-y-4 max-w-3xl mx-auto">
          <DriverGreeting driverName={driverName} subtitle={vehicle.name} />
          <PreTripInspection vehicle={vehicle} invoke={invoke} driverName={driverName} onCompleted={() => goStage("track")} />
        </div>
      </div>
    );
  }

  const tab = TRACKING_TABS.includes(stage) ? stage : "track";

  return (
    <div className="min-h-screen p-4 safe-area-top safe-area-x">
      <div className="space-y-4 max-w-3xl mx-auto">
        <DriverGreeting driverName={driverName} subtitle={vehicle.name} />
        <Tabs value={tab} onValueChange={(v) => goStage(v)} className="w-full">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="track">Track</TabsTrigger>
            <TabsTrigger value="navigate">Navigate</TabsTrigger>
            <TabsTrigger value="messages">Messages</TabsTrigger>
            <TabsTrigger value="profile">Profile</TabsTrigger>
          </TabsList>
          <TabsContent value="track" className="mt-4 space-y-4">
            <DriverTrackingDashboard session={session} invoke={invoke} driverName={driverName} />
          </TabsContent>
          <TabsContent value="navigate" className="mt-4">
            <DriverNavMap session={session} invoke={invoke} />
          </TabsContent>
          <TabsContent value="messages" className="mt-4">
            <DriverMessages session={session} invoke={invoke} />
          </TabsContent>
          <TabsContent value="profile" className="mt-4">
            <DriverDevicePanel session={session} deviceId={deviceId} onUnpair={handleUnpair} />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}