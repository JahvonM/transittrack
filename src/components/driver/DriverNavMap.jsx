import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Map, { Marker, Source, Layer } from "react-map-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { MAPBOX_TOKEN, mapStyleFor, mapAccentFor, GPS_INTERVAL_MS } from "@/lib/mapbox";
import { useIsDark } from "@/lib/useTheme";
import OfflineStatusBadge from "@/components/OfflineStatusBadge";
import { useOfflineSync } from "@/hooks/useOfflineSync";
import { formatEta, fetchTurnByTurnRoute, haversineKm } from "@/lib/geo";
import { speak, stopSpeaking } from "@/lib/speech";
import useDrivingEta from "@/hooks/useDrivingEta";
import useSmoothPosition from "@/hooks/useSmoothPosition";
import AccuracyHalo from "@/components/AccuracyHalo";
import MapBusPin, { useBearing } from "@/components/MapBusPin";
import TripProgress, { routeProgress } from "@/components/TripProgress";
import { Bus, Navigation, MapPin, LocateFixed, Satellite, Flag, RotateCw, ArrowUp, Volume2, VolumeX } from "lucide-react";

// Matches MapboxMap.jsx's declutterStyle: hide POI/transit icon clutter but
// keep road labels — without them, an area with no live data yet renders as
// a blank basemap, and a driver specifically needs street names to navigate.
function hidePoiLayers(map) {
  const style = map.getStyle();
  if (!style || !style.layers) return;
  style.layers.forEach((layer) => {
    const id = layer.id || "";
    if (id.includes("poi") || id.includes("transit")) {
      try { map.setLayoutProperty(id, "visibility", "none"); } catch { /* some layers can't be toggled */ }
    }
  });
}

// Maps a Mapbox maneuver "modifier" to a rotation angle for a single arrow
// icon — covers every turn/merge/fork case without needing a full icon set.
const MANEUVER_ANGLES = {
  uturn: 180,
  "sharp right": 135,
  right: 90,
  "slight right": 45,
  straight: 0,
  "slight left": -45,
  left: -90,
  "sharp left": -135,
};

function ManeuverIcon({ step, className }) {
  if (!step) return <Navigation className={className} />;
  if (step.type === "arrive") return <Flag className={className} />;
  if (step.type === "roundabout" || step.type === "rotary") return <RotateCw className={className} />;
  const angle = MANEUVER_ANGLES[step.modifier] ?? 0;
  return <ArrowUp className={className} style={{ transform: `rotate(${angle}deg)` }} />;
}

function formatDistance(m) {
  if (m == null) return "";
  if (m < 1000) return `${Math.max(0, Math.round(m / 10) * 10)} m`;
  return `${(m / 1000).toFixed(1)} km`;
}

// Distance from a point to the nearest vertex of a route line — good enough
// to detect "the driver has left the planned route" without a full
// point-to-segment projection.
function minDistanceToLineKm(point, coords) {
  if (!point || !coords?.length) return Infinity;
  let min = Infinity;
  for (const [lng, lat] of coords) {
    const d = haversineKm(point.lat, point.lng, lat, lng);
    if (d < min) min = d;
  }
  return min;
}

const OFFROUTE_KM = 0.08; // ~80m off the planned line triggers a reroute
const REROUTE_COOLDOWN_MS = 15000;
const FAR_ANNOUNCE_M = 300;
const NEAR_ANNOUNCE_M = 50;
const ADVANCE_STEP_M = 25;

