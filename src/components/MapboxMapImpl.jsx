import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import Map, { Marker, Source, Layer } from "react-map-gl";
import { MAPBOX_TOKEN, mapStyleFor, mapAccentFor } from "@/lib/mapbox";
import { applyMapPerspective } from "@/lib/mapPerspective";
import { useIsDark } from "@/lib/useTheme";
import { Bus, LocateFixed, Maximize2, Minimize2, Minus, Plus, Satellite, X, Car } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Image } from "@/components/ui/image";
import BusDistance from "@/components/BusDistance";
import VehicleMarker from "@/components/VehicleMarker";
import AccuracyHalo from "@/components/AccuracyHalo";
import { fetchDrivingRoute, snapTrackToRoads } from "@/lib/geo";
import { statusColor } from "@/lib/vehicleStatus";

const TOOL_BTN = "w-9 h-9 rounded-full bg-background/90 border border-border shadow-md grid place-items-center hover:bg-accent transition-colors";

// Re-exported for backwards compatibility — the canonical definition now lives
// in lib/vehicleStatus so VehicleMarker can use it without importing this file.
export { statusColor };

const VEHICLE_ICON = (type) =>
  type === "taxi"
    ? <Car className="inline w-4 h-4 -mt-0.5" aria-hidden="true" />
    : <Bus className="inline w-4 h-4 -mt-0.5" aria-hidden="true" />;

// Hides busy default-style clutter (POI icons, transit icons) so the map reads
// cleaner — road labels stay on, since without them the basemap goes blank
// and unreadable wherever there's no live vehicle/stop data yet.
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
 * Reusable Mapbox streets map.
 * props:
 *  - vehicles: [{ current_lat, current_lng, status, name, type, trail }]
 *  - stops: [{ name, lat, lng }] (optional) — route stop markers
 *  - userLocation: { lat, lng } (optional) — user position marker
 *  - center: [lng, lat] | null  (auto-fit if omitted)
 *  - className, height
 */
