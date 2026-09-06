import React, { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import AppLayout from "@/components/AppLayout";
import PinGate from "@/components/driver/PinGate";
import PreTripInspection from "@/components/driver/PreTripInspection";
import DriverTrackingDashboard from "@/components/driver/DriverTrackingDashboard";
import DriverMessages from "@/components/DriverMessages";
import Greeting from "@/components/Greeting";
import ProfileInfo from "@/components/ProfileInfo";
import { AlertCircle } from "lucide-react";

// Flow: pin gate → inspection → tracking dashboard
export default function DriverApp() {
  const { user } = useAuth();
  const [vehicle, setVehicle] = useState(null);
  const [loading, setLoading] = useState(true);
  const [stage, setStage] = useState("pin"); // pin | inspection | tracking

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

  return (
    <AppLayout title="Driver App">
      <div className="space-y-4 max-w-3xl">
        <DriverMessages />
        <Greeting subtitle={vehicle.name} />

        {stage === "pin" && (
          <PinGate vehicle={vehicle} onUnlock={() => setStage("inspection")} />
        )}

        {stage === "inspection" && (
          <PreTripInspection
            vehicle={vehicle}
            user={user}
            onCompleted={() => setStage("tracking")}
          />
        )}

        {stage === "tracking" && (
          <DriverTrackingDashboard vehicle={vehicle} user={user} />
        )}

        {stage === "tracking" && <ProfileInfo />}
      </div>
    </AppLayout>
  );
}