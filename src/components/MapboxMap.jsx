import React, { Suspense, lazy } from "react";
import { MapPin } from "lucide-react";

// The map engine (mapbox-gl) is ~1.8 MB, so it loads in the background after
// the page around it has rendered, instead of holding the whole screen back.
const MapboxMapImpl = lazy(() => import("@/components/MapboxMapImpl"));

export { statusColor } from "@/lib/vehicleStatus";

function MapPlaceholder() {
  return (
    <div className="w-full h-full min-h-[200px] grid place-items-center bg-muted/40 animate-pulse" role="status" aria-label="Loading map">
      <MapPin className="w-6 h-6 text-muted-foreground" />
    </div>
  );
}

export default function MapboxMap(props) {
  return (
    <Suspense fallback={<MapPlaceholder />}>
      <MapboxMapImpl {...props} />
    </Suspense>
  );
}
