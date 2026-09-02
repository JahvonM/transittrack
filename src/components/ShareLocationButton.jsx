import React, { useState } from "react";
import { Share2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";

export default function ShareLocationButton() {
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);

  const share = () => {
    if (!navigator.geolocation) {
      toast({ description: "Location isn't supported on this device." });
      return;
    }
    setBusy(true);
    navigator.geolocation.getCurrentPosition(
      (p) => {
        const link = `https://maps.google.com/?q=${p.coords.latitude},${p.coords.longitude}`;
        navigator.clipboard
          .writeText(link)
          .then(() => toast({ description: "Location link copied — paste it to share with anyone." }))
          .finally(() => setBusy(false));
      },
      () => {
        setBusy(false);
        toast({ description: "Couldn't get your location. Check location permissions." });
      }
    );
  };

  return (
    <Button variant="outline" size="sm" onClick={share} disabled={busy}>
      <Share2 className="w-4 h-4" />
      {busy ? "Locating…" : "Share my location"}
    </Button>
  );
}