export default function MapboxMap({
  vehicles = [],
  stops = [],
  userLocation = null,
  center = null,
  className = "",
  height = "45vh",
  interactive = true,
  immersive = false,
  // Opt-in nav-mode camera follow (like CarPlay/Google Maps): the camera
  // keeps recentering on userLocation as it updates, instead of only
  // fitting bounds once at load. Off by default — a passenger or admin
  // looking at the fleet doesn't want the camera yanked back to their own
  // position every time it updates; a driver looking at their own live
  // position does. Dragging the map turns it off until recenter is tapped.
  followUser = false,
  // Arbitrary standalone point markers (e.g. staff pickup locations) —
  // unlike `stops`, these do NOT get connected by a route line.
  pins = [],
  // Called if the map engine can't start on this device (no WebGL), so the
  // wrapper can swap in the basic map.
  onEngineFail,
  // Fly to and open this vehicle (e.g. picked from a list beside the map).
  // focusKey changes on every pick, so picking the same bus again re-centers.
  focusVehicleId = null,
  focusKey = 0,
}) {
  const mapRef = useRef(null);
  const hasFitted = useRef(false);
  const hasUserCentered = useRef(false);
  const following = useRef(followUser);
  const [isFollowing, setIsFollowing] = useState(followUser);
  const [selectedVehicle, setSelectedVehicle] = useState(null);
  const [isSatellite, setIsSatellite] = useState(immersive);
  const [is3D, setIs3D] = useState(immersive);
  const [cameraBearing, setCameraBearing] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [mapLoaded, setMapLoaded] = useState(false);
  const isDark = useIsDark();
  const accent = mapAccentFor(isDark);

  const currentUserLocation = userLocation;

  // Build the full point list for auto-fit bounds
  const allPoints = [
    ...vehicles
      .filter((v) => v.current_lat != null)
      .map((v) => ({ lng: v.current_lng, lat: v.current_lat, color: statusColor(v.status), label: v.name })),
    ...(stops || [])
      .filter((s) => s.lat != null)
      .map((s) => ({ lng: s.lng, lat: s.lat, color: accent, label: s.name })),
    ...(pins || [])
      .filter((p) => p.lat != null && p.lng != null)
      .map((p) => ({ lng: p.lng, lat: p.lat, color: p.color || "#34d399", label: p.label })),
  ];
  if (currentUserLocation) allPoints.push({ lng: currentUserLocation.lng, lat: currentUserLocation.lat, color: "#34d399", label: "You are here" });

  // Re-fit the map to all visible points (vehicles, stops, user).
  const fitToBounds = () => {
    const map = mapRef.current;
    if (!map) return;
    const pts = [...allPoints];
    if (pts.length === 0) return;
    const bounds = pts.reduce(
      (b, p) => b.extend([p.lng, p.lat]),
      new mapboxgl.LngLatBounds([pts[0].lng, pts[0].lat], [pts[0].lng, pts[0].lat])
    );
    map.fitBounds(bounds, { padding: 60, maxZoom: 15, duration: 600 });
  };

  // Fit to bounds only once on first load — re-fitting on every GPS tick causes jitter.
  // Skipped entirely in followUser (nav) mode: that mode has its own dedicated
  // centering below, and letting this generic "fit every point" logic run first
  // (it includes unrelated pins/stops too) was racing with it and could leave
  // the camera zoomed out to fit everything instead of tight on the driver.
  useEffect(() => {
    if (!mapLoaded || center || followUser || hasFitted.current || hasUserCentered.current) return;
    if (allPoints.length === 0) return;
    fitToBounds();
    hasFitted.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapLoaded, allPoints.length, center, followUser]);

  // A vehicle picked outside the map: fly to it and show its details.
  useEffect(() => {
    const map = mapRef.current;
    if (!mapLoaded || !map || !focusVehicleId) return;
    const v = vehicles.find((x) => x.id === focusVehicleId);
    if (!v || v.current_lat == null) return;
    hasFitted.current = true;
    hasUserCentered.current = true;
    setSelectedVehicle(v);
    map.flyTo({ center: [v.current_lng, v.current_lat], zoom: Math.max(map.getZoom(), 15.5), duration: 900 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapLoaded, focusVehicleId, focusKey]);

  // Once the user's position is known, fly to it so the map centers on them.
  // Also skipped in followUser mode — same reasoning as above.
  useEffect(() => {
    if (!mapLoaded || followUser || !currentUserLocation || hasUserCentered.current) return;
    const map = mapRef.current;
    if (!map) return;
    hasUserCentered.current = true;
    map.flyTo({ center: [currentUserLocation.lng, currentUserLocation.lat], zoom: 15, duration: 800 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapLoaded, currentUserLocation, followUser]);

  // Nav-mode follow: recenters automatically the moment a position is known
  // (first tick uses flyTo with a proper zoom-in; every tick after that just
  // eases the center over, preserving whatever zoom the driver is on) and
  // keeps doing so on every update while following is on.
  const followEngagedRef = useRef(false);
  useEffect(() => {
    const map = mapRef.current;
    // Wait for the map to actually finish loading before issuing the first
    // flyTo. Without this, an early flyTo call (before mapbox-gl finishes
    // applying its own initialViewState) could get silently clobbered by
    // that internal setup running afterward — which looked exactly like
    // "auto-recenter doesn't work on open": the effect fired, but the map
    // settled back on its default startup view a moment later anyway.
    if (!mapLoaded || !followUser || !map || !currentUserLocation || !following.current) return;
    if (!followEngagedRef.current) {
      followEngagedRef.current = true;
      map.flyTo({ center: [currentUserLocation.lng, currentUserLocation.lat], zoom: Math.max(map.getZoom(), 15), duration: 600 });
    } else {
      map.easeTo({ center: [currentUserLocation.lng, currentUserLocation.lat], duration: 900 });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapLoaded, followUser, currentUserLocation?.lat, currentUserLocation?.lng]);

  // Recenter on the user's live location — always (re-)engages follow and
  // flies back, whether following was already on or dragging turned it off.
  // (A tap-to-toggle-off variant was tried here but caused the button to
  // switch follow OFF if tapped while already auto-following, which read as
  // "recenter stopped working" since follow is on by default. Dragging the
  // map remains the only way to disengage it.)
  const recenter = () => {
    const map = mapRef.current;
    if (!map) return;
    const loc = currentUserLocation;
    if (!loc) return;
    following.current = true;
    setIsFollowing(true);
    followEngagedRef.current = true;
    map.flyTo({ center: [loc.lng, loc.lat], zoom: Math.max(map.getZoom(), 15), duration: 800 });
  };

  // Re-apply decluttering after switching street ↔ satellite or light ↔ dark —
  // changing mapStyle swaps the whole style, and onLoad only fires once.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || isSatellite) return;
    if (map.isStyleLoaded && map.isStyleLoaded()) declutterStyle(map);
    else map.once("styledata", () => declutterStyle(map));
  }, [isSatellite, isDark]);

  useEffect(() => {
    const map = mapRef.current?.getMap?.();
    if (!map) return;
    const apply = () => { declutterStyle(map); applyMapPerspective(map, is3D, isDark); };
    apply();
    map.on("style.load", apply);
    map.easeTo({pitch:is3D ? 50 : 0,duration:600});
    return () => map.off("style.load", apply);
  }, [is3D, isDark, isSatellite, mapLoaded]);

  const initViewport = center
    ? { longitude: center[0], latitude: center[1], zoom: 14, pitch: immersive ? 50 : 0 }
    : { longitude: -61.7, latitude: 12.05, zoom: 12.5, pitch: immersive ? 50 : 0 };

  // Route polyline from stops (if any) — straight-line fallback, used until/unless
  // the actual driving route (following roads) below is available.
  const routeCoords =
    stops && stops.length > 1 ? stops.filter((s) => s.lat != null).map((s) => [s.lng, s.lat]) : [];

  // Fetch the real driving route through the stops (roads, not a straight line).
  // Keyed on a stable signature so it only refetches when the stops actually change.
  const routeStopsSignature = routeCoords.map((c) => c.join(",")).join(";");
  const [drivingRouteGeom, setDrivingRouteGeom] = useState(null);

  useEffect(() => {
    let cancelled = false;
    if (routeCoords.length < 2) {
      setDrivingRouteGeom(null);
      return;
    }
    fetchDrivingRoute(routeCoords.map(([lng, lat]) => ({ lat, lng }))).then((res) => {
      if (!cancelled) setDrivingRouteGeom(res?.geometry || null);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeStopsSignature]);

  const routeLineCoords = drivingRouteGeom || routeCoords;
  const routeFollowsRoads = Boolean(drivingRouteGeom);

  // Per-vehicle trails — snapped onto actual roads in the background so the
  // line follows streets instead of cutting straight between GPS points.
  // Kept "simple": render the raw straight-line trail immediately (so nothing
  // ever looks missing), then swap in the snapped version once it resolves,
  // and only re-snap every few new points rather than on every GPS tick.
  const [snappedTrails, setSnappedTrails] = useState({});
  const snappedLenRef = useRef({});
  const trailSignature = vehicles.map((v) => `${v.id}:${v.trail?.length || 0}`).join(",");

  useEffect(() => {
    vehicles.forEach((v) => {
      if (!v.trail || v.trail.length < 2) return;
      const lastLen = snappedLenRef.current[v.id] || 0;
      if (lastLen !== 0 && v.trail.length - lastLen < 5) return;
      snappedLenRef.current[v.id] = v.trail.length;
      const pts = v.trail.filter((p) => p.lat != null && p.lng != null);
      snapTrackToRoads(pts).then((line) => {
        setSnappedTrails((prev) => ({ ...prev, [v.id]: line }));
      });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trailSignature]);

  const vehicleTrails = vehicles
    .filter((v) => v.trail && v.trail.length > 1)
    .map((v) => ({
      id: `trail-${v.id}`,
      coords: snappedTrails[v.id] || v.trail.filter((p) => p.lat != null && p.lng != null).map((p) => [p.lng, p.lat]),
    }))
    .filter((t) => t.coords.length > 1);

  const mapContent = (
    <>
      <Map
        ref={mapRef}
        mapboxAccessToken={MAPBOX_TOKEN}
        mapStyle={isSatellite ? "mapbox://styles/mapbox/satellite-streets-v12" : mapStyleFor(isDark)}
        initialViewState={initViewport}
        style={{ width: "100%", height: "100%" }}
        interactive={interactive}
        attributionControl={false}
        onLoad={(e) => { setMapLoaded(true); declutterStyle(e.target); applyMapPerspective(e.target, is3D, isDark); }}
        onRotate={(e) => setCameraBearing(e.viewState.bearing)}
        onError={(e) => { if (/webgl/i.test(e?.error?.message || "")) onEngineFail?.(); }}
        onClick={() => setSelectedVehicle(null)}
        onDrag={followUser ? () => { following.current = false; setIsFollowing(false); } : undefined}
      >
        {/* Route polyline — follows actual roads once the driving route loads;
            falls back to a dashed straight line between stops until then / on failure */}
        {routeLineCoords.length > 1 && (
          <Source id="route" type="geojson" data={{ type: "Feature", geometry: { type: "LineString", coordinates: routeLineCoords } }}>
            <Layer
              id="route-line"
              type="line"
              paint={
                routeFollowsRoads
                  ? { "line-color": accent, "line-width": 4, "line-opacity": 0.9 }
                  : { "line-color": accent, "line-width": 3, "line-opacity": 0.7, "line-dasharray": [2, 2] }
              }
            />
          </Source>
        )}

        {/* Per-vehicle trails */}
        {vehicleTrails.map((t) => (
          <Source
            key={t.id}
            id={t.id}
            type="geojson"
            data={{ type: "Feature", geometry: { type: "LineString", coordinates: t.coords } }}
          >
            <Layer
              id={`${t.id}-line`}
              type="line"
              paint={{ "line-color": accent, "line-width": 3, "line-opacity": 0.4 }}
            />
          </Source>
        ))}

        {/* Standalone pins (e.g. staff pickup locations) — no route line between them */}
        {(pins || []).filter((p) => p.lat != null && p.lng != null).map((p, i) => (
          <Marker key={`pin-${i}`} longitude={p.lng} latitude={p.lat} anchor="center">
            <div
              className="w-3.5 h-3.5 rounded-full border-2 border-white shadow"
              style={{ backgroundColor: p.color || "#34d399" }}
              title={p.label}
            />
          </Marker>
        ))}

        {/* Route stop markers */}
        {(stops || []).filter((s) => s.lat != null).map((s, i) => (
          <Marker key={`stop-${i}`} longitude={s.lng} latitude={s.lat} anchor="center">
            <div
              className="w-4 h-4 rounded-full border-[2.5px] shadow-md"
              style={{ backgroundColor: accent, borderColor: "#0B0B0D" }}
              title={s.name}
            />
          </Marker>
        ))}

        {/* Vehicle markers — tappable little bus icons, gliding smoothly between GPS pings */}
        {vehicles
          .filter((v) => v.current_lat != null)
          .map((v) => (
            <VehicleMarker key={`v-${v.id}`} vehicle={v} cameraBearing={cameraBearing} onSelect={setSelectedVehicle} />
          ))}

        {/* (selected vehicle panel rendered as overlay below to keep the map visible) */}

        {/* User location — true-to-scale accuracy halo + pulsing blue dot */}
        {currentUserLocation && (
          <>
            <AccuracyHalo
              sourceId="user-accuracy"
              lat={currentUserLocation.lat}
              lng={currentUserLocation.lng}
              accuracy={currentUserLocation.accuracy}
              color={accent}
            />
            <Marker key="user-loc" longitude={currentUserLocation.lng} latitude={currentUserLocation.lat} anchor="center">
              <div className="relative">
                <div className="absolute inset-0 w-4 h-4 rounded-full animate-ping opacity-50" style={{ backgroundColor: accent }} />
                <div className="relative w-4 h-4 rounded-full border-[3px] shadow-lg" style={{ backgroundColor: accent, borderColor: "#0B0B0D" }} />
              </div>
            </Marker>
          </>
        )}

      </Map>

      {/* Empty state — shown instead of a bare basemap when nothing is live to plot yet */}
      {mapLoaded && allPoints.length === 0 && (
        <div className="absolute inset-x-0 top-4 z-10 flex justify-center pointer-events-none">
          <div className="px-4 py-2 rounded-full border border-border bg-card/95 backdrop-blur-md shadow-md text-xs font-medium text-muted-foreground">
            No vehicles online right now
          </div>
        </div>
      )}

      {/* Selected vehicle details — floating panel keeps the map fully visible & interactive */}
      {selectedVehicle && (
        <div className="absolute left-1/2 -translate-x-1/2 bottom-16 z-20 w-[280px] max-w-[92%]">
          <div className="rounded-2xl border border-border bg-card/95 backdrop-blur-md shadow-2xl overflow-hidden">
            <div className="relative flex items-center gap-3 px-4 pt-4">
              <div
                className="w-14 h-14 rounded-2xl grid place-items-center shrink-0 overflow-hidden"
                style={{ backgroundColor: "#1C1C1F", border: `2px solid ${statusColor(selectedVehicle.status)}`, boxShadow: "0 2px 8px rgba(0,0,0,0.3)" }}
              >
                {selectedVehicle.image_url ? (
                  <Image src={selectedVehicle.image_url} alt={selectedVehicle.name} fittingType="fill" className="w-full h-full" />
                ) : (
                  <Bus className="w-6 h-6" style={{ color: statusColor(selectedVehicle.status) }} />
                )}
              </div>
              <div className="min-w-0">
                <div className="font-semibold text-sm leading-tight truncate">{selectedVehicle.name}</div>
                <div className="text-xs text-muted-foreground truncate">{selectedVehicle.company_name || ""}</div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedVehicle(null)}
                className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full bg-black/10 hover:bg-black/20 grid place-items-center text-foreground/70 transition-colors"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
            <div className="p-3 pt-2 space-y-2">
              <div className="flex items-center gap-2">
                <Badge variant="secondary" className="text-sm gap-1">
                  <span className="inline-block w-1.5 h-1.5 rounded-full" style={{ backgroundColor: statusColor(selectedVehicle.status) }} />
                  {selectedVehicle.status}
                </Badge>
                <span className="text-sm text-muted-foreground">{VEHICLE_ICON(selectedVehicle.type)} {selectedVehicle.type}</span>
              </div>
              <div className="grid grid-cols-2 gap-1.5 text-sm">
                <div>
                  <div className="text-muted-foreground">Plate</div>
                  <div className="font-medium">{selectedVehicle.plate_number || "—"}</div>
                </div>
                <div>
                  <div className="text-muted-foreground">Driver</div>
                  <div className="font-medium truncate">{selectedVehicle.driver_name || "—"}</div>
                </div>
              </div>
              <BusDistance vehicle={selectedVehicle} userLocation={currentUserLocation} />
            </div>
          </div>
        </div>
      )}

      {/* Map tools, stacked in one column in the top-right corner so none of
          them get cut off by rounded corners on short maps (the passenger
          home map is only a few hundred pixels tall). */}
      <div className="absolute right-3 top-3 z-10 flex flex-col gap-1.5">
        <button
          type="button"
          onClick={() => setIsFullscreen((f) => !f)}
          className={TOOL_BTN}
          title={isFullscreen ? "Exit full screen" : "Full screen"}
          aria-label={isFullscreen ? "Exit full screen" : "Full screen"}
        >
          {isFullscreen ? <Minimize2 className="w-[18px] h-[18px] text-primary" /> : <Maximize2 className="w-[18px] h-[18px] text-primary" />}
        </button>
        {/* Recenter on my location — pulses when follow mode has been dragged off (followUser only) */}
        <button
          type="button"
          onClick={recenter}
          className={`${TOOL_BTN} ${followUser && !isFollowing ? "!bg-primary !border-primary animate-pulse" : ""}`}
          title={followUser && !isFollowing ? "Tap to re-center and follow" : "Show my location"}
          aria-label="Show my location"
        >
          <LocateFixed className={`w-[18px] h-[18px] ${followUser && !isFollowing ? "text-primary-foreground" : "text-primary"}`} />
        </button>
        <button
          type="button"
          onClick={() => setIsSatellite((s) => !s)}
          className={`${TOOL_BTN} ${isSatellite ? "!bg-primary !text-primary-foreground !border-primary" : ""}`}
          title={isSatellite ? "Switch to street view" : "Switch to satellite view"}
          aria-label={isSatellite ? "Street view" : "Satellite view"}
        >
          <Satellite className="w-[18px] h-[18px]" />
        </button>
        <button type="button" onClick={() => setIs3D(v => !v)} className={`${TOOL_BTN} text-xs font-bold ${is3D ? "!bg-primary !text-primary-foreground" : ""}`} aria-label={is3D ? "Switch to 2D map" : "Switch to 3D map"} aria-pressed={is3D}>{is3D ? "3D" : "2D"}</button>
        <div className="flex flex-col rounded-full border border-border bg-background/90 shadow-md overflow-hidden">
          <button type="button" onClick={() => mapRef.current?.zoomIn({ duration: 300 })} className="w-9 h-9 grid place-items-center hover:bg-accent" aria-label="Zoom in" title="Zoom in">
            <Plus className="w-[18px] h-[18px]" />
          </button>
          <div className="h-px bg-border mx-2" />
          <button type="button" onClick={() => mapRef.current?.zoomOut({ duration: 300 })} className="w-9 h-9 grid place-items-center hover:bg-accent" aria-label="Zoom out" title="Zoom out">
            <Minus className="w-[18px] h-[18px]" />
          </button>
        </div>
      </div>
    </>
  );

  // Fullscreen renders via portal at body level to escape parent overflow/transform clipping
  if (isFullscreen) {
    return createPortal(
      <div className="fixed inset-0 z-50 bg-background" style={{ height: "100vh" }}>
        {mapContent}
      </div>,
      document.body
    );
  }

  return (
    <div className={`relative ${className}`} style={{ height }}>
      {mapContent}
    </div>
  );
}