f = "src/components/DriverTrips.jsx"
s = open(f).read()
start = s.index('import React, { useEffect, useState } from "react";')
end = s.index("  const todayStr = new Date().toDateString();")
head = '''import React, { useEffect, useState } from "react";
import { CheckCircle2, Clock, Flag, PenLine, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { useToast } from "@/components/ui/use-toast";
import TripSignatureDialog from "@/components/TripSignatureDialog";
import { STATUS_LABEL, STATUS_VARIANT } from "@/lib/trip";
import { blobToBase64 } from "@/lib/chatMedia";

const fmtDateTime = (iso) =>
  iso ? new Date(iso).toLocaleString([], { dateStyle: "medium", timeStyle: "short" }) : "—";

// Booked trips assigned to this tablet's vehicle. Drivers have no login, so
// every change goes through the driverSession backend via `invoke`.
export default function DriverTrips({ trips, invoke, startSharing, refresh }) {
  const { toast } = useToast();
  const [dialog, setDialog] = useState(null);
  const [localTrips, setLocalTrips] = useState(trips);

  // Keep local view in sync when the parent re-fetches
  useEffect(() => {
    setLocalTrips(trips);
  }, [trips]);

  const patchTrip = (id, patch) =>
    setLocalTrips((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)));

  const setStatus = async (trip, status, patch) => {
    const prev = { ...trip };
    patchTrip(trip.id, { status, ...patch });
    try {
      await invoke("update_trip_status", { trip_id: trip.id, status });
    } catch {
      patchTrip(trip.id, prev);
      toast({ title: "Couldn't update the trip", description: "Check the connection and try again.", variant: "destructive" });
    }
    refresh?.();
  };

  const startTrip = (trip) => {
    startSharing?.();
    return setStatus(trip, "on_the_way", { started_at: new Date().toISOString() });
  };

  const markArrived = (trip) => setStatus(trip, "arrived", { arrived_at: new Date().toISOString() });

  // Throws on failure so the dialog stays open and shows its error.
  const signTrip = async (file, signedBy) => {
    if (!dialog) return;
    const { trip, mode } = dialog;
    const data_base64 = await blobToBase64(file);
    const res = await invoke("sign_trip", { trip_id: trip.id, mode, data_base64, mime_type: file.type || "image/png", signed_by: signedBy });
    if (res?.trip) patchTrip(trip.id, res.trip);
    refresh?.();
  };

'''
s = s[:start] + head + s[end:]
s = s.replace('''        onSaved={saveSignature}
''', '''        onSign={signTrip}
''')
assert "saveSignature" not in s and "base44" not in s, "leftover"
open(f, "w").write(s)
print("ok")
