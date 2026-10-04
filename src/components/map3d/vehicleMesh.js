import * as THREE from "three";
import { getModel } from "@/lib/vehicleModels";

// Real-world size (metres) for each catalogue model. The catalogue in
// lib/vehicleModels describes paint and details; these give true scale so a
// bus sits correctly among Mapbox's 3D buildings.
const SIZE = {
  city_bus: { l: 12, w: 2.55, h: 3.2, wheels: 2 },
  coach: { l: 13, w: 2.55, h: 3.6, wheels: 3 },
  school_bus: { l: 11, w: 2.4, h: 3.0, wheels: 2 },
  double_decker: { l: 11, w: 2.55, h: 4.4, wheels: 2 },
  electric_bus: { l: 12.2, w: 2.55, h: 3.3, wheels: 2 },
  minibus: { l: 7.5, w: 2.2, h: 2.8, wheels: 2 },
  shuttle_van: { l: 6, w: 2.0, h: 2.5, wheels: 2 },
  taxi: { l: 4.7, w: 1.8, h: 1.5, wheels: 2, car: true },
  sedan: { l: 4.7, w: 1.8, h: 1.45, wheels: 2, car: true },
};

const GLASS = 0x0f1720;
const TYRE = 0x15171a;
const STALE = new THREE.Color(0x8a8e88);

function mat(color, opts = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.55, metalness: 0.08, ...opts });
}

function box(w, l, h, material, x = 0, y = 0, z = 0) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, l, h), material);
  mesh.position.set(x, y, z + h / 2);
  return mesh;
}

/**
 * Builds a vehicle in local metres: +x east (width), +y forward (length),
 * +z up. The group's origin is the centre of the vehicle at road level, so
 * placing it on the map is a single translate + rotate.
 */
