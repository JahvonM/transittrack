import React, { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Map, { Marker, Source, Layer } from "react-map-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { mapEngine, markFullMapFailed } from "@/lib/mapEngine";
import { MAPBOX_TOKEN, mapStyleFor, GPS_INTERVAL_MS } from "@/lib/mapbox";
import { useIsDark } from "@/lib/useTheme";
import OfflineStatusBadge from "@/components/OfflineStatusBadge";
import { useOfflineSync } from "@/hooks/useOfflineSync";
import { fetchTurnByTurnRoute } from "@/lib/geo";
import {
  formatDistance, formatDuration, progressAt, projectOnRoute, routeAhead, speedLimitKmh, voicePromptAt,
} from "@/lib/navigation";
import { speak, stopSpeaking } from "@/lib/speech";
import useSmoothPosition from "@/hooks/useSmoothPosition";
import { useBearing } from "@/components/MapBusPin";
import TripProgress, { routeProgress } from "@/components/TripProgress";
import { LaneArrow, ManeuverArrow, NavPuck } from "@/components/driver/NavIcons";
import { Bus, Compass, LocateFixed, Route as RouteIcon, Satellite, Volume2, VolumeX } from "lucide-react";

// Basic map for tablets without WebGL 2 — loaded only on those devices.
const LiteMap = lazy(() => import("@/components/LiteMap"));

// Google-Maps-style colours: blue route, orange/red where traffic is slow.
const ROUTE_COLOR = { normal: "#1A73E8", moderate: "#F29900", heavy: "#D93025" };
const BANNER = "#0F6E46"; // Google's navigation green
const BANNER_DARK = "#0B5537";

// Hide POI/transit icon clutter but keep road labels — a driver needs
// street names to navigate.
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

const OFF_ROUTE_M = 45; // this far from the blue line on two fixes in a row → reroute
const SNAP_M = 35; // closer than this, the arrow is drawn on the road
const REROUTE_COOLDOWN_MS = 10000;
const MUTE_KEY = "tt_nav_muted";
const HEADING_UP_KEY = "tt_nav_north_up";

const clock = (ms) => new Date(ms).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

// Zoom out a little at speed so the next turn is in view sooner.
const zoomForSpeed = (kmh) => (kmh > 70 ? 15.6 : kmh > 40 ? 16.3 : 17);

function SpeedWidget({ kmh, limit }) {
  const over = limit != null && kmh != null && kmh > limit + 3;
  return (
    <div className="flex flex-col items-center gap-1 shrink-0" aria-label="Speed">
      {limit != null && (
        <div className="w-11 h-11 rounded-full bg-white border-[4px] border-[#D93025] grid place-items-center text-black font-bold text-sm tabular-nums" title="Speed limit">
          {limit}
        </div>
      )}
      <div className={`w-14 h-14 rounded-full grid place-items-center shadow-lg border ${over ? "bg-[#D93025] text-white border-[#D93025]" : "bg-card/95 border-border"}`}>
        <div className="text-center leading-none">
          <div className="text-lg font-bold tabular-nums">{kmh == null ? "–" : Math.round(kmh)}</div>
          <div className="text-[10px] opacity-75">km/h</div>
        </div>
      </div>
    </div>
  );
}

// fill: take the parent's full height (the combined Drive screen).
// pushLocation: send GPS to the server itself — off on the Drive screen,
// where the tracking panel owns location sharing (and its Paused state).
// pins: extra points such as passenger pickup spots.
export default function DriverNavMap({ session, invoke, fill = false, pushLocation: shouldPush = true, pins = [] }) {
  const isDark = useIsDark();
  const { online, pendingCount } = useOfflineSync();
  const [route, setRoute] = useState(session?.route || null);
  const [pos, setPos] = useState(
    session?.vehicle?.current_lat != null ? { lat: session.vehicle.current_lat, lng: session.vehicle.current_lng } : null
  );
  const watchId = useRef(null);
  const lastPush = useRef(0);
  const mapRef = useRef(null);
  const bannerRef = useRef(null);
  const bottomRef = useRef(null);
  const [basicMap, setBasicMap] = useState(() => mapEngine() === "basic");
  // The camera follows the bus (heading-up, tilted) until the driver drags
  // the map; "Re-centre" brings it back — like Google Maps.
  const [following, setFollowing] = useState(true);
  const [northUp, setNorthUp] = useState(() => { try { return localStorage.getItem(HEADING_UP_KEY) === "1"; } catch { return false; } });
  const [muted, setMuted] = useState(() => { try { return localStorage.getItem(MUTE_KEY) === "1"; } catch { return false; } });
  const mutedRef = useRef(muted);
  useEffect(() => {
    mutedRef.current = muted;
    try { localStorage.setItem(MUTE_KEY, muted ? "1" : "0"); } catch { /* ignore */ }
    if (muted) stopSpeaking();
  }, [muted]);
  useEffect(() => { try { localStorage.setItem(HEADING_UP_KEY, northUp ? "1" : "0"); } catch { /* ignore */ } }, [northUp]);

  const vehicle = session?.vehicle;
  const vehicleId = vehicle?.id;

  useEffect(() => { if (session?.route) setRoute(session.route); }, [session?.route]);

  const pushLocation = useCallback(async (lat, lng) => {
    if (!vehicleId) return;
    try { await invoke("update_location", { lat, lng, status: "on_trip" }); } catch { /* offline — idempotent retry */ }
  }, [vehicleId, invoke]);

  useEffect(() => {
    if (!vehicleId || !navigator.geolocation) return undefined;
    watchId.current = navigator.geolocation.watchPosition(
      (p) => {
        if (p.coords.accuracy != null && p.coords.accuracy > 100) return;
        setPos({
          lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy,
          kmh: Number.isFinite(p.coords.speed) && p.coords.speed >= 0 ? p.coords.speed * 3.6 : null,
          gpsHeading: Number.isFinite(p.coords.heading) ? p.coords.heading : null,
        });
        const now = Date.now();
        if (shouldPush && now - lastPush.current >= GPS_INTERVAL_MS) { lastPush.current = now; pushLocation(p.coords.latitude, p.coords.longitude); }
      },
      () => {},
      { enableHighAccuracy: true, maximumAge: 0, timeout: 10000 }
    );
    return () => { if (watchId.current != null) navigator.geolocation.clearWatch(watchId.current); };
  }, [vehicleId, pushLocation, shouldPush]);

  const orderedStops = useMemo(
    () => (route?.stops?.length ? [...route.stops].sort((a, b) => (a.order ?? 0) - (b.order ?? 0)) : []),
    [route]
  );
  // The stop ahead of the bus — advances as each stop is passed. Before the
  // first GPS fix, the first stop.
  const nextStopIndex = useMemo(() => {
    if (!orderedStops.length) return -1;
    const p = routeProgress(orderedStops, pos?.lat, pos?.lng);
    if (!p) return 0;
    return Math.max(0, orderedStops.indexOf(p.stops[p.nextIndex]));
  }, [orderedStops, pos?.lat, pos?.lng]);
  const nextStop = nextStopIndex >= 0 ? orderedStops[nextStopIndex] : null;
  const nextStopKey = nextStop ? `${nextStop.lat},${nextStop.lng}` : null;

  // --- Directions ------------------------------------------------------
  const [nav, setNav] = useState(null);
  const [navFor, setNavFor] = useState(null);
  const [loadingRoute, setLoadingRoute] = useState(false);
  const [rerouting, setRerouting] = useState(false);
  const projRef = useRef(null);
  const offCount = useRef(0);
  const lastRerouteAt = useRef(0);
  const spokenRef = useRef(new Set());
  const arrivedFor = useRef(null);
  const rawHeading = useBearing(pos?.lat, pos?.lng);
  const headingRef = useRef(null);
  headingRef.current = pos?.gpsHeading ?? (Number.isFinite(rawHeading) ? ((rawHeading % 360) + 360) % 360 : null);

  const loadRoute = useCallback(async (origin, stop, key, { reroute = false } = {}) => {
    if (reroute) setRerouting(true); else setLoadingRoute(true);
    const res = await fetchTurnByTurnRoute(origin, { lat: stop.lat, lng: stop.lng }, { heading: headingRef.current });
    if (res) {
      setNav(res);
      setNavFor(key);
      projRef.current = null;
      spokenRef.current = new Set();
    }
    setRerouting(false);
    setLoadingRoute(false);
  }, []);

  // New directions each time the next stop changes (not on every GPS tick).
  const requestedFor = useRef(null);
  useEffect(() => {
    if (!pos || !nextStop || !nextStopKey || requestedFor.current === nextStopKey) return;
    requestedFor.current = nextStopKey;
    loadRoute({ lat: pos.lat, lng: pos.lng }, nextStop, nextStopKey);
  }, [pos, nextStop, nextStopKey, loadRoute]);

  // Where the bus is on the route, and everything that follows from it.
  const routeNav = nav && navFor === nextStopKey ? nav : null;
  const proj = useMemo(() => {
    if (!routeNav || !pos) return null;
    const p = projectOnRoute(routeNav, pos, projRef.current?.seg ?? null);
    return p;
  }, [routeNav, pos]);
  useEffect(() => { if (proj) projRef.current = proj; }, [proj]);
  const progress = useMemo(() => (routeNav && proj ? progressAt(routeNav, proj.along) : null), [routeNav, proj]);

  // Off the blue line on two fixes in a row → new directions from here.
  useEffect(() => {
    if (!proj || !nextStop || rerouting) return;
    const accurate = pos?.accuracy == null || pos.accuracy <= 40;
    if (proj.offM > OFF_ROUTE_M && accurate) offCount.current += 1; else offCount.current = 0;
    if ((offCount.current >= 2 || proj.offM > 150) && Date.now() - lastRerouteAt.current > REROUTE_COOLDOWN_MS) {
      lastRerouteAt.current = Date.now();
      offCount.current = 0;
      loadRoute({ lat: pos.lat, lng: pos.lng }, nextStop, nextStopKey, { reroute: true });
    }
  }, [proj, pos, nextStop, nextStopKey, rerouting, loadRoute]);

  // Spoken prompts, the same wording and timing Google Maps uses.
  useEffect(() => {
    if (!routeNav || !progress) return;
    if (progress.arrived) {
      if (arrivedFor.current !== nextStopKey) {
        arrivedFor.current = nextStopKey;
        if (!mutedRef.current) speak(`You have arrived at ${nextStop?.name || "the stop"}.`);
      }
      return;
    }
    const v = voicePromptAt(routeNav, progress, spokenRef.current);
    if (v && !mutedRef.current) speak(v.text);
  }, [routeNav, progress, nextStop, nextStopKey]);

  useEffect(() => () => stopSpeaking(), []);

  // --- Where to draw the bus --------------------------------------------
  const onRoad = proj && proj.offM <= SNAP_M;
  const drawAt = onRoad ? { lat: proj.point[1], lng: proj.point[0] } : pos;
  const smooth = useSmoothPosition(drawAt?.lat, drawAt?.lng, { duration: 900 });
  const heading = onRoad ? proj.heading : headingRef.current ?? 0;
  const kmh = pos?.kmh ?? null;
  const limit = routeNav && proj ? speedLimitKmh(routeNav, proj.seg) : null;
  const ahead = useMemo(() => (routeNav ? routeAhead(routeNav, proj) : []), [routeNav, proj]);
  const aheadGeo = useMemo(() => ({
    type: "FeatureCollection",
    features: ahead.map((r) => ({ type: "Feature", properties: { level: r.level }, geometry: { type: "LineString", coordinates: r.coords } })),
  }), [ahead]);

  // Camera: follow the bus, pointing the way it drives, tilted, with the
  // bus low on the screen so more of the road ahead shows.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !smooth || !following) return;
    const top = (bannerRef.current?.offsetHeight || 120) + 24;
    const bottom = (bottomRef.current?.offsetHeight || 90) + 40;
    map.easeTo({
      center: [smooth.lng, smooth.lat],
      bearing: northUp ? 0 : heading,
      pitch: northUp ? 0 : 55,
      zoom: zoomForSpeed(kmh || 0),
      padding: { top, bottom, left: 0, right: 0 },
      duration: 900,
      essential: true,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [smooth?.lat, smooth?.lng, following, northUp]);

  const stopFollowing = () => setFollowing(false);
  const recenter = () => setFollowing(true);
  const showOverview = () => {
    const map = mapRef.current;
    const coords = ahead.flatMap((r) => r.coords);
    setFollowing(false);
    if (!map || coords.length < 2) return;
    let w = Infinity, s = Infinity, e = -Infinity, n = -Infinity;
    for (const [x, y] of coords) { w = Math.min(w, x); e = Math.max(e, x); s = Math.min(s, y); n = Math.max(n, y); }
    map.fitBounds([[w, s], [e, n]], {
      padding: { top: (bannerRef.current?.offsetHeight || 120) + 40, bottom: (bottomRef.current?.offsetHeight || 90) + 50, left: 50, right: 50 },
      bearing: 0, pitch: 0, duration: 800, maxZoom: 16,
    });
  };

  // --- Banner -------------------------------------------------------------
  const gpsStatus = !pos ? "searching" : pos.accuracy != null && pos.accuracy <= 50 ? "locked" : pos.accuracy == null ? "locked" : "low";
  const step = progress?.step;
  const banner = progress?.banner;
  const drivingSide = step?.drivingSide || "right";
  let bannerMain;
  if (!nextStop) {
    bannerMain = { title: orderedStops.length ? "Route finished" : "No route assigned", sub: orderedStops.length ? "" : "Ask dispatch to give this bus a route" };
  } else if (progress?.arrived) {
    bannerMain = { title: `Arrived at ${nextStop.name || "the stop"}`, sub: "Directions to the next stop start when you leave", arrive: true };
  } else if (rerouting) {
    bannerMain = { title: "Rerouting…", sub: "" };
  } else if (!routeNav) {
    bannerMain = { title: loadingRoute || !pos ? "Getting directions…" : "Directions unavailable", sub: !pos ? "Waiting for GPS" : online ? "" : "No internet — directions need a connection" };
  }
  const lanes = banner?.lanes?.length ? banner.lanes : null;
  const thenStep = progress?.thenStep || null;
  const arrivalAt = progress && !progress.arrived ? Date.now() + progress.remainingS * 1000 : null;

  const statusBadges = (
    <div className="flex items-center gap-1.5">
      <span className={`text-xs px-2 py-0.5 rounded-full border inline-flex items-center gap-1 bg-card/90 backdrop-blur ${
        gpsStatus === "locked" ? "text-emerald-500 border-emerald-500/40" : gpsStatus === "low" ? "text-amber-500 border-amber-500/40" : "text-muted-foreground border-border"
      }`}>
        <Satellite className="w-3 h-3" />
        {gpsStatus === "locked" ? "GPS" : gpsStatus === "low" ? "Weak GPS" : "Finding GPS…"}
      </span>
      <OfflineStatusBadge online={online} pendingCount={pendingCount} />
    </div>
  );

  const startView = { longitude: pos?.lng ?? vehicle?.current_lng ?? -61.7, latitude: pos?.lat ?? vehicle?.current_lat ?? 12.05, zoom: 16, pitch: 55 };

  return (
    <div className={fill ? "h-full min-h-0 flex flex-col gap-2" : "space-y-3"}>
      {!fill && (
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2 font-heading font-semibold text-sm">
            <Bus className="w-4 h-4 text-primary" /> {vehicle?.name}
          </div>
          {statusBadges}
        </div>
      )}
      {route?.stops?.length > 1 && pos && (
        <TripProgress stops={orderedStops} lat={pos.lat} lng={pos.lng} label={route.name || "Your route"} />
      )}
      <div className={`relative rounded-2xl overflow-hidden border ${fill ? "flex-1 min-h-[260px]" : "h-[72vh]"}`} data-testid="nav-map">
        {basicMap ? (
          <Suspense fallback={null}>
            <LiteMap
              fill
              followUser={following}
              showUserDot={false}
              showRecenter={false}
              onDragStart={stopFollowing}
              userLocation={smooth || (vehicle?.current_lat != null ? { lat: vehicle.current_lat, lng: vehicle.current_lng } : null)}
              vehicles={smooth ? [{
                id: "self", name: vehicle?.name, marker_label: "",
                current_lat: smooth.lat, current_lng: smooth.lng,
                marker_color: ROUTE_COLOR.normal, marker_size: 40, marker_heading: heading ?? null,
              }] : []}
              stops={nextStop ? [{ ...nextStop, color: "#D93025" }] : []}
              pins={pins}
              lines={ahead.map((r) => ({ coords: r.coords, color: ROUTE_COLOR[r.level], width: 7, opacity: 0.95 }))}
            />
          </Suspense>
        ) : (
          <Map
            ref={mapRef}
            mapboxAccessToken={MAPBOX_TOKEN}
            mapStyle={mapStyleFor(isDark)}
            initialViewState={startView}
            style={{ width: "100%", height: "100%" }}
            attributionControl={false}
            onLoad={(e) => hidePoiLayers(e.target)}
            onError={(e) => { if (/webgl/i.test(e?.error?.message || "")) { markFullMapFailed(); setBasicMap(true); } }}
            onDragStart={stopFollowing}
            onRotateStart={(e) => { if (e.originalEvent) stopFollowing(); }}
            onPitchStart={(e) => { if (e.originalEvent) stopFollowing(); }}
          >
            {ahead.length > 0 && (
              <Source id="nav-route" type="geojson" data={aheadGeo}>
                <Layer id="nav-route-casing" type="line" layout={{ "line-cap": "round", "line-join": "round" }}
                  paint={{ "line-color": isDark ? "#0b2a5c" : "#0d47a1", "line-width": ["interpolate", ["linear"], ["zoom"], 12, 7, 17, 15] }} />
                <Layer id="nav-route-line" type="line" layout={{ "line-cap": "round", "line-join": "round" }}
                  paint={{
                    "line-color": ["match", ["get", "level"], "heavy", ROUTE_COLOR.heavy, "moderate", ROUTE_COLOR.moderate, ROUTE_COLOR.normal],
                    "line-width": ["interpolate", ["linear"], ["zoom"], 12, 4.5, 17, 10],
                  }} />
              </Source>
            )}
            {pins.filter((p) => p.lat != null && p.lng != null).map((p, i) => (
              <Marker key={`pin-${i}`} longitude={p.lng} latitude={p.lat} anchor="center">
                <div className="w-3.5 h-3.5 rounded-full border-2 border-white shadow" style={{ backgroundColor: p.color || "#34d399" }} title={p.label} />
              </Marker>
            ))}
            {nextStop && (
              <Marker longitude={nextStop.lng} latitude={nextStop.lat} anchor="bottom">
                <div className="flex flex-col items-center" title={nextStop.name}>
                  <svg width="30" height="40" viewBox="0 0 24 32" aria-hidden="true">
                    <path d="M12 31s-10-10.2-10-18a10 10 0 0 1 20 0c0 7.8-10 18-10 18z" fill="#D93025" stroke="#fff" strokeWidth="1.5" />
                    <circle cx="12" cy="13" r="3.8" fill="#fff" />
                  </svg>
                </div>
              </Marker>
            )}
            {smooth && (
              <Marker longitude={smooth.lng} latitude={smooth.lat} anchor="center" rotation={heading || 0} rotationAlignment="map" pitchAlignment="map">
                <NavPuck />
              </Marker>
            )}
          </Map>
        )}

        {/* Top: next turn, Google-Maps style */}
        <div ref={bannerRef} className="absolute top-3 left-3 right-3 z-10 max-w-xl space-y-1.5 pointer-events-none" data-testid="nav-banner">
          <div className="rounded-2xl text-white shadow-xl overflow-hidden" style={{ background: BANNER }}>
            {bannerMain ? (
              <div className="px-4 py-3 flex items-center gap-3">
                {bannerMain.arrive && <ManeuverArrow type="arrive" className="w-10 h-10 shrink-0" />}
                <div className="min-w-0">
                  <div className="text-xl font-semibold leading-tight">{bannerMain.title}</div>
                  {bannerMain.sub && <div className="text-sm text-white/80 mt-0.5">{bannerMain.sub}</div>}
                </div>
              </div>
            ) : (
              <div className="px-4 py-3 flex items-center gap-4">
                <div className="flex flex-col items-center shrink-0 w-16">
                  <ManeuverArrow type={step?.type} modifier={step?.modifier} drivingSide={drivingSide} className="w-12 h-12" />
                  <div className="text-lg font-bold tabular-nums leading-none mt-1" data-testid="nav-distance">{formatDistance(progress?.distToManeuverM)}</div>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-2xl font-bold leading-tight line-clamp-2" data-testid="nav-instruction">
                    {banner?.text || step?.name || step?.instruction}
                  </div>
                  {banner?.secondary ? (
                    <div className="text-sm text-white/80 truncate mt-0.5">{banner.secondary}</div>
                  ) : banner?.text && step?.instruction && !step.instruction.includes(banner.text) ? (
                    <div className="text-sm text-white/80 truncate mt-0.5">{step.instruction.replace(/\.$/, "")}</div>
                  ) : null}
                </div>
              </div>
            )}
            {!bannerMain && lanes && (
              <div className="flex justify-center gap-1 px-3 py-1" style={{ background: BANNER_DARK }} aria-label="Lanes">
                {lanes.map((l, i) => <LaneArrow key={i} lane={l} drivingSide={drivingSide} />)}
              </div>
            )}
          </div>
          {!bannerMain && thenStep && (
            <div className="inline-flex items-center gap-2 rounded-xl text-white px-3 py-1.5 text-sm font-semibold shadow-lg" style={{ background: BANNER_DARK }} data-testid="nav-then">
              Then <ManeuverArrow type={thenStep.type} modifier={thenStep.modifier} drivingSide={drivingSide} className="w-6 h-6" />
            </div>
          )}
        </div>

        {/* Bottom: speed, time and distance left, arrival time */}
        <div ref={bottomRef} className="absolute left-3 right-3 bottom-3 z-10 space-y-2">
          <div className="flex items-end justify-between gap-2">
            <div className="flex items-end gap-2">
              <SpeedWidget kmh={kmh} limit={limit} />
              {!following && (
                <button type="button" onClick={recenter} className="h-11 px-4 rounded-full bg-card/95 border border-border shadow-lg flex items-center gap-2 text-sm font-semibold text-[#1A73E8]">
                  <LocateFixed className="w-4 h-4" /> Re-centre
                </button>
              )}
            </div>
            {fill && statusBadges}
          </div>
          <div className="rounded-2xl bg-card/95 backdrop-blur border border-border shadow-xl px-4 py-2.5 flex items-center gap-3" data-testid="nav-eta">
            <div className="min-w-0 flex-1">
              {progress && !progress.arrived ? (
                <>
                  <div className="text-2xl font-bold leading-tight text-[#1E8E3E] dark:text-[#34A853] tabular-nums">{formatDuration(progress.remainingS)}</div>
                  <div className="text-sm text-muted-foreground truncate tabular-nums">
                    {formatDistance(progress.remainingM)} · {clock(arrivalAt)}{nextStop?.name ? ` · ${nextStop.name}` : ""}
                  </div>
                </>
              ) : (
                <div className="text-sm text-muted-foreground truncate py-1">
                  {nextStop ? `Next stop: ${nextStop.name || "—"}` : "No stops left on this route"}
                </div>
              )}
            </div>
            <button
              type="button"
              onClick={() => setNorthUp((v) => !v)}
              className="w-10 h-10 rounded-full border border-border grid place-items-center hover:bg-accent shrink-0"
              title={northUp ? "Point the map the way you drive" : "Keep north at the top"}
              aria-label={northUp ? "Heading up" : "North up"}
            >
              <Compass className="w-5 h-5" style={{ transform: `rotate(${northUp ? 0 : -(heading || 0)}deg)` }} />
            </button>
            <button
              type="button"
              onClick={showOverview}
              disabled={!ahead.length}
              className="w-10 h-10 rounded-full border border-border grid place-items-center hover:bg-accent shrink-0 disabled:opacity-40"
              title="See the whole route"
              aria-label="Route overview"
            >
              <RouteIcon className="w-5 h-5" />
            </button>
            <button
              type="button"
              onClick={() => setMuted((m) => !m)}
              className="w-10 h-10 rounded-full border border-border grid place-items-center hover:bg-accent shrink-0"
              title={muted ? "Turn voice directions on" : "Mute voice directions"}
              aria-label={muted ? "Unmute" : "Mute"}
            >
              {muted ? <VolumeX className="w-5 h-5 text-muted-foreground" /> : <Volume2 className="w-5 h-5" />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
