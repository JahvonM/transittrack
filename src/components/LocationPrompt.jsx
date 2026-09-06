import React, { useState } from "react";
import { LocateFixed } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

const ERRORS = {
  1: "Location permission was denied. Enable location access in your browser settings to see arrival times to your spot.",
  2: "Your position is unavailable right now. Check your GPS or network and try again.",
  3: "Location request timed out. Make sure GPS is on and try again.",
};

/**
 * Explicit GPS permission prompt card.
 * Shown when location is unknown. Triggers a high-accuracy
 * getCurrentPosition and reports clear, distinct errors with a retry.
 */
export default function LocationPrompt({ onLocation }) {
  const [requesting, setRequesting] = useState(false);
  const [error, setError] = useState("");
  const [unsupported, setUnsupported] = useState(false);

  const request = () => {
    if (!navigator.geolocation) {
      setUnsupported(true);
      setError("Your device doesn't support location. Use the route explorer to pick a stop instead.");
      return;
    }
    setRequesting(true);
    setError("");
    navigator.geolocation.getCurrentPosition(
      (p) => {
        onLocation({ lat: p.coords.latitude, lng: p.coords.longitude });
        setRequesting(false);
      },
      (err) => {
        setError(ERRORS[err.code] || "Couldn't get your location. Please try again.");
        setRequesting(false);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  };

  return (
    <Card className="border-primary/30 bg-primary/5">
      <CardContent className="flex items-center gap-3 p-4">
        <div className="w-10 h-10 rounded-lg bg-primary/10 grid place-items-center shrink-0">
          <LocateFixed className="w-5 h-5 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium">Enable your location</p>
          <p className="text-xs text-muted-foreground">
            {error || "We need your GPS to show arrival times to your exact spot."}
          </p>
        </div>
        <Button size="sm" onClick={request} disabled={requesting || unsupported}>
          <LocateFixed className="w-4 h-4" />
          {requesting ? "Locating…" : "Allow location"}
        </Button>
        {error && !requesting && !unsupported && (
          <Button size="sm" variant="ghost" onClick={request} className="px-2">
            Retry
          </Button>
        )}
      </CardContent>
    </Card>
  );
}