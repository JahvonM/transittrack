import React, { useEffect, useRef, useState } from "react";
import Map, { Marker, NavigationControl } from "react-map-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { MAPBOX_TOKEN, declutterStyle, mapStyleFor } from "@/lib/mapbox";
import { useIsDark } from "@/lib/useTheme";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Crosshair, LocateFixed, Maximize2, Minimize2 } from "lucide-react";
import PlaceSearch from "@/components/PlaceSearch";

/**
 * Tap-to-place / draggable-marker map for picking a GPS coordinate.
 * props: { lat, lng, onChange(lat, lng) }
 * Views: the street map, or satellite with street names (easier to find a
 * gate or a roadside spot). Zoom buttons, and a bigger map on request.
 */
const SATELLITE_STYLE = "mapbox://styles/mapbox/satellite-streets-v12";
const VIEWS = [["map", "Map"], ["satellite", "Satellite"]];
export default function LocationPicker({ lat, lng, onChange, onPlace, showCoordinates = true }) {
  const isDark = useIsDark();
  const [viewport, setViewport] = useState({
    longitude: lng ?? -61.7,
    latitude: lat ?? 12.05,
    zoom: 13,
  });

  const [view, setView] = useState("map");
  const mapRef = useRef(null);
  // Switching views swaps the whole style, and onLoad only fires once.
  useEffect(() => {
    const map = mapRef.current?.getMap?.();
    if (!map || view === "satellite") return;
    if (map.isStyleLoaded()) declutterStyle(map);
    else map.once("styledata", () => declutterStyle(map));
  }, [view, isDark]);
  const [big, setBig] = useState(false);
  const hasPoint = lat != null && lng != null && Number.isFinite(lat) && Number.isFinite(lng);
  const showPin = () => { if (hasPoint) setViewport((v) => ({ ...v, longitude: lng, latitude: lat, zoom: Math.max(v.zoom, 16) })); };

  const setPoint = (latitude, longitude) => onChange(latitude, longitude);

  const useMyLocation = () => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        setViewport((v) => ({ ...v, longitude, latitude, zoom: 15 }));
        onChange(latitude, longitude);
      },
      () => {}
    );
  };

  // Picking a search result moves the marker there, so a place can be found
  // by name instead of by tapping the map or typing coordinates.
  const choosePlace = (place) => {
    setViewport((v) => ({ ...v, longitude: place.lng, latitude: place.lat, zoom: 15 }));
    onChange(place.lat, place.lng);
    onPlace?.(place);
  };

  return (
    <div className="space-y-2">
      <PlaceSearch onSelect={choosePlace} proximity={hasPoint ? { lat, lng } : null} placeholder="Search a place by name" />
      <div className="flex flex-wrap items-center gap-2">
        <div role="group" aria-label="Map view" className="inline-flex rounded-lg border border-border p-0.5">
          {VIEWS.map(([id, label]) => (
            <button key={id} type="button" aria-pressed={view === id} onClick={() => setView(id)}
              className={`rounded-md px-3 py-1 text-sm font-medium ${view === id ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}>{label}</button>
          ))}
        </div>
        {hasPoint && <Button type="button" variant="outline" size="sm" onClick={showPin}><Crosshair className="w-4 h-4 mr-1" aria-hidden="true" />Show the pin</Button>}
        <Button type="button" variant="outline" size="sm" onClick={() => setBig((b) => !b)} aria-pressed={big}>
          {big ? <Minimize2 className="w-4 h-4 mr-1" aria-hidden="true" /> : <Maximize2 className="w-4 h-4 mr-1" aria-hidden="true" />}{big ? "Smaller map" : "Bigger map"}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">{hasPoint ? "Drag the pin, or tap the map to move it." : "Tap the map where they get picked up."}</p>
      <div data-vaul-no-drag className="rounded-lg overflow-hidden border border-border" style={{ height: big ? "min(65vh, 560px)" : 280 }}>
        <Map
          ref={mapRef}
          mapboxAccessToken={MAPBOX_TOKEN}
          mapStyle={view === "satellite" ? SATELLITE_STYLE : mapStyleFor(isDark)}
          {...viewport}
          onMove={(e) => setViewport(e.viewState)}
          onClick={(e) => setPoint(e.lngLat.lat, e.lngLat.lng)}
          style={{ width: "100%", height: "100%" }}
          attributionControl={false}
          onLoad={(e) => declutterStyle(e.target)}
        >
          <NavigationControl position="top-right" showCompass={false} />
          {hasPoint && (
            <Marker
              longitude={lng}
              latitude={lat}
              anchor="bottom"
              draggable
              onDragEnd={(e) => setPoint(e.lngLat.lat, e.lngLat.lng)}
            />
          )}
        </Map>
      </div>
      {showCoordinates && <div className="flex items-center gap-2">
        <Input
          type="number"
          step="any"
          value={lat ?? ""}
          onChange={(e) => onChange(parseFloat(e.target.value), lng)}
          placeholder="Latitude"
          aria-label="Latitude"
          className="h-8 text-xs"
        />
        <Input
          type="number"
          step="any"
          value={lng ?? ""}
          onChange={(e) => onChange(lat, parseFloat(e.target.value))}
          placeholder="Longitude"
          aria-label="Longitude"
          className="h-8 text-xs"
        />
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="h-8 w-8 shrink-0"
          onClick={useMyLocation}
          title="Use my location"
          aria-label="Use my location"
        >
          <LocateFixed className="w-4 h-4" />
        </Button>
      </div>}
      {!showCoordinates && <Button type="button" variant="outline" onClick={useMyLocation}><LocateFixed className="w-4 h-4 mr-2" />Use my location</Button>}
    </div>
  );
}