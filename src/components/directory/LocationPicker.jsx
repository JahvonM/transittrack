import React, { useState } from "react";
import Map, { Marker } from "react-map-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { MAPBOX_TOKEN, mapStyleFor } from "@/lib/mapbox";
import { useIsDark } from "@/lib/useTheme";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { LocateFixed } from "lucide-react";

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

/**
 * Tap-to-place / draggable-marker map for picking a GPS coordinate.
 * props: { lat, lng, onChange(lat, lng) }
 */
export default function LocationPicker({ lat, lng, onChange }) {
  const isDark = useIsDark();
  const [viewport, setViewport] = useState({
    longitude: lng ?? -61.7,
    latitude: lat ?? 12.05,
    zoom: 13,
  });

  const hasPoint = lat != null && lng != null;

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

  return (
    <div className="space-y-2">
      <div className="rounded-lg overflow-hidden border border-border" style={{ height: 200 }}>
        <Map
          mapboxAccessToken={MAPBOX_TOKEN}
          mapStyle={mapStyleFor(isDark)}
          {...viewport}
          onMove={(e) => setViewport(e.viewState)}
          onClick={(e) => setPoint(e.lngLat.lat, e.lngLat.lng)}
          style={{ width: "100%", height: "100%" }}
          attributionControl={false}
          onLoad={(e) => declutterStyle(e.target)}
        >
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
      <div className="flex items-center gap-2">
        <Input
          type="number"
          step="any"
          value={lat ?? ""}
          onChange={(e) => onChange(parseFloat(e.target.value), lng)}
          placeholder="Latitude"
          className="h-8 text-xs"
        />
        <Input
          type="number"
          step="any"
          value={lng ?? ""}
          onChange={(e) => onChange(lat, parseFloat(e.target.value))}
          placeholder="Longitude"
          className="h-8 text-xs"
        />
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="h-8 w-8 shrink-0"
          onClick={useMyLocation}
          title="Use my location"
        >
          <LocateFixed className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}