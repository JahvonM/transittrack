import React, { useState, useEffect, useRef } from "react";
import { base44 } from "@/api/base44Client";
import MapboxMap from "@/components/MapboxMap";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Play, Pause, RotateCcw } from "lucide-react";

export default function RouteReplay({ vehicles }) {
  const [vehicleId, setVehicleId] = useState("");
  const [trail, setTrail] = useState([]);
  const [playing, setPlaying] = useState(false);
  const [step, setStep] = useState(0);
  const timer = useRef(null);

  const selected = vehicles.find((v) => v.id === vehicleId);

  useEffect(() => {
    if (selected?.trail) {
      setTrail(selected.trail);
      setStep(0);
    } else {
      setTrail([]);
    }
  }, [vehicleId, selected]);

  useEffect(() => {
    if (!playing || trail.length < 2) return;
    if (step >= trail.length - 1) {
      setPlaying(false);
      return;
    }
    timer.current = setTimeout(() => setStep((s) => s + 1), 800);
    return () => clearTimeout(timer.current);
  }, [playing, step, trail]);

  const replayTrail = trail.slice(0, step + 1);
  const currentPoint = trail[step];

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Route Replay</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <Select value={vehicleId} onValueChange={setVehicleId}>
          <SelectTrigger><SelectValue placeholder="Select a vehicle" /></SelectTrigger>
          <SelectContent>
            {vehicles.map((v) => (
              <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        {trail.length > 0 && (
          <>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" onClick={() => setPlaying((p) => !p)}>
                {playing ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                {playing ? "Pause" : "Play"}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => { setStep(0); setPlaying(false); }}>
                <RotateCcw className="w-4 h-4" />
              </Button>
              <span className="text-sm text-muted-foreground">
                {step + 1} / {trail.length}
                {currentPoint?.t && ` · ${new Date(currentPoint.t).toLocaleTimeString()}`}
              </span>
            </div>
            <div className="rounded-2xl overflow-hidden border">
              <MapboxMap
                vehicles={currentPoint ? [{
                  id: selected?.id || vehicleId,
                  name: selected?.name,
                  type: selected?.type,
                  status: selected?.status,
                  company_name: selected?.company_name,
                  current_lat: currentPoint.lat,
                  current_lng: currentPoint.lng,
                  trail: replayTrail,
                }] : []}
                center={currentPoint ? [currentPoint.lng, currentPoint.lat] : null}
                height="50vh"
                interactive={false}
              />
            </div>
          </>
        )}
        {vehicleId && trail.length === 0 && (
          <p className="text-sm text-muted-foreground py-6 text-center">No trail data for this vehicle yet.</p>
        )}
      </CardContent>
    </Card>
  );
}