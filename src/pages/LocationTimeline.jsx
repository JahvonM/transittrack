import React, { useEffect, useRef, useState } from "react";
import Map, { Marker, Source, Layer } from "react-map-gl";
import { base44 } from "@/api/base44Client";
import AppLayout from "@/components/AppLayout";
import { MAPBOX_TOKEN, MAPBOX_STYLE } from "@/lib/mapbox";
import { snapTrackToRoads } from "@/lib/geo";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Play, Pause, Bus } from "lucide-react";

// Matches the declutter treatment on every other map in the app: hide
// POI/transit icon clutter, keep road labels so the basemap still reads.
function declutterStyle(map) {
  const style = map.getStyle();
  if (!style || !style.layers) return;
  style.layers.forEach((layer) => {
    const id = layer.id || "";
    if (id.includes("poi") || id.includes("transit")) {
      try { map.setLayoutProperty(id, "visibility", "none"); } catch { /* some layers can't be toggled */ }
    }
  });
}

// Replays a vehicle's recorded path for a chosen day — location history is
// logged roughly once a minute (see driverSession's update_location), so a
// full day tops out around ~1,400 points, well within a single fetch.
export default function LocationTimeline() {
  const [vehicles, setVehicles] = useState([]);
  const [vehicleId, setVehicleId] = useState("");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [pings, setPings] = useState([]);
  const [loading, setLoading] = useState(false);
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [snappedLine, setSnappedLine] = useState(null);
  const [snapping, setSnapping] = useState(false);
  const playRef = useRef(null);

  useEffect(() => {
    base44.entities.Vehicle.list().then((v) => {
      setVehicles(v);
      if (v[0]) setVehicleId(v[0].id);
    });
  }, []);

  useEffect(() => {
    if (!vehicleId) return;
    setLoading(true);
    setIndex(0);
    setPlaying(false);
    base44.entities.LocationPing.filter({ vehicle_id: vehicleId }, "recorded_at", 3000)
      .then((all) => {
        const dayStart = new Date(`${date}T00:00:00`).getTime();
        const dayEnd = dayStart + 24 * 60 * 60 * 1000;
        const dayPings = all
          .filter((p) => {
            const t = new Date(p.recorded_at).getTime();
            return t >= dayStart && t < dayEnd;
          })
          .sort((a, b) => new Date(a.recorded_at) - new Date(b.recorded_at));
        setPings(dayPings);
      })
      .finally(() => setLoading(false));
  }, [vehicleId, date]);

  // Snap the day's recorded points onto actual roads instead of connecting
  // them with straight lines — also bridges any gaps left by offline periods
  // with the most plausible road path, rather than cutting straight across.
  useEffect(() => {
    setSnappedLine(null);
    if (pings.length < 2) return;
    let cancelled = false;
    setSnapping(true);
    snapTrackToRoads(pings.map((p) => ({ lat: p.lat, lng: p.lng }))).then((line) => {
      if (!cancelled) setSnappedLine(line);
    }).finally(() => { if (!cancelled) setSnapping(false); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pings]);

  useEffect(() => {
    if (!playing) {
      if (playRef.current) clearInterval(playRef.current);
      return;
    }
    playRef.current = setInterval(() => {
      setIndex((i) => {
        if (i >= pings.length - 1) {
          setPlaying(false);
          return i;
        }
        return i + 1;
      });
    }, 200);
    return () => clearInterval(playRef.current);
  }, [playing, pings.length]);

  const current = pings[index];
  const rawPathCoords = pings.map((p) => [p.lng, p.lat]);
  const pathCoords = snappedLine || rawPathCoords;
  // The snapped line has a different point count than the raw pings, so
  // "how far traveled" is tracked proportionally rather than by matching index.
  const traveledCount = snappedLine
    ? Math.max(2, Math.round(((index + 1) / pings.length) * snappedLine.length))
    : index + 1;
  const traveled = pathCoords.slice(0, traveledCount);

  return (
    <AppLayout title="Location timeline">
      <div className="space-y-3">
        <div className="flex gap-2 flex-wrap">
          <Select value={vehicleId} onValueChange={setVehicleId}>
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="Vehicle" />
            </SelectTrigger>
            <SelectContent>
              {vehicles.map((v) => (
                <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <input
            type="date"
            value={date}
            max={new Date().toISOString().slice(0, 10)}
            onChange={(e) => setDate(e.target.value)}
            className="border rounded-md px-3 py-2 text-sm bg-background border-border"
          />
        </div>

        {loading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : pings.length === 0 ? (
          <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">No location history for this vehicle on this day.</CardContent></Card>
        ) : (
          <>
            <div className="rounded-2xl overflow-hidden border h-[50vh] relative">
              <Map
                mapboxAccessToken={MAPBOX_TOKEN}
                mapStyle={MAPBOX_STYLE}
                initialViewState={{ longitude: pathCoords[0][0], latitude: pathCoords[0][1], zoom: 13 }}
                style={{ width: "100%", height: "100%" }}
                attributionControl={false}
                onLoad={(e) => declutterStyle(e.target)}
              >
                <Source id="full-path" type="geojson" data={{ type: "Feature", geometry: { type: "LineString", coordinates: pathCoords } }}>
                  <Layer id="full-path-line" type="line" paint={{ "line-color": "#64748b", "line-width": 3, "line-opacity": 0.4 }} />
                </Source>
                {traveled.length > 1 && (
                  <Source id="traveled-path" type="geojson" data={{ type: "Feature", geometry: { type: "LineString", coordinates: traveled } }}>
                    <Layer id="traveled-path-line" type="line" paint={{ "line-color": "#38bdf8", "line-width": 4 }} />
                  </Source>
                )}
                {current && (
                  <Marker longitude={current.lng} latitude={current.lat} anchor="center">
                    <div className="w-8 h-8 rounded-full bg-primary border-2 border-white shadow-lg grid place-items-center">
                      <Bus className="w-4 h-4 text-primary-foreground" />
                    </div>
                  </Marker>
                )}
              </Map>
              <div className="absolute top-3 left-3 bg-card/95 backdrop-blur border border-border rounded-lg px-3 py-2 text-xs shadow">
                {current ? new Date(current.recorded_at).toLocaleTimeString() : "—"}
                {current && <span className="ml-2 text-muted-foreground">{Math.round((current.speed || 0) * 3.6)} km/h</span>}
                {snapping && <span className="ml-2 text-muted-foreground">· snapping to roads…</span>}
              </div>
            </div>

            <Card>
              <CardContent className="py-3 space-y-2">
                <div className="flex items-center gap-3">
                  <Button size="icon" variant="outline" onClick={() => setPlaying((p) => !p)}>
                    {playing ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                  </Button>
                  <input
                    type="range"
                    min={0}
                    max={Math.max(0, pings.length - 1)}
                    value={index}
                    onChange={(e) => { setPlaying(false); setIndex(Number(e.target.value)); }}
                    className="flex-1"
                  />
                  <span className="text-xs text-muted-foreground w-24 text-right">{index + 1} / {pings.length}</span>
                </div>
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </AppLayout>
  );
}
