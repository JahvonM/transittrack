import React, { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { Bus } from "lucide-react";
import { buildVehicle, disposeVehicle, setVehicleStale } from "./vehicleMesh";

/**
 * A still, three-quarter view of a vehicle's real 3D model (the same model
 * the live map draws), for places like the arrival hero. Rendered once per
 * change, no animation loop. Falls back to an icon without WebGL.
 */
export default function BusModelView({ modelId = "city_bus", accent = "#D6F54A", stale = false, className, label }) {
  const canvasRef = useRef(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    let renderer;
    try {
      renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, preserveDrawingBuffer: false });
    } catch {
      setFailed(true);
      return undefined;
    }
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    const scene = new THREE.Scene();
    scene.add(new THREE.AmbientLight(0xffffff, 1.1));
    const sun = new THREE.DirectionalLight(0xffffff, 1.8);
    sun.position.set(-8, -10, 14);
    scene.add(sun);
    const group = buildVehicle(modelId, { accent });
    setVehicleStale(group, stale);
    // Face the bus toward the viewer's left, nose slightly forward.
    group.rotation.z = THREE.MathUtils.degToRad(-62);
    scene.add(group);
    const len = group.userData.length || 12;
    const camera = new THREE.PerspectiveCamera(26, 1, 0.1, 200);
    camera.up.set(0, 0, 1);
    camera.position.set(-len * 0.95, -len * 1.45, len * 0.62);
    camera.lookAt(0, 0, 1.3);

    const draw = () => {
      const { clientWidth: w, clientHeight: h } = canvas;
      if (!w || !h) return;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.render(scene, camera);
    };
    draw();
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(draw) : null;
    ro?.observe(canvas);
    return () => {
      ro?.disconnect();
      disposeVehicle(group);
      renderer.dispose();
    };
  }, [modelId, accent, stale]);

  if (failed) {
    return (
      <div className={className} role="img" aria-label={label || "Bus"}>
        <Bus className="h-full w-full p-4 text-muted-foreground" aria-hidden="true" />
      </div>
    );
  }
  return <canvas ref={canvasRef} className={className} role="img" aria-label={label || "Bus"} />;
}
