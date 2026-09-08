import React, { useEffect, useMemo, useState } from "react";
import Map, { Marker } from "react-map-gl";
import { MAPBOX_TOKEN } from "@/lib/mapbox";
import { useAuth } from "@/lib/AuthContext";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Navigation, Bus, MapPin, Loader2 } from "lucide-react";

// Simulated test path the demo bus travels along.
const PATH = [
  { lng: -61.700, lat: 12.020 },
  { lng: -61.712, lat: 12.032 },
  { lng: -61.724, lat: 12.044 },
  { lng: -61.736, lat: 12.052 },
  { lng: -61.744, lat: 12.058 },
];
const DEST = { lng: -61.750, lat: 12.062, name: "Reviewer Test Stop" };

export default function ReviewerSandbox() {
  const { user } = useAuth();
  const [step, setStep] = useState(0);

  useEffect(() => {
    const id = setInterval(() => {
      setStep((s) => (s + 1) % PATH.length);
    }, 2000);
    return () => clearInterval(id);
  }, []);

  const pos = PATH[step];
  const navUrl = `https://www.google.com/maps?q=${DEST.lat},${DEST.lng}`;

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="h-14 border-b border-border flex items-center justify-between px-5">
        <div className="flex items-center gap-2 font-heading font-semibold">
          <Bus className="w-5 h-5 text-primary" />
          Driver Dashboard
        </div>
        <span className="text-xs px-2.5 py-1 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/30">
          Reviewer Sandbox
        </span>
      </header>

      <div className="relative flex-1">
        <Map
          mapboxAccessToken={MAPBOX_TOKEN}
          mapStyle="mapbox://styles/mapbox/streets-v12"
          initialViewState={{ longitude: pos.lng, latitude: pos.lat, zoom: 14 }}
          style={{ width: "100%", height: "100%" }}
          attributionControl={false}
        >
          <Marker longitude={pos.lng} latitude={pos.lat} anchor="bottom">
            <div className="w-9 h-9 rounded-full bg-primary border-2 border-white shadow-lg grid place-items-center">
              <Bus className="w-5 h-5 text-primary-foreground" />
            </div>
          </Marker>
          <Marker longitude={DEST.lng} latitude={DEST.lat} anchor="center">
            <div className="flex flex-col items-center">
              <div className="w-4 h-4 rounded-full bg-emerald-500 border-2 border-white shadow" />
            </div>
          </Marker>
        </Map>

        <div className="absolute top-4 left-4 right-4 z-10">
          <div className="rounded-2xl border border-border bg-card/95 backdrop-blur-md shadow-xl px-5 py-4">
            <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
              <MapPin className="w-3.5 h-3.5 text-primary" />
              Next pickup destination
            </div>
            <div className="text-lg font-semibold">{DEST.name}</div>
          </div>
        </div>

        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-10 w-[90%] max-w-md">
          <Button asChild size="lg" className="w-full h-14 text-base bg-emerald-500 hover:bg-emerald-600 text-white">
            <a href={navUrl} target="_blank" rel="noreferrer">
              <Navigation className="w-5 h-5 mr-2" />
              Open turn-by-turn navigation
            </a>
          </Button>
        </div>
      </div>
    </div>
  );
}