export function buildVehicle(modelId, { accent = "#D6F54A" } = {}) {
  const spec = getModel(modelId);
  const size = SIZE[spec.id] || SIZE.city_bus;
  const { l, w, h } = size;
  const group = new THREE.Group();
  const stripeColor = spec.stripe === "accent" ? accent : spec.stripe;

  const body = mat(spec.body);
  const side = mat(spec.side);
  const roof = mat(spec.roof, { roughness: 0.4 });
  const glass = mat(GLASS, { roughness: 0.15, metalness: 0.4 });
  const stripe = mat(stripeColor, { roughness: 0.4 });
  const tyre = mat(TYRE, { roughness: 0.9 });
  const lightFront = mat(0xfff7d6, { emissive: 0xfff2b0, emissiveIntensity: 0.9 });
  const lightRear = mat(0xff3b30, { emissive: 0xff2a1f, emissiveIntensity: 0.8 });

  const clearance = size.car ? 0.18 : 0.32;
  const bodyH = h - clearance;

  if (size.car) {
    // Lower body + a narrower glass cabin on top.
    group.add(box(w, l, bodyH * 0.5, body, 0, 0, clearance));
    group.add(box(w * 0.86, l * 0.52, bodyH * 0.42, glass, 0, -l * 0.04, clearance + bodyH * 0.5));
    group.add(box(w * 0.8, l * 0.4, 0.06, roof, 0, -l * 0.04, clearance + bodyH * 0.92));
    group.add(box(w + 0.02, l * 0.9, 0.12, stripe, 0, 0, clearance + bodyH * 0.32));
    if (spec.roofUnit === "taxi") group.add(box(0.5, 0.25, 0.22, mat(0xfff3c4, { emissive: 0xffe58a, emissiveIntensity: 0.6 }), 0, -l * 0.04, h));
  } else {
    const decks = spec.decks || 1;
    // Main shell and a slightly darker skirt.
    group.add(box(w, l, bodyH, body, 0, 0, clearance));
    group.add(box(w + 0.01, l + 0.01, bodyH * 0.16, side, 0, 0, clearance));
    // Window bands down both sides, one per deck.
    for (let d = 0; d < decks; d++) {
      const bandH = bodyH * (decks === 2 ? 0.26 : spec.tallGlass ? 0.42 : 0.34);
      const bandZ = clearance + bodyH * (decks === 2 ? 0.2 + d * 0.44 : 0.44);
      group.add(box(w + 0.04, l * 0.84, bandH, glass, 0, -l * 0.02, bandZ));
    }
    // Livery stripe under the windows.
    group.add(box(w + 0.05, l * 0.98, bodyH * 0.07, stripe, 0, 0, clearance + bodyH * (decks === 2 ? 0.1 : 0.32)));
    // Windscreen and rear window.
    group.add(box(w * 0.9, 0.06, bodyH * 0.5, glass, 0, l / 2, clearance + bodyH * 0.38));
    group.add(box(w * 0.8, 0.06, bodyH * 0.3, glass, 0, -l / 2, clearance + bodyH * 0.55));
    // Roof cap and air-con / battery pod.
    group.add(box(w * 0.98, l * 0.98, 0.08, roof, 0, 0, h - 0.08));
    if (spec.roofUnit) group.add(box(w * 0.6, l * 0.22, 0.32, roof, 0, -l * 0.12, h));
    // Head and tail lights.
    group.add(box(0.36, 0.05, 0.16, lightFront, -w * 0.32, l / 2 + 0.01, clearance + 0.3));
    group.add(box(0.36, 0.05, 0.16, lightFront, w * 0.32, l / 2 + 0.01, clearance + 0.3));
    group.add(box(0.3, 0.05, 0.4, lightRear, -w * 0.38, -l / 2 - 0.01, clearance + 0.35));
    group.add(box(0.3, 0.05, 0.4, lightRear, w * 0.38, -l / 2 - 0.01, clearance + 0.35));
  }

  // Wheels: one axle near the front, the rest at the back.
  const r = size.car ? 0.34 : 0.5;
  const wheelGeo = new THREE.CylinderGeometry(r, r, 0.32, 18);
  wheelGeo.rotateZ(Math.PI / 2);
  const axles = size.wheels === 3 ? [l * 0.32, -l * 0.25, -l * 0.36] : [l * 0.3, -l * 0.3];
  axles.forEach((y) => {
    [-1, 1].forEach((sideSign) => {
      const wheel = new THREE.Mesh(wheelGeo, tyre);
      wheel.position.set(sideSign * (w / 2 - 0.12), y, r);
      group.add(wheel);
    });
  });

  // Soft contact shadow so the vehicle reads as sitting on the road.
  const shadow = new THREE.Mesh(
    new THREE.PlaneGeometry(w * 1.25, l * 1.08),
    new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.28, depthWrite: false }),
  );
  shadow.position.z = 0.03;
  group.add(shadow);

  // Remember original colours so stale vehicles can be greyed and restored.
  group.traverse((o) => {
    if (o.isMesh && o.material?.color) o.userData.baseColor = o.material.color.clone();
    if (o.isMesh && o.material && o.material.userData.baseEmissive == null) o.material.userData.baseEmissive = o.material.emissiveIntensity ?? 0;
  });
  group.userData.length = l;
  return group;
}

// Grey out a vehicle whose position is out of date (and restore it).
export function setVehicleStale(group, stale) {
  if (group.userData.stale === stale) return;
  group.userData.stale = stale;
  const seen = new Set();
  group.traverse((o) => {
    if (!o.isMesh || !o.userData.baseColor || seen.has(o.material)) return;
    seen.add(o.material);
    if (stale) o.material.color.copy(o.userData.baseColor).lerp(STALE, 0.75);
    else o.material.color.copy(o.userData.baseColor);
    if (o.material.emissiveIntensity != null) o.material.emissiveIntensity = stale ? 0 : o.material.userData.baseEmissive;
  });
}

export function disposeVehicle(group) {
  group.traverse((o) => {
    if (o.isMesh) {
      o.geometry?.dispose();
      o.material?.dispose?.();
    }
  });
}
