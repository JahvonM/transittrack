// 3D map models a vehicle can be drawn as (Vehicle.model_3d). Sizes are the
// box in px: w (width), l (length), h (height). stripe: "accent" follows the
// chosen colour theme. decks: 2 draws two rows of windows.
export const VEHICLE_MODELS = [
  { id: "city_bus", label: "City bus", w: 22, l: 54, h: 19, body: "#F4F4F0", side: "#D9DAD3", roof: "#FFFFFF", stripe: "accent", roofUnit: "ac" },
  { id: "coach", label: "Coach", w: 22, l: 60, h: 22, body: "#D5DAE1", side: "#AEB6C2", roof: "#E6EAF0", stripe: "#1E3A8A", roofUnit: "ac", tallGlass: true },
  { id: "school_bus", label: "School bus", w: 22, l: 52, h: 19, body: "#F5B700", side: "#D99E00", roof: "#FFC928", stripe: "#1C1C1F" },
  { id: "double_decker", label: "Double-decker", w: 22, l: 52, h: 30, body: "#D62828", side: "#B01E1E", roof: "#E63946", stripe: "#FFD166", decks: 2 },
  { id: "electric_bus", label: "Electric bus", w: 22, l: 56, h: 19, body: "#EAF7EF", side: "#C5E6D1", roof: "#F5FFF8", stripe: "#10B981", roofUnit: "battery" },
  { id: "minibus", label: "Minibus", w: 20, l: 40, h: 18, body: "#FFFFFF", side: "#DCDCDC", roof: "#F2F2F2", stripe: "#2563EB" },
  { id: "shuttle_van", label: "Shuttle van", w: 19, l: 34, h: 16, body: "#C7CCD4", side: "#A3AAB5", roof: "#D9DDE3", stripe: "#1C1C1F" },
  { id: "taxi", label: "Taxi", w: 19, l: 32, h: 13, body: "#F7C948", side: "#DDAE2E", roof: "#FFD95E", stripe: "#1C1C1F", roofUnit: "taxi" },
  { id: "sedan", label: "Sedan", w: 19, l: 32, h: 13, body: "#1F2937", side: "#111827", roof: "#374151", stripe: "#9CA3AF" },
];

const BY_ID = Object.fromEntries(VEHICLE_MODELS.map((m) => [m.id, m]));

export function getModel(id) {
  return BY_ID[id] || BY_ID.city_bus;
}

// The model to draw a vehicle with: its chosen one, else a sensible default.
export function modelIdFor(vehicle) {
  if (vehicle?.model_3d && BY_ID[vehicle.model_3d]) return vehicle.model_3d;
  return vehicle?.type === "taxi" ? "taxi" : "city_bus";
}
