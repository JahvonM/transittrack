import * as THREE from "three";
import mapboxgl from "mapbox-gl";
import { buildVehicle, setVehicleStale, disposeVehicle } from "./vehicleMesh";
import { createTrack, movedTo, retarget, step, turnTo } from "@/lib/vehicleMotion";

// While buses move the map redraws about 30 times a second: smooth to the
// eye, and half the work (and battery) of redrawing every frame.
const MOVING_FRAME_MS = 33;
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
 * terrain. Buses move steadily between GPS fixes and turn to face the
 * direction of travel (src/lib/vehicleMotion.js). Purely visual: it never
 * changes vehicle data.
 */
export function createVehicleLayer({ id = "tt-vehicles", onFrame } = {}) {
  const vehicles = new Map();
  let map = null;
  let renderer = null;
  const camera = new THREE.Camera();
  let accent = "#D6F54A";
  let reduceMotion = false;
  let repaintTimer = null;

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
        if (step(v, now)) moving = true;
        if (!v.scene) return; // tracked only (a bus shown by its photo marker)
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
      if (moving && !repaintTimer) repaintTimer = setTimeout(() => { repaintTimer = null; map?.triggerRepaint(); }, MOVING_FRAME_MS);
    },
    onRemove() {
      clearTimeout(repaintTimer);
      repaintTimer = null;
      vehicles.forEach((v) => { if (v.group) disposeVehicle(v.group); });
      vehicles.clear();
      renderer?.dispose?.();
      renderer = null;
      map = null;
    },
  };

  // [{ id, lng, lat, heading?, modelId, stale, emphasis, alert, hidden }]
  // hidden: moved like the others but not drawn (its photo marker follows
  // layer.positions() instead).
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
      if (v && (accentChanged || v.modelId !== item.modelId || v.emphasis !== !!item.emphasis || v.alert !== !!item.alert || v.hidden !== !!item.hidden)) {
        if (v.group) disposeVehicle(v.group);
        vehicles.delete(item.id);
        v = { ...v, rebuilt: true };
      }
      if (!vehicles.has(item.id)) {
        const group = item.hidden ? null : buildVehicle(item.modelId, { accent });
        // Red ring for an emergency (staff views only), lime for the bus you follow.
        if (group && item.alert) group.add(ringMesh("#FF5A5F"));
        else if (group && item.emphasis) group.add(ringMesh(accent));
        // A rebuilt model (new colour or ring) keeps its motion; a bus seen
        // for the first time appears where it is.
        const track = v?.current ? { ...v } : createTrack(to, now, item.heading ?? 0);
        vehicles.set(item.id, {
          ...track, id: item.id, group, scene: group ? makeScene(group) : null, modelId: item.modelId, emphasis: !!item.emphasis, alert: !!item.alert, hidden: !!item.hidden,
        });
        v = vehicles.get(item.id);
        if (movedTo(v, to)) retarget(v, to, now, { heading: item.heading, snap: reduceMotion || !!item.stale });
      } else if (movedTo(v, to)) {
        retarget(v, to, now, { heading: item.heading, snap: reduceMotion || !!item.stale });
      } else if (item.heading != null) {
        turnTo(v, item.heading, now, { snap: reduceMotion });
      }
      if (v.group) setVehicleStale(v.group, !!item.stale);
    });
    vehicles.forEach((v, key) => {
      if (!seen.has(key)) { if (v.group) disposeVehicle(v.group); vehicles.delete(key); }
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
      if (v.hidden) return; // its photo marker takes the tap
      const p = map.project(v.current);
      const d = Math.hypot(p.x - point.x, p.y - point.y);
      if (d <= radiusPx && (!best || d < best.d)) best = { id: key, d };
    });
    return best?.id || null;
  };

  return layer;
}
