import useUserLocation from "@/hooks/useUserLocation";
import React, { Suspense, lazy, useState } from "react";
import { MapPin } from "lucide-react";
import { mapEngine, markFullMapFailed } from "@/lib/mapEngine";

// The map engine (mapbox-gl) is ~1.8 MB, so it loads in the background after
// the page around it has rendered, instead of holding the whole screen back.
const MapboxMapImpl = lazy(() => import("@/components/MapboxMapImpl"));
// Devices without WebGL 2 (common on budget tablets) get the basic map.
const LiteMap = lazy(() => import("@/components/LiteMap"));

export { statusColor } from "@/lib/vehicleStatus";

function MapPlaceholder() {
  return (
    <div className="w-full h-full min-h-[200px] grid place-items-center bg-muted/40 animate-pulse" role="status" aria-label="Loading map">
      <MapPin className="w-6 h-6 text-muted-foreground" />
    </div>
  );
}

export default function MapboxMap(props) {
  const { location } = useUserLocation(!props.userLocation && !props.center && !props.focusVehicleId);
  const mapProps = { ...props, userLocation: props.userLocation || (!props.center && !props.focusVehicleId ? location : null) };
  const [basic, setBasic] = useState(() => mapEngine() === "basic");
  return (
    <Suspense fallback={<MapPlaceholder />}>
      {basic ? (
        <LiteMap {...mapProps} />
      ) : (
        <MapboxMapImpl {...mapProps} onEngineFail={() => { markFullMapFailed(); setBasic(true); }} />
      )}
    </Suspense>
  );
}
