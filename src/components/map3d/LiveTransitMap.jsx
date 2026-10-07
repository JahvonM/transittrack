import React, { Suspense, lazy, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { Box, Compass, Expand, LocateFixed, Minus, Navigation, Plus, Satellite, Shrink, X } from "lucide-react";
import { MAPBOX_TOKEN, mapAccentFor } from "@/lib/mapbox";
import { useIsDark } from "@/lib/useTheme";
import { fetchDrivingRoute, haversineKm } from "@/lib/geo";
import { formatDistance } from "@/lib/navigation";
import { modelIdFor } from "@/lib/vehicleModels";
import { mapEngine, markFullMapFailed } from "@/lib/mapEngine";
import { cn } from "@/lib/utils";
import { ConnectionPill } from "@/components/system/ConnectionPill";
import { freshnessOf, vehicleStatusMeta, toneOf } from "@/components/system/status";
import BusDistance from "@/components/BusDistance";
import useUserLocation from "@/hooks/useUserLocation";
import { createVehicleLayer } from "./vehicleLayer";
import { boundsOf, bearingDeg, splitRoute } from "./routeGeometry";

const LiteMap = lazy(() => import("@/components/LiteMap"));

// Mapbox Standard: real 3D buildings and landmarks, with a light preset that
// follows the app theme. Satellite keeps the same 3D buildings over imagery.
const STYLE = "mapbox://styles/mapbox/standard";
const STYLE_SATELLITE = "mapbox://styles/mapbox/standard-satellite";
const PITCH_3D = 55;
const DEFAULT_VIEW = { center: [-61.7, 12.05], zoom: 12.5 };

const TOOL =
  "grid h-11 w-11 place-items-center rounded-full border border-border bg-background/92 text-foreground shadow-md backdrop-blur transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
const TOOL_ON = "!border-primary !bg-primary !text-primary-foreground";

function usePrefersReducedMotion() {
  const query = "(prefers-reduced-motion: reduce)";
  const [reduce, setReduce] = useState(() => typeof window !== "undefined" && window.matchMedia?.(query).matches);
  useEffect(() => {
    const mq = window.matchMedia?.(query);
    if (!mq) return undefined;
    const on = () => setReduce(mq.matches);
    mq.addEventListener?.("change", on);
    return () => mq.removeEventListener?.("change", on);
  }, []);
  return !!reduce;
}

function useOnline() {
  const [online, setOnline] = useState(() => (typeof navigator === "undefined" ? true : navigator.onLine !== false));
  useEffect(() => {
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    window.addEventListener("online", up);
    window.addEventListener("offline", down);
    return () => { window.removeEventListener("online", up); window.removeEventListener("offline", down); };
  }, []);
  return online;
}

// Re-render every so often so "updated 3 min ago" style labels stay true.
function useNow(ms = 30_000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return now;
}

const lineFeature = (coords) => ({
  type: "Feature",
  properties: {},
  geometry: { type: "LineString", coordinates: coords.length > 1 ? coords : [] },
});

function addLayerInSlot(map, layer) {
  try {
    map.addLayer({ ...layer, slot: "middle" });
  } catch {
    map.addLayer(layer); // styles without slots
  }
}

function stopElement(kind, name, onPick) {
  const el = document.createElement("div");
  const label = kind === "mine" ? `Your stop, ${name}` : kind === "next" ? `Next stop, ${name}` : `Stop, ${name}`;
  el.setAttribute("role", onPick ? "button" : "img");
  el.setAttribute("aria-label", onPick ? `${label}. Show its name and how far away it is` : label);
  el.title = name;
  if (onPick) {
    el.style.cursor = "pointer";
    el.onclick = (e) => { e.stopPropagation(); onPick(); };
  }
  if (kind === "mine") {
    el.className = "tt-map-stop-mine";
    el.innerHTML = `<span class="tt-map-stop-mine__pin"></span><span class="tt-map-stop-label"><b>Your stop</b></span>`;
    el.querySelector("b").insertAdjacentText("afterend", ` · ${name}`);
  } else if (kind === "next") {
    el.className = "tt-map-stop tt-map-stop--next";
  } else {
    el.className = `tt-map-stop ${kind === "passed" ? "tt-map-stop--passed" : ""}`;
  }
  return el;
}

/**
 * The passenger live map. Real 3D vehicles (three.js, sharing depth with
 * Mapbox's 3D buildings and terrain) glide between GPS fixes and face their
 * direction of travel. The route follows the roads and splits into the part
 * already driven and the part still ahead. Purely visual: it reads the same
 * vehicle, route and stop data as before and changes none of it.
 *
 * Devices without WebGL 2 get the basic 2D map with the same data.
 */
export default function LiveTransitMap(props) {
  const [basic, setBasic] = useState(() => mapEngine() === "basic");
  if (basic) {
    return (
      <div className={cn("relative overflow-hidden", props.className)} style={props.style}>
        <Suspense fallback={<div className="h-full w-full animate-pulse bg-muted" />}>
          <LiteMap vehicles={props.vehicles} stops={props.stops} userLocation={props.userLocation} followUser={!!props.followUser} focusVehicleId={props.focusVehicleId} focusKey={props.focusKey} fill />
        </Suspense>
      </div>
    );
  }
  return <FullMap {...props} onEngineFail={() => { markFullMapFailed(); setBasic(true); }} />;
}

function FullMap({
  vehicles = [],
  focusVehicleId = null,
  stops = [],
  routes = [], // so a tapped bus can show the stops on its own route
  looseStops = [], // stops drawn without a route line (e.g. every route at once)
  myStop = null,
  nextStopIndex = null,
  userLocation: givenLocation = null,
  followUser = false, // open on your own position instead of the buses
  callout = null,
  summary = null,
  topCard = null, // full screen: where you're going, across the top
  overlay = null, // desktop-only panel over the inline map (e.g. other buses)
  defaultSatellite = false,
  variant = "preview", // "preview" (on a scrolling page) | "page" (fills a screen)
  label = "Live map",
  focusKey = 0, // changes when a bus is picked outside the map, to fly to it
  className,
  style,
  onEngineFail,
}) {
  const isDark = useIsDark();
  const accent = mapAccentFor(isDark);
  const reduceMotion = usePrefersReducedMotion();
  const online = useOnline();
  const now = useNow();

  const mapRef = useRef(null);
  const layerRef = useRef(null);
  const calloutRef = useRef(null);
  const userMarkerRef = useRef(null);
  const stopMarkersRef = useRef([]);
  const routeRef = useRef({ line: [], followsRoads: false });
  const lastSplitRef = useRef(0);
  const fittedRef = useRef(false);
  const followRef = useRef(true);
  const stateRef = useRef({});

  const [loaded, setLoaded] = useState(false);
  const [styleTick, setStyleTick] = useState(0);
  const [follow, setFollow] = useState(true);
  const [is3D, setIs3D] = useState(true);
  const [satellite, setSatellite] = useState(defaultSatellite);
  const [fullscreen, setFullscreen] = useState(false);
  const [bearing, setBearing] = useState(0);
  const [selectedId, setSelectedId] = useState(null);
  // A stop tapped in the selected bus's list: shown as a small popup on the map.
  const [pickedStop, setPickedStop] = useState(null);
  const [routeLine, setRouteLine] = useState([]);

  // Your position: the page's own fix when it has one; otherwise the map asks
  // for it the first time "My location" is tapped.
  const [askMe, setAskMe] = useState(false);
  const own = useUserLocation(askMe && !givenLocation);
  const userLocation = givenLocation || own.location;
  const [waitingMe, setWaitingMe] = useState(false);
  const meCenteredRef = useRef(false);

  // One map container element that moves between the inline box and the
  // full-screen overlay, so the map (and its WebGL context) survives the switch.
  const mapEl = useMemo(() => {
    if (typeof document === "undefined") return null;
    const el = document.createElement("div");
    el.style.cssText = "position:absolute;inset:0";
    return el;
  }, []);
  const inlineHost = useRef(null);
  const fullHost = useRef(null);
  const calloutEl = useMemo(() => (typeof document === "undefined" ? null : document.createElement("div")), []);

  const located = useMemo(() => vehicles.filter((v) => v.current_lat != null && v.current_lng != null), [vehicles]);
  const focus = located.find((v) => v.id === focusVehicleId) || null;
  const focusFresh = focus ? freshnessOf(focus.last_location_update, { now }) : null;
  const orderedStops = useMemo(() => (stops || []).filter((s) => s.lat != null && s.lng != null), [stops]);
  const selected = located.find((v) => v.id === selectedId) || null;

  // The selected bus's own route and its stops, in order.
  const selectedStops = useMemo(() => {
    const route = selected ? (routes || []).find((r) => r.id === selected.route_id) : null;
    return (route?.stops || [])
      .filter((s) => s.lat != null && s.lng != null)
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  }, [routes, selected]);
  // How far away a tapped stop is: from the bus you picked (or the one you're
  // watching), otherwise from where you are.
  const pickedInfo = useMemo(() => {
    if (!pickedStop) return null;
    const bus = selected?.current_lat != null ? selected : focus?.current_lat != null ? focus : null;
    if (bus) return `${formatDistance(haversineKm(bus.current_lat, bus.current_lng, pickedStop.lat, pickedStop.lng) * 1000)} from ${bus.name || "the bus"}`;
    if (userLocation) return `${formatDistance(haversineKm(userLocation.lat, userLocation.lng, pickedStop.lat, pickedStop.lng) * 1000)} from you`;
    return "How far away is unknown";
  }, [pickedStop, selected, focus, userLocation]);

  stateRef.current = { focus, myStop, orderedStops, looseStops: (looseStops || []).filter((x) => x.lat != null && x.lng != null), located, userLocation, is3D, reduceMotion, accent, isDark };

  // --- Map lifecycle ------------------------------------------------------
  useEffect(() => {
    if (!mapEl || !inlineHost.current) return undefined;
    inlineHost.current.appendChild(mapEl);
    let map;
    try {
      map = new mapboxgl.Map({
        container: mapEl,
        accessToken: MAPBOX_TOKEN,
        style: defaultSatellite ? STYLE_SATELLITE : STYLE,
        projection: "mercator", // custom 3D layers assume a flat mercator world
        center: DEFAULT_VIEW.center,
        zoom: DEFAULT_VIEW.zoom,
        pitch: PITCH_3D,
        attributionControl: false,
        cooperativeGestures: variant === "preview",
        antialias: true,
        config: { basemap: { lightPreset: isDark ? "night" : "day", showPointOfInterestLabels: false, showTransitLabels: false } },
      });
    } catch {
      onEngineFail?.();
      return undefined;
    }
    mapRef.current = map;
    map.addControl(new mapboxgl.AttributionControl({ compact: true }), "bottom-right");

    const layer = createVehicleLayer({
      onFrame: (positions) => {
        const { focus: f } = stateRef.current;
        const p = f && positions[f.id];
        if (p && calloutRef.current) calloutRef.current.setLngLat(p.lngLat);
        // Re-split the route a few times a second as the bus glides.
        const t = performance.now();
        if (p && t - lastSplitRef.current > 400) {
          lastSplitRef.current = t;
          drawRouteSplit(map, p.lngLat);
        }
      },
    });
    layerRef.current = layer;

    map.on("style.load", () => {
      installLayers(map, layer, stateRef.current);
      setStyleTick((n) => n + 1);
    });
    map.on("load", () => setLoaded(true));
    map.on("error", (e) => {
      if (/webgl/i.test(e?.error?.message || "")) onEngineFail?.();
    });
    map.on("rotate", () => setBearing(map.getBearing()));
    const stopFollowing = (e) => {
      if (e?.originalEvent && followRef.current) { followRef.current = false; setFollow(false); }
    };
    map.on("dragstart", stopFollowing);
    map.on("zoomstart", stopFollowing);
    map.on("rotatestart", stopFollowing);
    map.on("click", (e) => setSelectedId(layer.pick(e.point, 34)));
    map.on("mousemove", (e) => { map.getCanvas().style.cursor = layer.pick(e.point, 34) ? "pointer" : ""; });

    return () => {
      calloutRef.current?.remove();
      userMarkerRef.current?.remove();
      stopMarkersRef.current.forEach((m) => m.remove());
      stopMarkersRef.current = [];
      map.remove();
      mapRef.current = null;
      mapEl.remove();
    };
     
  }, []);

  // Theme: swap the light preset (no style reload) and recolour our layers.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !styleTick) return;
    try { map.setConfigProperty("basemap", "lightPreset", isDark ? "night" : "day"); } catch { /* not a Standard style */ }
    paintRoute(map, accent, isDark, routeRef.current.followsRoads);
  }, [isDark, accent, styleTick]);

  // Street <-> satellite.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loaded) return;
    map.setStyle(satellite ? STYLE_SATELLITE : STYLE, {
      config: { basemap: { lightPreset: isDark ? "night" : "day", showPointOfInterestLabels: false, showTransitLabels: false } },
    });
     
  }, [satellite]);

  // 2D / 3D: tilt and terrain together.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !styleTick) return;
    try { map.setTerrain(is3D ? { source: "tt-dem", exaggeration: 1.15 } : null); } catch { /* terrain unavailable */ }
    map.easeTo({ pitch: is3D ? PITCH_3D : 0, duration: reduceMotion ? 0 : 700 });
     
  }, [is3D, styleTick]);

  // Full screen: move the map container, then let the map re-measure.
  useEffect(() => {
    const host = fullscreen ? fullHost.current : inlineHost.current;
    if (!host || !mapEl) return undefined;
    host.appendChild(mapEl);
    mapRef.current?.resize();
    // On the scrolling home page one finger scrolls the page; full screen is all map.
    try { mapRef.current?.setCooperativeGestures(variant === "preview" && !fullscreen); } catch { /* older engine */ }
    if (!fullscreen) return undefined;
    const onKey = (e) => { if (e.key === "Escape") setFullscreen(false); };
    window.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", onKey); document.body.style.overflow = prevOverflow; };
  }, [fullscreen, mapEl]);

  // --- Data -> map ----------------------------------------------------------
  useEffect(() => {
    const layer = layerRef.current;
    if (!layer) return;
    layer.setVehicles(
      located.map((v) => {
        const fresh = freshnessOf(v.last_location_update, { now });
        return {
          id: v.id,
          lng: v.current_lng,
          lat: v.current_lat,
          heading: Number.isFinite(v.heading) ? v.heading : undefined,
          modelId: modelIdFor(v),
          stale: !v.tracking_active || fresh.state === "lost" || fresh.state === "unknown",
          emphasis: v.id === focusVehicleId,
          alert: v.status === "emergency",
        };
      }),
      { accent, reduceMotion },
    );
  }, [located, focusVehicleId, accent, reduceMotion, now, styleTick]);

  // Road-following route through the stops; a straight dashed line until then.
  const stopsKey = orderedStops.map((s) => `${s.lng},${s.lat}`).join(";");
  useEffect(() => {
    let cancelled = false;
    const straight = orderedStops.map((s) => [s.lng, s.lat]);
    routeRef.current = { line: straight, followsRoads: false };
    setRouteLine(straight);
    if (straight.length < 2) return undefined;
    fetchDrivingRoute(orderedStops).then((res) => {
      if (cancelled || !res?.geometry?.length) return;
      routeRef.current = { line: res.geometry, followsRoads: true };
      setRouteLine(res.geometry);
    });
    return () => { cancelled = true; };
     
  }, [stopsKey]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !styleTick) return;
    const pos = layerRef.current?.positions()[focus?.id]?.lngLat || (focus ? [focus.current_lng, focus.current_lat] : null);
    paintRoute(map, accent, isDark, routeRef.current.followsRoads);
    drawRouteSplit(map, pos);
     
  }, [routeLine, styleTick, focus?.id]);

  // Stop markers: passed, next, your stop, others.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    stopMarkersRef.current.forEach((m) => m.remove());
    stopMarkersRef.current = [];
    const mineName = myStop?.name;
    orderedStops.forEach((s, i) => {
      if (s.name && s.name === mineName) return;
      const kind = nextStopIndex == null ? "upcoming" : i < nextStopIndex ? "passed" : i === nextStopIndex ? "next" : "upcoming";
      stopMarkersRef.current.push(new mapboxgl.Marker({ element: stopElement(kind, s.name || `Stop ${i + 1}`, () => setPickedStop(s)), anchor: "center" }).setLngLat([s.lng, s.lat]).addTo(map));
    });
    (looseStops || []).forEach((s) => {
      if (s.lat == null || s.lng == null || (s.name && s.name === mineName)) return;
      stopMarkersRef.current.push(new mapboxgl.Marker({ element: stopElement("upcoming", s.name || "Stop", () => setPickedStop(s)), anchor: "center" }).setLngLat([s.lng, s.lat]).addTo(map));
    });
    if (myStop?.lat != null) {
      stopMarkersRef.current.push(new mapboxgl.Marker({ element: stopElement("mine", myStop.name, () => setPickedStop(myStop)), anchor: "bottom" }).setLngLat([myStop.lng, myStop.lat]).addTo(map));
    }
  }, [orderedStops, looseStops, myStop, nextStopIndex, loaded]);

  // ETA callout that rides above the focus bus.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !calloutEl) return undefined;
    if (!callout || !focus) {
      calloutRef.current?.remove();
      calloutRef.current = null;
      return undefined;
    }
    if (!calloutRef.current) {
      calloutRef.current = new mapboxgl.Marker({ element: calloutEl, anchor: "left", offset: [30, -14] })
        .setLngLat([focus.current_lng, focus.current_lat])
        .addTo(map);
    }
    return undefined;
  }, [callout, focus, calloutEl, loaded]);

  // Your own position.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (!userLocation) { userMarkerRef.current?.remove(); userMarkerRef.current = null; return; }
    if (!userMarkerRef.current) {
      const el = document.createElement("div");
      el.className = "tt-map-me";
      el.setAttribute("role", "img");
      el.setAttribute("aria-label", "You are here");
      userMarkerRef.current = new mapboxgl.Marker({ element: el }).setLngLat([userLocation.lng, userLocation.lat]).addTo(map);
    } else {
      userMarkerRef.current.setLngLat([userLocation.lng, userLocation.lat]);
    }
  }, [userLocation?.lat, userLocation?.lng, loaded]);  

  // --- Camera ---------------------------------------------------------------
  const frame = (instant = false) => {
    const map = mapRef.current;
    if (!map) return;
    const s = stateRef.current;
    const busPt = s.focus ? [s.focus.current_lng, s.focus.current_lat] : null;
    const stopPt = s.myStop?.lat != null ? [s.myStop.lng, s.myStop.lat] : null;
    let pts = [busPt, stopPt].filter(Boolean);
    if (pts.length < 2) {
      pts = [...pts, ...s.orderedStops.map((x) => [x.lng, x.lat])];
      if (!pts.length) pts = [...s.located.map((v) => [v.current_lng, v.current_lat]), ...s.looseStops.map((x) => [x.lng, x.lat])];
      if (!pts.length && s.userLocation) pts = [[s.userLocation.lng, s.userLocation.lat]];
    }
    const b = boundsOf(pts);
    if (!b) return;
    const pitch = s.is3D ? PITCH_3D : 0;
    // Look from the bus towards your stop, like a driver would see the road.
    const look = busPt && stopPt ? bearingDeg(busPt, stopPt, 30) : null;
    const duration = instant || s.reduceMotion ? 0 : 1400;
    const single = b[0][0] === b[1][0] && b[0][1] === b[1][1];
    if (single) {
      map.easeTo({ center: b[0], zoom: 16, pitch, bearing: look ?? map.getBearing(), duration });
      return;
    }
    // Room for the callout beside the bus and the controls on the right.
    const { clientWidth: cw, clientHeight: ch } = map.getContainer();
    const padding = { top: Math.round(ch * 0.3), bottom: Math.round(ch * 0.12), left: Math.round(cw * 0.12), right: Math.round(cw * 0.2) };
    const camera = map.cameraForBounds(b, { padding, bearing: look ?? 0, pitch, maxZoom: 17 });
    if (camera) map.easeTo({ ...camera, pitch, bearing: look ?? 0, duration, essential: false });
  };

  // First view once the map and data are ready.
  useEffect(() => {
    if (!loaded || fittedRef.current) return;
    if (!focus && !myStop && !orderedStops.length && !located.length && !userLocation) return;
    fittedRef.current = true;
    if (followUser && userLocation && !focus) { meCenteredRef.current = true; goToMe(true); return; }
    frame(true);
     
  }, [loaded, focus?.id, myStop?.name, orderedStops.length, located.length, !!userLocation]);

  // Follow mode keeps the bus and your stop in view as new fixes arrive.
  useEffect(() => {
    if (!loaded || !follow || !fittedRef.current) return;
    frame(false);
     
  }, [focus?.current_lat, focus?.current_lng, follow]);

  // A bus picked from a list beside the map: follow it again.
  useEffect(() => {
    if (!loaded || !focusKey) return;
    followRef.current = true;
    setFollow(true);
    frame(false);
     
  }, [focusKey, loaded]);

  const recenter = () => {
    followRef.current = true;
    setFollow(true);
    frame(false);
  };

  const goToMe = (instant = false) => {
    const map = mapRef.current;
    const me = stateRef.current.userLocation;
    if (!map || !me) return;
    followRef.current = false;
    setFollow(false);
    map.easeTo({ center: [me.lng, me.lat], zoom: Math.max(map.getZoom(), 16), pitch: stateRef.current.is3D ? PITCH_3D : 0, duration: instant || reduceMotion ? 0 : 900 });
  };

  const showMe = () => {
    if (userLocation) { goToMe(); return; }
    // No fix yet: ask for one and go there as soon as it arrives.
    setWaitingMe(true);
    if (askMe) own.retry();
    else setAskMe(true);
  };

  // A fix that arrives after the map opened: go there if you asked for it,
  // or once on maps that open on your position (unless you moved the map).
  useEffect(() => {
    if (!loaded || !userLocation) return;
    if (waitingMe) { setWaitingMe(false); goToMe(); return; }
    if (followUser && !focus && !meCenteredRef.current && followRef.current) {
      meCenteredRef.current = true;
      goToMe(!fittedRef.current);
      fittedRef.current = true;
    }

  }, [loaded, !!userLocation, followUser, !!focus, waitingMe]);
  const locating = waitingMe && !userLocation && !own.error;
  const locateError = waitingMe && !userLocation ? own.error : "";

  // --- Overlays -------------------------------------------------------------
  const roomy = fullscreen || variant === "page";
  const freshState = focusFresh?.state === "unknown" ? null : focusFresh?.state;

  const overlays = (
    <>
      {fullscreen && topCard && <div className="absolute left-3 right-[4.25rem] top-3 z-20">{topCard}</div>}
      <div className={cn("pointer-events-none absolute left-3 z-10 flex max-w-[calc(100%-5.5rem)] flex-col items-start gap-1.5", fullscreen && topCard ? "top-[5.75rem]" : "top-3")}>
        {!online && <ConnectionPill state="offline" label="You're offline · last known positions" className="pointer-events-auto bg-background/92 backdrop-blur" />}
        {focus && freshState && (
          <ConnectionPill
            state={freshState}
            ageMs={freshState === "live" ? null : focusFresh.ageMs}
            label={freshState === "live" ? `${focus.name} live` : undefined}
            className="pointer-events-auto bg-background/92 backdrop-blur"
          />
        )}
        {locating && <p role="status" className="rounded-full bg-background/92 px-3 py-1.5 text-caption font-semibold shadow-md backdrop-blur">Finding your location…</p>}
        {locateError && <p role="alert" className="pointer-events-auto rounded-xl bg-background/92 px-3 py-1.5 text-caption font-semibold text-danger shadow-md backdrop-blur">{locateError}</p>}
      </div>

      <div className="absolute right-3 top-3 z-10 flex flex-col gap-2">
        <button
          type="button"
          className={TOOL}
          onClick={() => setFullscreen((f) => !f)}
          aria-label={fullscreen ? "Close full-screen map" : "Open full-screen map"}
          title={fullscreen ? "Close full screen" : "Full screen"}
        >
          {fullscreen ? <Shrink className="h-5 w-5" aria-hidden="true" /> : <Expand className="h-5 w-5" aria-hidden="true" />}
        </button>
        <button
          type="button"
          className={cn(TOOL, !follow && "ring-2 ring-primary")}
          onClick={recenter}
          aria-label={focus && myStop ? "Show the bus and your stop" : "Recenter the map"}
          aria-pressed={follow}
          title="Recenter and follow"
        >
          <Navigation className="h-5 w-5" aria-hidden="true" />
        </button>
        <button
          type="button"
          className={cn(TOOL, "text-xs font-bold")}
          onClick={() => setIs3D((v) => !v)}
          aria-label={is3D ? "Switch to flat 2D map" : "Switch to 3D map"}
          aria-pressed={is3D}
          title={is3D ? "2D view" : "3D view"}
        >
          {is3D ? "2D" : <Box className="h-5 w-5" aria-hidden="true" />}
        </button>
        <button type="button" className={cn(TOOL, locating && "animate-pulse")} onClick={showMe} aria-label="Show my location" title="My location">
          <LocateFixed className="h-5 w-5" aria-hidden="true" />
        </button>
        {roomy && (
          <>
            <button
              type="button"
              className={cn(TOOL, satellite && TOOL_ON)}
              onClick={() => setSatellite((v) => !v)}
              aria-label={satellite ? "Switch to street map" : "Switch to satellite map"}
              aria-pressed={satellite}
              title="Satellite"
            >
              <Satellite className="h-5 w-5" aria-hidden="true" />
            </button>
          </>
        )}
        {Math.abs(bearing) > 1 && (
          <button
            type="button"
            className={TOOL}
            onClick={() => mapRef.current?.easeTo({ bearing: 0, duration: reduceMotion ? 0 : 500 })}
            aria-label="Point the map north"
            title="North up"
          >
            <Compass className="h-5 w-5 transition-transform" style={{ transform: `rotate(${-bearing - 45}deg)` }} aria-hidden="true" />
          </button>
        )}
        {roomy && (
          <div className="hidden flex-col overflow-hidden rounded-full border border-border bg-background/92 shadow-md backdrop-blur sm:flex">
            <button type="button" className="grid h-11 w-11 place-items-center hover:bg-accent" onClick={() => mapRef.current?.zoomIn({ duration: reduceMotion ? 0 : 300 })} aria-label="Zoom in">
              <Plus className="h-5 w-5" aria-hidden="true" />
            </button>
            <span className="mx-2 h-px bg-border" />
            <button type="button" className="grid h-11 w-11 place-items-center hover:bg-accent" onClick={() => mapRef.current?.zoomOut({ duration: reduceMotion ? 0 : 300 })} aria-label="Zoom out">
              <Minus className="h-5 w-5" aria-hidden="true" />
            </button>
          </div>
        )}
      </div>

      {loaded && !located.length && (
        <div className="pointer-events-none absolute inset-x-0 top-16 z-10 flex justify-center px-4">
          <p className="rounded-full border border-border bg-background/92 px-3 py-1.5 text-body-sm text-muted-foreground shadow-md backdrop-blur">No buses are sharing their location right now</p>
        </div>
      )}

      {selected && (
        <div className="absolute inset-x-3 bottom-10 z-20 sm:left-3 sm:right-auto sm:w-80">
          <SelectedVehicle
            vehicle={selected}
            stops={selectedStops}
            now={now}
            userLocation={userLocation}
            onPickStop={setPickedStop}
            onClose={() => { setSelectedId(null); setPickedStop(null); }}
          />
        </div>
      )}
      {/* Stop tapped in the bus's list: its name and how far away it is. */}
      {pickedStop && (
        <div className="absolute inset-x-3 top-16 z-30 sm:left-1/2 sm:right-auto sm:w-80 sm:-translate-x-1/2">
          <div className="flex items-start gap-3 rounded-2xl border border-border bg-card/96 p-3 shadow-xl backdrop-blur" role="dialog" aria-label={`Stop details: ${pickedStop.name || ""}`}>
            <div className="min-w-0 flex-1">
              <p className="truncate font-semibold">{pickedStop.name || "Stop"}</p>
              <p className="text-body-sm text-muted-foreground">{pickedInfo}</p>
            </div>
            <button type="button" onClick={() => setPickedStop(null)} className="-m-1 grid h-9 w-9 shrink-0 place-items-center rounded-full hover:bg-accent" aria-label="Close stop details">
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        </div>
      )}
      {/* Kept above the Mapbox logo and attribution, which must stay visible. */}
      {!selected && fullscreen && summary && <div className="absolute inset-x-3 bottom-10 z-20 sm:left-3 sm:right-auto sm:w-96">{summary}</div>}
      {!selected && !fullscreen && overlay && <div className="absolute bottom-10 right-3 z-20 hidden w-80 lg:block">{overlay}</div>}
    </>
  );

  return (
    <>
      <div
        className={cn("relative isolate overflow-hidden bg-muted", className)}
        style={style}
        role="region"
        aria-label={label}
      >
        <div ref={inlineHost} className="absolute inset-0" />
        {!fullscreen && overlays}
        {fullscreen && (
          <div className="absolute inset-0 grid place-items-center text-body-sm text-muted-foreground">Map open in full screen</div>
        )}
      </div>
      {fullscreen &&
        createPortal(
          <div className="fixed inset-0 z-[60] bg-background" role="dialog" aria-modal="true" aria-label={`${label}, full screen`}>
            <div ref={fullHost} className="absolute inset-0" />
            {overlays}
          </div>,
          document.body,
        )}
      {calloutEl && callout && focus && createPortal(<EtaCallout {...callout} />, calloutEl)}
    </>
  );

  // --- helpers that need the closure --------------------------------------
  function drawRouteSplit(map, pos) {
    const line = routeRef.current.line;
    const src = map.getSource?.("tt-route-ahead");
    if (!src) return;
    const { travelled, ahead } = pos ? splitRoute(line, pos) : { travelled: [], ahead: line };
    src.setData(lineFeature(ahead));
    map.getSource("tt-route-done")?.setData(lineFeature(travelled));
    map.getSource("tt-route-casing")?.setData(lineFeature(line));
  }
}