export default function DriverNavMap({ session, invoke }) {
  const isDark = useIsDark();
  const accent = mapAccentFor(isDark);
  const { online, pendingCount } = useOfflineSync();
  const [route, setRoute] = useState(session?.route || null);
  const [pos, setPos] = useState(
    session?.vehicle?.current_lat != null ? { lat: session.vehicle.current_lat, lng: session.vehicle.current_lng } : null
  );
  const [liveVehicle, setLiveVehicle] = useState(session?.vehicle || null);
  const watchId = useRef(null);
  const lastPush = useRef(0);
  const mapRef = useRef(null);
  // Nav-mode camera follow, like CarPlay/Google Maps: the map recenters on
  // every new GPS fix by default. Manually dragging the map turns this off
  // (so the driver can look around) until they tap recenter again.
  const following = useRef(true);
  const [isFollowing, setIsFollowing] = useState(true);

  const vehicle = session?.vehicle || liveVehicle;
  const vehicleId = vehicle?.id;

  useEffect(() => { if (session?.route) setRoute(session.route); }, [session?.route]);
  useEffect(() => { if (session?.vehicle) setLiveVehicle(session.vehicle); }, [session?.vehicle]);

  const pushLocation = useCallback(async (lat, lng) => {
    if (!vehicleId) return;
    try { await invoke("update_location", { lat, lng, status: "on_trip" }); } catch { /* offline — idempotent retry */ }
  }, [vehicleId, invoke]);

  useEffect(() => {
    if (!vehicleId || !navigator.geolocation) return;
    watchId.current = navigator.geolocation.watchPosition(
      (p) => {
        if (p.coords.accuracy != null && p.coords.accuracy > 100) return;
        setPos({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy });
        const now = Date.now();
        if (now - lastPush.current >= GPS_INTERVAL_MS) { lastPush.current = now; pushLocation(p.coords.latitude, p.coords.longitude); }
      },
      () => {},
      { enableHighAccuracy: true, maximumAge: 0, timeout: 10000 }
    );
    return () => { if (watchId.current != null) navigator.geolocation.clearWatch(watchId.current); };
  }, [vehicleId, pushLocation]);

  const orderedStops = useMemo(
    () => (route?.stops?.length ? [...route.stops].sort((a, b) => (a.order ?? 0) - (b.order ?? 0)) : []),
    [route]
  );
  // The stop ahead of the bus given where it is now — advances as each stop
  // is passed. Before the first GPS fix, fall back to the first stop.
  const nextStopIndex = useMemo(() => {
    if (!orderedStops.length) return -1;
    const p = routeProgress(orderedStops, pos?.lat, pos?.lng);
    if (!p) return 0;
    const next = p.stops[p.nextIndex];
    return Math.max(0, orderedStops.indexOf(next));
  }, [orderedStops, pos?.lat, pos?.lng]);
  const nextStop = nextStopIndex >= 0 ? orderedStops[nextStopIndex] : null;
  const nextStopKey = nextStop ? `${nextStop.lat},${nextStop.lng}` : null;

  // Real driving distance/ETA to the next stop (falls back to straight-line while loading)
  const nextStopDest = nextStop ? { lat: nextStop.lat, lng: nextStop.lng } : null;
  const { km: nextStopKm, mins: nextStopMins } = useDrivingEta(pos, nextStopDest);

  // --- In-app turn-by-turn guidance ------------------------------------
  // Everything below replaces the old "hand off to Google Maps" button:
  // a real route+maneuver-step fetch, live progress through the steps
  // driven purely off the GPS fix (no extra network calls needed for
  // that part), spoken cues at two distance thresholds per maneuver, and
  // an automatic reroute if the driver strays off the planned line.
  const [navRoute, setNavRoute] = useState(null); // {geometry, steps, distanceKm, durationMin}
  const [stepIndex, setStepIndex] = useState(0);
  const [rerouting, setRerouting] = useState(false);
  const [muted, setMuted] = useState(false);
  const loadedForRef = useRef(null);
  const lastRerouteAt = useRef(0);
  const spokenRef = useRef({});
  const mutedRef = useRef(false);
  useEffect(() => { mutedRef.current = muted; }, [muted]);

  const loadRoute = useCallback(async (origin, dest) => {
    setRerouting(true);
    const res = await fetchTurnByTurnRoute(origin, dest);
    setNavRoute(res);
    setStepIndex(0);
    spokenRef.current = {};
    setRerouting(false);
  }, []);

  // Fetch a route+steps once per destination stop (not on every GPS tick).
  useEffect(() => {
    if (!pos || !nextStop || !nextStopKey) return;
    if (loadedForRef.current === nextStopKey) return;
    loadedForRef.current = nextStopKey;
    loadRoute({ lat: pos.lat, lng: pos.lng }, { lat: nextStop.lat, lng: nextStop.lng });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pos, nextStop, nextStopKey]);

  // If the driver strays noticeably off the planned line, recalculate —
  // same behavior real nav apps show as "Recalculating…".
  useEffect(() => {
    if (!pos || !navRoute?.geometry?.length || !nextStop) return;
    const off = minDistanceToLineKm(pos, navRoute.geometry) > OFFROUTE_KM;
    if (off && Date.now() - lastRerouteAt.current > REROUTE_COOLDOWN_MS) {
      lastRerouteAt.current = Date.now();
      loadRoute({ lat: pos.lat, lng: pos.lng }, { lat: nextStop.lat, lng: nextStop.lng });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pos?.lat, pos?.lng]);

  const currentStep = navRoute?.steps?.[stepIndex] || null;
  const distanceToManeuverM = currentStep?.location && pos
    ? haversineKm(pos.lat, pos.lng, currentStep.location[1], currentStep.location[0]) * 1000
    : null;

  // Advance through steps and speak cues based on live distance to the
  // upcoming maneuver — no need to re-fetch anything for this part.
  useEffect(() => {
    if (!currentStep || distanceToManeuverM == null) return;
    const spoken = spokenRef.current[stepIndex] || (spokenRef.current[stepIndex] = {});
    if (!mutedRef.current) {
      if (!spoken.far && distanceToManeuverM <= FAR_ANNOUNCE_M && currentStep.type !== "arrive") {
        speak(`In ${formatDistance(distanceToManeuverM)}, ${currentStep.instruction}`);
        spoken.far = true;
      }
      if (!spoken.near && distanceToManeuverM <= NEAR_ANNOUNCE_M) {
        speak(currentStep.type === "arrive" ? "You have arrived at the stop" : currentStep.instruction);
        spoken.near = true;
      }
    }
    if (distanceToManeuverM <= ADVANCE_STEP_M && stepIndex < navRoute.steps.length - 1) {
      setStepIndex((i) => i + 1);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [distanceToManeuverM, stepIndex]);

  useEffect(() => () => stopSpeaking(), []);
  // ----------------------------------------------------------------------

  const gpsStatus = !pos ? "searching" : pos.accuracy != null && pos.accuracy <= 50 ? "locked" : "low";
  const recenter = () => {
    const map = mapRef.current;
    // Fall back to the vehicle's last known server position if the browser
    // hasn't produced a live GPS fix yet (e.g. permission prompt still
    // pending, or every fix so far was too low-accuracy) — same fallback
    // chain the initial map view already uses, so the button always does
    // something as long as we know roughly where the bus is.
    const target = pos || (vehicle?.current_lat != null ? { lat: vehicle.current_lat, lng: vehicle.current_lng } : null);
    if (!map || !target) return;
    following.current = true;
    setIsFollowing(true);
    map.flyTo({ center: [target.lng, target.lat], zoom: Math.max(map.getZoom(), 15), duration: 800 });
  };
  const trail = liveVehicle?.trail || vehicle?.trail || [];

  // Keep the camera centered on each new GPS fix while following is on —
  // eased over roughly the same duration as the marker's own glide
  // (useSmoothPosition below) so the camera and the bus icon move together.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !pos || !following.current) return;
    map.easeTo({ center: [pos.lng, pos.lat], duration: 900 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pos?.lat, pos?.lng]);

  // Smoothly glide the bus icon between raw GPS pings instead of snapping
  // (shorter duration than the fleet map since watchPosition updates more often).
  const smoothPos = useSmoothPosition(pos?.lat, pos?.lng, { duration: 1000 });
  const heading = useBearing(pos?.lat, pos?.lng);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2 font-heading font-semibold text-sm">
          <Bus className="w-4 h-4 text-primary" /> {vehicle?.name}
        </div>
        <div className="flex items-center gap-2">
          <span className={`text-xs px-2 py-0.5 rounded-full border inline-flex items-center gap-1 ${
            gpsStatus === "locked" ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30" : gpsStatus === "low" ? "bg-amber-500/10 text-amber-400 border-amber-500/30" : "bg-muted text-muted-foreground border-border"
          }`}>
            <Satellite className="w-3 h-3" />
            {gpsStatus === "locked" ? "GPS locked" : gpsStatus === "low" ? "Low signal" : "Searching…"}
          </span>
          <OfflineStatusBadge online={online} pendingCount={pendingCount} />
        </div>
      </div>
      {route?.stops?.length > 1 && pos && (
        <TripProgress
          stops={orderedStops}
          lat={pos.lat}
          lng={pos.lng}
          label={route.name || "Your route"}
        />
      )}
      <div className="relative rounded-2xl overflow-hidden border h-[72vh]">
        <Map
          ref={mapRef} mapboxAccessToken={MAPBOX_TOKEN} mapStyle={mapStyleFor(isDark)}
          initialViewState={{ longitude: pos?.lng ?? vehicle?.current_lng ?? -61.7, latitude: pos?.lat ?? vehicle?.current_lat ?? 12.05, zoom: 15 }}
          style={{ width: "100%", height: "100%" }} attributionControl={false}
          onLoad={(e) => hidePoiLayers(e.target)}
          onDrag={() => { following.current = false; setIsFollowing(false); }}
        >
          {trail.length > 1 && (
            <Source id="driver-trail" type="geojson" data={{ type: "Feature", geometry: { type: "LineString", coordinates: trail.filter((p) => p.lat != null && p.lng != null).map((p) => [p.lng, p.lat]) } }}>
              <Layer id="driver-trail-line" type="line" paint={{ "line-color": accent, "line-width": 4, "line-opacity": 0.5 }} />
            </Source>
          )}
          {navRoute?.geometry?.length > 0 && (
            <Source id="path-to-next-stop" type="geojson" data={{ type: "Feature", geometry: { type: "LineString", coordinates: navRoute.geometry } }}>
              <Layer id="path-to-next-stop-line" type="line" paint={{ "line-color": accent, "line-width": 5, "line-opacity": 0.85 }} />
            </Source>
          )}
          {smoothPos && (
            <>
              <AccuracyHalo sourceId="driver-accuracy" lat={smoothPos.lat} lng={smoothPos.lng} accuracy={pos?.accuracy} color={accent} />
              <Marker longitude={smoothPos.lng} latitude={smoothPos.lat} anchor="center">
                <MapBusPin color={accent} driving heading={heading} />
              </Marker>
            </>
          )}
          {nextStop && (
            <Marker longitude={nextStop.lng} latitude={nextStop.lat} anchor="center">
              <div className="w-5 h-5 rounded-full bg-emerald-500 border-2 border-white shadow" />
            </Marker>
          )}
        </Map>
        <div className="absolute top-4 left-4 right-4 z-10 space-y-2">
          <div className="rounded-2xl border border-border bg-card/95 backdrop-blur-md shadow-xl px-4 py-3.5 flex items-center gap-3">
            <div className={`w-11 h-11 rounded-full grid place-items-center shrink-0 ${currentStep?.type === "arrive" ? "bg-emerald-500" : "bg-primary"}`}>
              <ManeuverIcon step={currentStep} className="w-5 h-5 text-white" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-base font-semibold leading-tight truncate">
                {rerouting ? "Recalculating route…" : currentStep ? currentStep.instruction : nextStop ? "Loading directions…" : "Awaiting route assignment"}
              </div>
              {currentStep && !rerouting && (
                <div className="text-sm text-muted-foreground mt-0.5 truncate">
                  {formatDistance(distanceToManeuverM)}{currentStep.streetName ? ` · onto ${currentStep.streetName}` : ""}
                </div>
              )}
            </div>
            <button
              type="button"
              onClick={() => setMuted((m) => !m)}
              className="w-9 h-9 rounded-full border border-border grid place-items-center shrink-0 hover:bg-accent"
              title={muted ? "Unmute voice guidance" : "Mute voice guidance"}
            >
              {muted ? <VolumeX className="w-4 h-4 text-muted-foreground" /> : <Volume2 className="w-4 h-4" />}
            </button>
          </div>
          {nextStop && (
            <div className="rounded-xl border border-border bg-card/90 backdrop-blur-md shadow px-4 py-2 flex items-center gap-2 text-xs text-muted-foreground">
              <MapPin className="w-3.5 h-3.5 text-primary shrink-0" />
              <span className="truncate">{nextStop.name}</span>
              <span className="ml-auto shrink-0">
                {nextStopKm != null ? (nextStopKm < 1 ? `${Math.round(nextStopKm * 1000)} m` : `${nextStopKm.toFixed(1)} km`) : "—"}
                {" · "}{formatEta(nextStopMins)}
              </span>
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={recenter}
          className={`absolute right-4 bottom-6 z-10 w-11 h-11 rounded-full border shadow-lg grid place-items-center transition-colors ${
            isFollowing ? "bg-card/95 border-border hover:bg-accent" : "bg-primary border-primary animate-pulse"
          }`}
          title={isFollowing ? "Following your position" : "Tap to re-center and follow"}
        >
          <LocateFixed className={`w-5 h-5 ${isFollowing ? "text-primary" : "text-primary-foreground"}`} />
        </button>
      </div>
    </div>
  );
}
