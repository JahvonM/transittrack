import React, { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import AppLayout from "@/components/AppLayout";
import LocationReplay from "@/components/replay/LocationReplay";

// Replays a vehicle's recorded path for a chosen day. The same replay is
// also under Admin → Live fleet → History.
export default function LocationTimeline() {
  const [vehicles, setVehicles] = useState([]);
  useEffect(() => {
    base44.entities.Vehicle.list("name", 500).then(setVehicles).catch(() => setVehicles([]));
  }, []);
  return (
    <AppLayout title="Location timeline">
      <LocationReplay vehicles={vehicles} />
    </AppLayout>
  );
}
