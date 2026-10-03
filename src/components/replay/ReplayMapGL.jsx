import React, { useEffect, useRef } from "react";
import Map, { Marker, Source, Layer } from "react-map-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { MAPBOX_TOKEN, mapStyleFor, mapAccentFor } from "@/lib/mapbox";
import { useIsDark } from "@/lib/useTheme";
import { ReplayBusIcon, StopPin } from "@/components/replay/ReplayMarkers";

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

function boundsOf(line) {
  let w = Infinity, s = Infinity, e = -Infinity, n = -Infinity;
  for (const [x, y] of line) { w = Math.min(w, x); e = Math.max(e, x); s = Math.min(s, y); n = Math.max(n, y); }
  return [[w, s], [e, n]];
}

// Full map engine version of the trip replay map.
export default function ReplayMapGL({ line, traveled, position, stops = [], follow, fitKey, onEngineFail }) {
  const isDark = useIsDark();
  const accent = mapAccentFor(isDark);
  const mapRef = useRef(null);

  useEffect(() => {
    const map = mapRef.current?.getMap?.();
    if (!map || !line?.length) return;
    if (line.length === 1) map.jumpTo({ center: line[0], zoom: 15 });
    else map.fitBounds(boundsOf(line), { padding: 48, duration: 0, maxZoom: 16 });
  }, [fitKey]);

  useEffect(() => {
    if (!follow || !position) return;
    mapRef.current?.getMap?.()?.jumpTo({ center: [position.lng, position.lat] });
  }, [follow, position]);

  const start = line?.[0];
  return (
    <Map
      ref={mapRef}
      mapboxAccessToken={MAPBOX_TOKEN}
      mapStyle={mapStyleFor(isDark)}
      initialViewState={start ? { longitude: start[0], latitude: start[1], zoom: 13 } : { longitude: 0, latitude: 0, zoom: 2 }}
      style={{ width: "100%", height: "100%" }}
      attributionControl={false}
      onLoad={(e) => {
        declutterStyle(e.target);
        if (line?.length > 1) e.target.fitBounds(boundsOf(line), { padding: 48, duration: 0, maxZoom: 16 });
      }}
      onError={(e) => { if (/webgl/i.test(String(e?.error?.message || ""))) onEngineFail?.(); }}
    >
      {line?.length > 1 && (
        <Source id="replay-full" type="geojson" data={{ type: "Feature", geometry: { type: "LineString", coordinates: line } }}>
          <Layer id="replay-full-line" type="line" layout={{ "line-cap": "round", "line-join": "round" }} paint={{ "line-color": isDark ? "#94a3b8" : "#64748b", "line-width": 4, "line-opacity": 0.45 }} />
        </Source>
      )}
      {traveled?.length > 1 && (
        <Source id="replay-done" type="geojson" data={{ type: "Feature", geometry: { type: "LineString", coordinates: traveled } }}>
          <Layer id="replay-done-line" type="line" layout={{ "line-cap": "round", "line-join": "round" }} paint={{ "line-color": accent, "line-width": 5 }} />
        </Source>
      )}
      {stops.map((s, i) => (
        <Marker key={`stop-${i}`} longitude={s.lng} latitude={s.lat} anchor="bottom">
          <StopPin stop={s} />
        </Marker>
      ))}
      {position && (
        <Marker longitude={position.lng} latitude={position.lat} anchor="center">
          <ReplayBusIcon heading={position.heading} color={accent} />
        </Marker>
      )}
    </Map>
  );
}