function installLayers(map, layer, s) {
  try { map.setConfigProperty("basemap", "lightPreset", s.isDark ? "night" : "day"); } catch { /* not Standard */ }
  try { map.setConfigProperty("basemap", "showPointOfInterestLabels", false); } catch { /* not Standard */ }
  try { map.setConfigProperty("basemap", "showTransitLabels", false); } catch { /* not Standard */ }
  try {
    if (!map.getSource("tt-dem")) {
      map.addSource("tt-dem", { type: "raster-dem", url: "mapbox://mapbox.mapbox-terrain-dem-v1", tileSize: 512, maxzoom: 14 });
    }
    if (s.is3D) map.setTerrain({ source: "tt-dem", exaggeration: 1.15 });
  } catch { /* terrain unavailable: the map stays flat */ }

  ["tt-route-casing", "tt-route-done", "tt-route-ahead"].forEach((id) => {
    if (!map.getSource(id)) map.addSource(id, { type: "geojson", data: lineFeature([]) });
  });
  const round = { "line-cap": "round", "line-join": "round" };
  if (!map.getLayer("tt-route-casing")) addLayerInSlot(map, { id: "tt-route-casing", type: "line", source: "tt-route-casing", layout: round, paint: { "line-width": 10, "line-opacity": 0.55 } });
  if (!map.getLayer("tt-route-done")) addLayerInSlot(map, { id: "tt-route-done", type: "line", source: "tt-route-done", layout: round, paint: { "line-width": 5 } });
  if (!map.getLayer("tt-route-ahead")) addLayerInSlot(map, { id: "tt-route-ahead", type: "line", source: "tt-route-ahead", layout: round, paint: { "line-width": 6 } });
  paintRoute(map, s.accent, s.isDark, false);
  if (!map.getLayer(layer.id)) map.addLayer(layer);
}

