import React, { useEffect, useMemo, useRef, useState } from "react";
import Map, { Layer, Marker, NavigationControl, Source } from "react-map-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { Maximize2, Minimize2, Scan } from "lucide-react";
import { MAPBOX_TOKEN, declutterStyle, mapStyleFor } from "@/lib/mapbox";
import { useIsDark } from "@/lib/useTheme";
import { Button } from "@/components/ui/button";
import { drawnRoad } from "@/lib/routeRoad";

// Sign-up day: everyone's pickup spots on one map, with each bus's route.
// Green: on a bus. Orange: has a spot but no bus yet. Tap a pin to open that
// person, the same as tapping their name in the list.

const SATELLITE_STYLE = "mapbox://styles/mapbox/satellite-streets-v12";
const ROUTE_COLOURS = ["#2563eb", "#9333ea", "#0891b2", "#db2777", "#65a30d", "#ea580c"];
const initials = (name) => String(name || "?").split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase();
const hasSpot = (p) => p.pickup_lat != null && p.pickup_lng != null && Number.isFinite(Number(p.pickup_lat)) && Number.isFinite(Number(p.pickup_lng));

// The box around every pin and route, for "Fit everyone".
export function boundsOf(points) {
  if (!points.length) return null;
  let w = Infinity, s = Infinity, e = -Infinity, n = -Infinity;
  for (const [lng, lat] of points) { w = Math.min(w, lng); e = Math.max(e, lng); s = Math.min(s, lat); n = Math.max(n, lat); }
  return [[w, s], [e, n]];
}

export default function SignupPeopleMap({ people = [], buses = [], onOpen }) {
  const isDark = useIsDark();
  const mapRef = useRef(null);
  const [view, setView] = useState("map");
  const [big, setBig] = useState(false);

  // Switching views swaps the whole style, and onLoad only fires once.
  useEffect(() => {
    const map = mapRef.current?.getMap?.();
    if (!map || view === "satellite") return;
    if (map.isStyleLoaded()) declutterStyle(map);
    else map.once("styledata", () => declutterStyle(map));
  }, [view, isDark]);

  const pinned = useMemo(() => people.filter(hasSpot), [people]);
  const routes = useMemo(() => {
    const seen = new Set();
    return buses.filter((b) => b.route && drawnRoad(b.route) && !seen.has(b.route.id) && seen.add(b.route.id))
      .map((b, i) => ({ id: b.route.id, name: b.route.name, bus: b.name, colour: ROUTE_COLOURS[i % ROUTE_COLOURS.length], coords: drawnRoad(b.route) }));
  }, [buses]);
  const box = useMemo(() => boundsOf([...pinned.map((p) => [Number(p.pickup_lng), Number(p.pickup_lat)]), ...routes.flatMap((r) => r.coords)]), [pinned, routes]);
  const fit = () => { const map = mapRef.current?.getMap?.(); if (map && box) map.fitBounds(box, { padding: 48, maxZoom: 15, duration: 600 }); };
  const missing = people.length - pinned.length;
  const noBus = pinned.filter((p) => !p.vehicle_id).length;

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <div role="group" aria-label="Map view" className="inline-flex rounded-lg border border-border p-0.5">
          {[["map", "Map"], ["satellite", "Satellite"]].map(([id, label]) => (
            <button key={id} type="button" aria-pressed={view === id} onClick={() => setView(id)}
              className={`rounded-md px-3 py-1 text-sm font-medium ${view === id ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}>{label}</button>
          ))}
        </div>
        <Button type="button" variant="outline" size="sm" onClick={fit} disabled={!box}><Scan className="mr-1 h-4 w-4" aria-hidden="true" />Fit everyone</Button>
        <Button type="button" variant="outline" size="sm" aria-pressed={big} onClick={() => setBig((b) => !b)}>
          {big ? <Minimize2 className="mr-1 h-4 w-4" aria-hidden="true" /> : <Maximize2 className="mr-1 h-4 w-4" aria-hidden="true" />}{big ? "Smaller map" : "Bigger map"}
        </Button>
      </div>
      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-body-sm text-muted-foreground" aria-label="Map key">
        <li className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-full bg-success" aria-hidden="true" />On a bus</li>
        <li className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-full bg-warning" aria-hidden="true" />Needs a bus ({noBus})</li>
        {routes.map((r) => <li key={r.id} className="flex items-center gap-1.5"><span className="h-1 w-4 rounded" style={{ background: r.colour }} aria-hidden="true" />{r.name}{r.bus ? ` (${r.bus})` : ""}</li>)}
      </ul>
      <div data-vaul-no-drag className="overflow-hidden rounded-xl border border-border" style={{ height: big ? "min(75vh, 720px)" : 380 }}>
        <Map
          ref={mapRef}
          mapboxAccessToken={MAPBOX_TOKEN}
          mapStyle={view === "satellite" ? SATELLITE_STYLE : mapStyleFor(isDark)}
          initialViewState={box ? { bounds: box, fitBoundsOptions: { padding: 48, maxZoom: 15 } } : { longitude: -61.7, latitude: 12.05, zoom: 11 }}
          style={{ width: "100%", height: "100%" }}
          attributionControl={false}
          onLoad={(e) => { if (view !== "satellite") declutterStyle(e.target); }}
        >
          <NavigationControl position="top-right" showCompass={false} />
          {routes.map((r) => (
            <Source key={r.id} id={`signup-route-${r.id}`} type="geojson" data={{ type: "Feature", geometry: { type: "LineString", coordinates: r.coords } }}>
              <Layer id={`signup-route-line-${r.id}`} type="line" layout={{ "line-cap": "round", "line-join": "round" }} paint={{ "line-color": r.colour, "line-width": 4, "line-opacity": 0.8 }} />
            </Source>
          ))}
          {pinned.map((p) => (
            <Marker key={p.ref} longitude={Number(p.pickup_lng)} latitude={Number(p.pickup_lat)} anchor="bottom">
              <button type="button" onClick={() => onOpen(p.ref)} aria-label={`${p.name}: ${p.pickup_name || "pickup spot"}${p.bus ? `, rides ${p.bus}` : ", needs a bus"}`} title={`${p.name}${p.bus ? ` · ${p.bus}` : " · needs a bus"}`}
                className={`grid h-8 min-w-8 place-items-center rounded-full border-2 border-white px-1 text-xs font-bold text-white shadow-md ${p.vehicle_id ? "bg-success" : "bg-warning"}`}>
                {initials(p.name)}
              </button>
            </Marker>
          ))}
        </Map>
      </div>
      {missing > 0 && <p className="text-body-sm text-muted-foreground">{missing} {missing === 1 ? "person has" : "people have"} no pickup spot yet, so {missing === 1 ? "isn't" : "aren't"} on the map.</p>}
    </div>
  );
}
