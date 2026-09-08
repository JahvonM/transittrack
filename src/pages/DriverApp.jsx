import React, { useEffect, useState } from "react";
import { Navigate, useParams, useNavigate, Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import AppLayout from "@/components/AppLayout";
import PinGate from "@/components/driver/PinGate";
import PreTripInspection from "@/components/driver/PreTripInspection";
import DriverTrackingDashboard from "@/components/driver/DriverTrackingDashboard";
import DriverNavMap from "@/components/driver/DriverNavMap";
import DriverMessages from "@/components/DriverMessages";
import Greeting from "@/components/Greeting";
import ProfileInfo from "@/components/ProfileInfo";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AlertCircle, DoorOpen } from "lucide-react";
import { Button } from "@/components/ui/button";

const TRACKING_TABS = ["track", "navigate", "messages", "profile"];

// Flow: pin gate → inspection → tracking dashboard (URL-driven via /driver/:stage)
export default function DriverApp() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { stage: urlStage } = useParams();
  const [vehicle, setVehicle] = useState(null);
  const [loading, setLoading] = useState(true);
  const [unlocked, setUnlocked] = useState(false);

  // Only require pre-trip inspection in the morning (4 AM – 11 AM) using system time
  const hour = new Date().getHours();
  const isMorning = hour >= 4 && hour < 11;

  const stage = urlStage || "pin";

  useEffect(() => {
    const load = async () => {
      const vs = await base44.entities.Vehicle.filter({ driver_email: user.email });
      const v = vs[0] || null;
      setVehicle(v);
      setLoading(false);
    };
    load();
  }, []);

  if (loading) return <AppLayout><p className="text-muted-foreground">Loading…</p></AppLayout>;

  if (user && user.role !== "driver" && user.role !== "admin" && !vehicle)
    return <Navigate to="/" replace />;

  if (!vehicle) {
    return (
      <AppLayout title="Driver App">
        <div className="flex flex-col items-center py-20 text-center">
          <AlertCircle className="w-10 h-10 text-muted-foreground mb-3" />
          <p className="text-muted-foreground max-w-md">
            No vehicle is assigned to your account ({user.email}). Ask your company to assign your email to a vehicle.
          </p>
        </div>
      </AppLayout>
    );
  }

  const goStage = (s) => navigate("/driver/" + s);

  // Gate: PIN must be completed before any other stage
  if (!unlocked) {
    return (
      <AppLayout title="Driver App">
        <div className="space-y-4 max-w-3xl">
          <Greeting subtitle={vehicle.name} />
          <PinGate
            vehicle={vehicle}
            onUnlock={() => {
              setUnlocked(true);
              goStage(isMorning ? "inspection" : "track");
            }}
          />
        </div>
      </AppLayout>
    );
  }

  if (stage === "inspection") {
    return (
      <AppLayout title="Driver App">
        <div className="space-y-4 max-w-3xl">
          <Greeting subtitle={vehicle.name} />
          <PreTripInspection vehicle={vehicle} user={user} onCompleted={() => goStage("track")} />
        </div>
      </AppLayout>
    );
  }

  const tab = TRACKING_TABS.includes(stage) ? stage : "track";

  return (
    <AppLayout title="Driver App">
      <div className="space-y-4 max-w-3xl">
        <Greeting subtitle={vehicle.name} />

        <div className="flex justify-end">
          <Button asChild variant="outline" size="sm">
            <Link to="/kiosk/front-desk">
              <DoorOpen className="w-4 h-4 mr-1.5" />
              Front-desk kiosk
            </Link>
          </Button>
        </div>

        <Tabs value={tab} onValueChange={(v) => goStage(v)} className="w-full">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="track">Track</TabsTrigger>
            <TabsTrigger value="navigate">Navigate</TabsTrigger>
            <TabsTrigger value="messages">Messages</TabsTrigger>
            <TabsTrigger value="profile">Profile</TabsTrigger>
          </TabsList>
          <TabsContent value="track" className="mt-4 space-y-4">
            <DriverTrackingDashboard vehicle={vehicle} user={user} />
          </TabsContent>
          <TabsContent value="navigate" className="mt-4">
            <DriverNavMap vehicle={vehicle} />
          </TabsContent>
          <TabsContent value="messages" className="mt-4">
            <DriverMessages vehicle={vehicle} />
          </TabsContent>
          <TabsContent value="profile" className="mt-4">
            <ProfileInfo />
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
}