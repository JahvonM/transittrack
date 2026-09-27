import React, { useEffect, useMemo, useRef, useState } from "react";
import Map, { Marker, Source, Layer } from "react-map-gl";
import { MAPBOX_TOKEN, mapStyleFor, mapAccentFor } from "@/lib/mapbox";
import { useIsDark } from "@/lib/useTheme";
import { Button } from "@/components/ui/button";
import { Navigation, Bus, MapPin, Flag } from "lucide-react";

// Simulated test path the demo bus travels along.
const PATH = [
  { lng: -61.700, lat: 12.020 },
  { lng: -61.712, lat: 12.032 },
  { lng: -61.724, lat: 12.044 },
  { lng: -61.736, lat: 12.052 },
  { lng: -61.744, lat: 12.058 },
];
const DEST = { lng: -61.750, lat: 12.062, name: "Reviewer Test Stop" };
const STEP_MS = 2200;

function lerp(a, b, t) {
  return a + (b - a) * t;
}

export default function ReviewerSandbox() {
  const isDark = useIsDark();
  const accent = mapAccentFor(isDark);
  const [step, setStep] = useState(0);
  const [displayPos, setDisplayPos] = useState(PATH[0]);
  const raf = useRef(null);

  // Advance the target waypoint on a cadence.
  useEffect(() => {
    const id = setInterval(() => {
      setStep((s) => (s + 1) % PATH.length);
    }, STEP_MS);
    return () => clearInterval(id);
  }, []);

  // Smoothly glide the displayed position toward the current target waypoint.
  useEffect(() => {
    const target = PATH[step];
    const loop = () => {
      setDisplayPos((prev) => ({
        lng: lerp(prev.lng, target.lng, 0.06),
        lat: lerp(prev.lat, target.lat, 0.06),
      }));
      raf.current = requestAnimationFrame(loop);
    };
    raf.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf.current);
  }, [step]);

  const trailCoords = useMemo(
    () => PATH.slice(0, step + 1).map((p) => [p.lng, p.lat]),
    [step]
  );

  const navUrl = `https://www.google.com/maps?q=${DEST.lat},${DEST.lng}`;
  const progress = Math.round(((step + 1) / PATH.length) * 100);

  return (
    <div className="h-screen bg-background flex flex-col">
      <header className="h-14 border-b border-border flex items-center justify-between px-5 safe-area-top">
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
          mapStyle={mapStyleFor(isDark)}
          initialViewState={{
            longitude: (PATH[0].lng + DEST.lng) / 2,
            latitude: (PATH[0].lat + DEST.lat) / 2,
            zoom: 13,
          }}
          style={{ width: "100%", height: "100%" }}
          attributionControl={false}
          onLoad={(e) => {
            const map = e.target;
            map.getStyle()?.layers?.forEach((layer) => {
              const id = layer.id || "";
              if (id.includes("poi") || id.includes("transit")) {
                try {
                  map.setLayoutProperty(id, "visibility", "none");
                } catch {
                  /* skip */
                }
              }
            });
          }}
        >
          {trailCoords.length > 1 && (
            <Source
              id="demo-trail"
              type="geojson"
              data={{ type: "Feature", geometry: { type: "LineString", coordinates: trailCoords } }}
            >
              <Layer
                id="demo-trail-line"
                type="line"
                paint={{ "line-color": accent, "line-width": 4, "line-opacity": 0.6 }}
              />
            </Source>
          )}

          <Marker longitude={displayPos.lng} latitude={displayPos.lat} anchor="bottom">
            <div className="flex flex-col items-center relative">
              <div className="absolute top-0 w-11 h-11 rounded-full bg-green-500/25 animate-ping" />
              <div className="w-11 h-11 rounded-xl grid place-items-center" style={{ backgroundColor: "#1C1C1F", border: `2px solid ${accent}`, boxShadow: `0 0 0 5px ${accent}2E, 0 6px 14px rgba(0,0,0,0.55)` }}>
                <Bus className="w-5 h-5" style={{ color: accent }} />
              </div>
              <div className="w-3 h-3 -mt-[6px]" style={{ backgroundColor: accent, clipPath: "polygon(50% 100%, 0 0, 100% 0)" }} />
            </div>
          </Marker>

          <Marker longitude={DEST.lng} latitude={DEST.lat} anchor="bottom">
            <div className="flex flex-col items-center">
              <div className="w-8 h-8 rounded-full bg-emerald-500/20 border-2 border-emerald-500 grid place-items-center shadow">
                <Flag className="w-4 h-4 text-emerald-400" />
              </div>
              <div className="mt-1 px-2 py-0.5 rounded-full bg-card/95 border border-border text-[10px] font-medium whitespace-nowrap">
                {DEST.name}
              </div>
            </div>
          </Marker>
        </Map>

        <div className="absolute top-4 left-4 right-4 z-10">
          <div className="rounded-2xl border border-border bg-card/95 backdrop-blur-md shadow-xl px-5 py-4">
            <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
              <MapPin className="w-3.5 h-3.5 text-primary" />
              Next pickup destination
            </div>
            <div className="flex items-center justify-between gap-3">
              <div className="text-lg font-semibold">{DEST.name}</div>
              <div className="text-xs text-muted-foreground">{progress}% complete</div>
            </div>
            <div className="mt-2 h-1.5 rounded-full bg-muted overflow-hidden">
              <div
                className="h-full bg-primary transition-all duration-500"
                style={{ width: `${progress}%` }}
              />
            </div>
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