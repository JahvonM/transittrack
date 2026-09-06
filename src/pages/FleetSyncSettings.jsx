import React from "react";
import AppLayout from "@/components/AppLayout";
import FleetSyncTab from "@/components/admin/FleetSyncTab";
import { ShieldCheck } from "lucide-react";

export default function FleetSyncSettings() {
  return (
    <AppLayout title="Fleet sync settings">
      <div className="flex items-center gap-2 mb-4 text-sm text-muted-foreground">
        <ShieldCheck className="w-4 h-4 text-primary" />
        Connect TransitTrack to the maintenance app and trigger manual two-way sync of vehicles and inspections.
      </div>
      <FleetSyncTab />
    </AppLayout>
  );
}