function paintRoute(map, accent, isDark, followsRoads) {
  const set = (id, prop, value) => { try { if (map.getLayer(id)) map.setPaintProperty(id, prop, value); } catch { /* older style */ } };
  set("tt-route-casing", "line-color", isDark ? "#0A131C" : "#FFFFFF");
  set("tt-route-done", "line-color", isDark ? "#6E726C" : "#9EA29B");
  set("tt-route-done", "line-opacity", 0.75);
  set("tt-route-ahead", "line-color", accent);
  set("tt-route-ahead", "line-dasharray", followsRoads ? [1, 0] : [1.4, 1.2]);
  // Keep our lines at full brightness under the night light preset.
  ["tt-route-casing", "tt-route-done", "tt-route-ahead"].forEach((id) => set(id, "line-emissive-strength", 1));
}

function EtaCallout({ primary, secondary, tone = "live" }) {
  return (
    <div className="tt-map-callout pointer-events-none" data-tone={tone}>
      <span className="tt-map-callout__primary">{primary}</span>
      {secondary && <span className="tt-map-callout__secondary">{secondary}</span>}
    </div>
  );
}

function SelectedVehicle({ vehicle, stops = [], now, userLocation, onPickStop, onClose }) {
  const meta = vehicleStatusMeta(vehicle.status);
  const t = toneOf(meta.tone);
  const fresh = freshnessOf(vehicle.last_location_update, { now });
  const Icon = meta.icon;
  // How far the bus is from each of its stops.
  const away = (stop) => (vehicle.current_lat == null || stop.lat == null
    ? null
    : formatDistance(haversineKm(vehicle.current_lat, vehicle.current_lng, stop.lat, stop.lng) * 1000));
  return (
    <div className="rounded-2xl border border-border bg-card/96 p-4 shadow-xl backdrop-blur" role="dialog" aria-label={`${vehicle.name} details`}>
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-title-sm font-semibold">{vehicle.name}</p>
          <p className="mt-0.5 flex items-center gap-1.5 text-body-sm text-muted-foreground">
            <Icon className={cn("h-4 w-4 shrink-0", t.fg)} aria-hidden="true" />
            {vehicle.tracking_active ? meta.label : "Not sharing location"}
            {fresh.ageMs != null && <span>· updated {Math.round(fresh.ageMs / 60000) < 1 ? "just now" : `${Math.round(fresh.ageMs / 60000)} min ago`}</span>}
          </p>
        </div>
        <button type="button" onClick={onClose} className="-m-1 grid h-9 w-9 place-items-center rounded-full hover:bg-accent" aria-label="Close bus details">
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
      <dl className="mt-3 grid grid-cols-2 gap-2 text-body-sm">
        <div><dt className="text-muted-foreground">Plate</dt><dd className="font-medium">{vehicle.plate_number || "—"}</dd></div>
        <div><dt className="text-muted-foreground">Driver</dt><dd className="truncate font-medium">{vehicle.driver_name || "—"}</dd></div>
      </dl>
      <BusDistance vehicle={vehicle} userLocation={userLocation} />
      {stops.length > 0 && (
        <div className="mt-3 border-t border-border pt-2">
          <p className="text-caption font-semibold text-muted-foreground">Stops on this route ({stops.length})</p>
          <ul className="mt-1 max-h-44 space-y-0.5 overflow-y-auto pr-1">
            {stops.map((s, i) => (
              <li key={`${s.name || "stop"}-${i}`}>
                <button
                  type="button"
                  onClick={() => onPickStop?.(s)}
                  className="flex min-h-[36px] w-full items-center gap-2 rounded-lg px-2 text-left text-body-sm hover:bg-accent"
                  aria-label={`${s.name || `Stop ${i + 1}`}, ${away(s) || "distance unknown"}. Show on the map`}
                >
                  <span className="w-4 shrink-0 text-center font-display text-caption font-bold tabular-nums text-muted-foreground" aria-hidden="true">{i + 1}</span>
                  <span className="min-w-0 flex-1 truncate font-medium">{s.name || `Stop ${i + 1}`}</span>
                  <span className="shrink-0 tabular-nums text-muted-foreground">{away(s) || "—"}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}