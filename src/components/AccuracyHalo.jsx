import React from "react";
import { Source, Layer } from "react-map-gl";
import { accuracyCircleGeoJSON } from "@/lib/geoCircle";

/**
 * A true-to-scale GPS accuracy halo (a real geographic circle, not a fixed
 * pixel-radius marker) — grows/shrinks correctly as you zoom, and its size
 * actually reflects the reported accuracy in meters.
 */
export default function AccuracyHalo({ lat, lng, accuracy, sourceId = "accuracy-halo", color = "#3b82f6" }) {
  if (lat == null || lng == null || !accuracy) return null;
  return (
    <Source id={sourceId} type="geojson" data={accuracyCircleGeoJSON(lat, lng, accuracy)}>
      <Layer
        id={`${sourceId}-fill`}
        type="fill"
        paint={{ "fill-color": color, "fill-opacity": 0.12 }}
      />
      <Layer
        id={`${sourceId}-outline`}
        type="line"
        paint={{ "line-color": color, "line-width": 1, "line-opacity": 0.35 }}
      />
    </Source>
  );
}
