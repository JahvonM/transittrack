import * as THREE from "three";
import mapboxgl from "mapbox-gl";
import { buildVehicle, setVehicleStale, disposeVehicle } from "./vehicleMesh";
import { bearingDeg, distanceM, lerpHeading } from "./routeGeometry";

const GLIDE_MS = 2600; // shorter than the GPS interval, so a bus settles before the next fix
const rad = (d) => (d * Math.PI) / 180;

function makeScene(group) {
  const scene = new THREE.Scene();
  scene.add(new THREE.AmbientLight(0xffffff, 0.9));
  const sun = new THREE.DirectionalLight(0xffffff, 1.6);
  sun.position.set(-40, -60, 90); // from the south-west, above
  scene.add(sun);
  scene.add(group);
  return scene;
}

function ringMesh(color) {
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(5.2, 6.4, 48),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, depthWrite: false }),
  );
  ring.position.z = 0.05;
  return ring;
}

/**
 * Mapbox custom layer that draws vehicles as real 3D models (three.js),
 * sharing the map's depth buffer so they sit among 3D buildings and on
 * terrain. Positions glide between GPS fixes and turn to face the direction
 * of travel. Purely visual: it never changes vehicle data.
 */
export function createVehicleLayer({ id = "tt-vehicles", onFrame } = {}) {
  const vehicles = new Map();
  let map = null;
  let renderer = null;
  const camera = new THREE.Camera();
  let accent = "#D6F54A";
  let reduceMotion = false;

  const layer = {
    id,
    type: "custom",
    renderingMode: "3d",
    onAdd(m, gl) {
      map = m;
      renderer = new THREE.WebGLRenderer({ canvas: m.getCanvas(), context: gl, antialias: true });
      renderer.autoClear = false;
    },
    render(gl, matrix) {
      if (!map || !renderer) return;
      const now = performance.now();
      // Keep vehicles readable when zoomed out: a bus stays about 45px long
      // on screen, and is drawn at true size from street level (zoom 18) in.
      const boost = Math.min(64, Math.max(1, Math.pow(2, 18 - map.getZoom())));
      const projection = new THREE.Matrix4().fromArray(matrix);
      let moving = false;
      vehicles.forEach((v) => {
        const t = v.dur ? Math.min(1, (now - v.t0) / v.dur) : 1;
        const e = 1 - Math.pow(1 - t, 3);
        v.current = [v.from[0] + (v.to[0] - v.from[0]) * e, v.from[1] + (v.to[1] - v.from[1]) * e];
        v.heading = lerpHeading(v.hFrom, v.hTo, e);
        if (t < 1) moving = true;
        let elevation = 0;
        try { elevation = map.queryTerrainElevation?.(v.current) || 0; } catch { elevation = 0; }
        const merc = mapboxgl.MercatorCoordinate.fromLngLat(v.current, elevation);
        const s = merc.meterInMercatorCoordinateUnits() * boost * (v.emphasis ? 1.12 : 1);
        const model = new THREE.Matrix4()
          .makeTranslation(merc.x, merc.y, merc.z)
          .scale(new THREE.Vector3(s, -s, s))
          .multiply(new THREE.Matrix4().makeRotationZ(rad(-v.heading)));
        camera.projectionMatrix = projection.clone().multiply(model);
        renderer.resetState();
        renderer.render(v.scene, camera);
      });
      onFrame?.(layer.positions());
      if (moving) map.triggerRepaint();
    },
    onRemove() {
      vehicles.forEach((v) => disposeVehicle(v.group));
      vehicles.clear();
      renderer?.dispose?.();
      renderer = null;
      map = null;
    },
  };

  // [{ id, lng, lat, heading?, modelId, stale, emphasis }]
  layer.setVehicles = (list, opts = {}) => {
    const now = performance.now();
    if (opts.reduceMotion != null) reduceMotion = opts.reduceMotion;
    const accentChanged = opts.accent && opts.accent !== accent;
    if (opts.accent) accent = opts.accent;
    const seen = new Set();
    list.forEach((item) => {
      if (!Number.isFinite(item.lng) || !Number.isFinite(item.lat)) return;
      seen.add(item.id);
      const to = [item.lng, item.lat];
      let v = vehicles.get(item.id);
      if (v && (accentChanged || v.modelId !== item.modelId || v.emphasis !== !!item.emphasis)) {
        disposeVehicle(v.group);
        vehicles.delete(item.id);
        v = { ...v, rebuilt: true };
      }
      if (!vehicles.has(item.id)) {
        const group = buildVehicle(item.modelId, { accent });
        if (item.emphasis) group.add(ringMesh(accent));
        const start = v?.current || to;
        const heading = item.heading ?? v?.heading ?? 0;
        vehicles.set(item.id, {
          id: item.id, group, scene: makeScene(group), modelId: item.modelId, emphasis: !!item.emphasis,
          from: start, to, current: start, t0: now, dur: v && !reduceMotion ? GLIDE_MS : 0,
          hFrom: heading, hTo: heading, heading,
        });
        v = vehicles.get(item.id);
      } else if (distanceM(v.to, to) > 0.5) {
        const travel = bearingDeg(v.current, to);
        v.from = v.current;
        v.to = to;
        v.t0 = now;
        v.dur = reduceMotion ? 0 : GLIDE_MS;
        v.hFrom = v.heading;
        v.hTo = item.heading ?? travel ?? v.heading;
      } else if (item.heading != null && Math.abs(item.heading - v.hTo) > 1) {
        v.hFrom = v.heading;
        v.hTo = item.heading;
        v.t0 = now;
        v.dur = reduceMotion ? 0 : 800;
      }
      setVehicleStale(v.group, !!item.stale);
    });
    vehicles.forEach((v, key) => {
      if (!seen.has(key)) { disposeVehicle(v.group); vehicles.delete(key); }
    });
    map?.triggerRepaint();
  };

  // Current (animated) positions, for labels and callouts that follow vehicles.
  layer.positions = () => {
    const out = {};
    vehicles.forEach((v, key) => { out[key] = { lngLat: v.current, heading: v.heading }; });
    return out;
  };

  // Which vehicle (if any) is under a screen point, for taps on the map.
  layer.pick = (point, radiusPx = 30) => {
    if (!map) return null;
    let best = null;
    vehicles.forEach((v, key) => {
      const p = map.project(v.current);
      const d = Math.hypot(p.x - point.x, p.y - point.y);
      if (d <= radiusPx && (!best || d < best.d)) best = { id: key, d };
    });
    return best?.id || null;
  };

  return layer;
}
