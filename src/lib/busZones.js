// Bus parts shown on the X-ray inspection view. Each zone sits on one of the
// two X-ray views ("outside" = side view, "inside" = top-down cabin view) at
// an x/y in that view's SVG coordinates. The front of the bus faces right.
// BUS_ZONES is the city-bus layout; other layouts (BUS_LAYOUTS) move parts
// around and drop the ones that bus doesn't have.
export const BUS_ZONES = [
  // Outside (side view, viewBox 0 0 1000 400)
  { id: "lights_front", label: "Headlights & front signals", view: "outside", x: 944, y: 262 },
  { id: "windshield", label: "Windshield", view: "outside", x: 930, y: 140 },
  { id: "wipers", label: "Wipers & washers", view: "outside", x: 900, y: 214 },
  { id: "mirrors", label: "Mirrors", view: "outside", x: 978, y: 118 },
  { id: "front_door", label: "Front door", view: "outside", x: 848, y: 196 },
  { id: "rear_door", label: "Middle door", view: "outside", x: 548, y: 196 },
  { id: "tyres", label: "Wheels & tyres", view: "outside", x: 258, y: 324 },
  { id: "brakes", label: "Brakes & air system", view: "outside", x: 788, y: 324 },
  { id: "steering", label: "Steering", view: "outside", x: 868, y: 300 },
  { id: "suspension", label: "Suspension & chassis", view: "outside", x: 660, y: 318 },
  { id: "fuel", label: "Fuel tank & lines", view: "outside", x: 470, y: 302 },
  { id: "battery", label: "Battery & electrics", view: "outside", x: 370, y: 302 },
  { id: "transmission", label: "Transmission & driveline", view: "outside", x: 176, y: 296 },
  { id: "engine", label: "Engine & oil", view: "outside", x: 120, y: 236 },
  { id: "cooling", label: "Coolant & radiator", view: "outside", x: 122, y: 160 },
  { id: "exhaust", label: "Exhaust", view: "outside", x: 58, y: 318 },
  { id: "lights_rear", label: "Tail, brake & signal lights", view: "outside", x: 40, y: 250 },
  { id: "roof_ac", label: "Roof & A/C", view: "outside", x: 500, y: 44 },
  { id: "body", label: "Body & windows", view: "outside", x: 690, y: 120 },
  { id: "general", label: "Whole bus", view: "outside", x: 340, y: 180 },

  // Inside (top-down view, viewBox 0 0 1000 360)
  { id: "dashboard", label: "Dashboard & warning lights", view: "inside", x: 930, y: 176 },
  { id: "steering_wheel", label: "Steering wheel & horn", view: "inside", x: 890, y: 92 },
  { id: "driver_seat", label: "Driver seat & belt", view: "inside", x: 836, y: 92 },
  { id: "passenger_seats", label: "Passenger seats & belts", view: "inside", x: 470, y: 104 },
  { id: "floor", label: "Floor, aisle & cleanliness", view: "inside", x: 400, y: 180 },
  { id: "interior_lights", label: "Interior lights", view: "inside", x: 620, y: 180 },
  { id: "handrails", label: "Steps & handrails", view: "inside", x: 860, y: 262 },
  { id: "wheelchair", label: "Wheelchair space & ramp", view: "inside", x: 640, y: 258 },
  { id: "fire_extinguisher", label: "Fire extinguisher", view: "inside", x: 776, y: 150 },
  { id: "first_aid", label: "First aid kit", view: "inside", x: 776, y: 212 },
  { id: "emergency_exit", label: "Emergency exits & hammers", view: "inside", x: 120, y: 180 },
];

export const ZONE_BY_ID = Object.fromEntries(BUS_ZONES.map((z) => [z.id, z]));

// Drawing geometry for the front-engine layouts (shared by XrayBus).
export const FRONT_ENGINE_GEOMETRY = {
  front_engine: {
    x0: 40, x1: 974, roof: 64, frontWheel: 820, rearWheel: 300,
    frontDoor: [680, 70], rearDoor: [56, 60],
    windows: [[132, 210], [218, 296], [304, 382], [390, 468], [476, 554], [562, 640], [760, 836], [846, 896]],
    engine: [848, 200, 84, 84], cooling: [938, 206, 24, 64], trans: [800, 258], fuel: 430, battery: 540, airTank: 610,
    ac: [380, 240],
    inside: { topRows: [110, 170, 230, 290, 350, 410, 470, 530, 590, 650, 710], bottomRows: [110, 170, 230, 290, 350, 410, 470, 530, 590], driverSeat: 812, wheel: 890, engineCover: [862, 130, 46, 100], firstAid: [758, 70], fireExt: [842, 232], lights: [170, 290, 410, 530, 650], hatches: [300, 600] },
  },
  minibus: {
    x0: 150, x1: 900, roof: 92, frontWheel: 740, rearWheel: 340,
    frontDoor: [600, 64], rearDoor: [166, 56],
    windows: [[236, 300], [308, 372], [380, 444], [452, 516], [524, 588], [676, 752], [762, 822]],
    engine: [774, 200, 76, 84], cooling: [856, 206, 22, 64], trans: [728, 258], fuel: 420, battery: 500, airTank: 560,
    ac: [420, 200],
    inside: { topRows: [220, 276, 332, 388, 444, 500, 556, 612, 668], bottomRows: [220, 276, 332, 388, 444, 500], driverSeat: 728, wheel: 800, engineCover: [776, 130, 44, 100], firstAid: [758, 222], fireExt: [700, 222], lights: [260, 380, 500, 620], hatches: [330, 560] },
  },
};

// Where each part sits on the front-engine drawings, and parts those buses
// don't have (no wheelchair space).
const FRONT_ENGINE_SPOTS = {
  front_engine: {
    lights_front: [944, 262], windshield: [930, 120], wipers: [900, 200], mirrors: [978, 118], front_door: [715, 196],
    rear_door: [86, 196], tyres: [300, 324], brakes: [820, 324], steering: [880, 300], suspension: [230, 300],
    fuel: [476, 302], battery: [572, 302], transmission: [822, 250], engine: [890, 244], cooling: [950, 200],
    exhaust: [110, 318], lights_rear: [40, 250], roof_ac: [500, 44], body: [600, 120], general: [340, 180],
    dashboard: [940, 176], steering_wheel: [890, 92], driver_seat: [836, 92], passenger_seats: [440, 104], floor: [380, 180],
    interior_lights: [600, 180], handrails: [715, 262], fire_extinguisher: [850, 250], first_aid: [770, 84], emergency_exit: [120, 180],
  },
  minibus: {
    lights_front: [870, 262], windshield: [862, 150], wipers: [822, 196], mirrors: [906, 146], front_door: [632, 196],
    rear_door: [194, 210], tyres: [340, 324], brakes: [740, 324], steering: [800, 300], suspension: [270, 300],
    fuel: [466, 302], battery: [530, 302], transmission: [748, 256], engine: [806, 248], cooling: [874, 206],
    exhaust: [222, 318], lights_rear: [150, 250], roof_ac: [520, 74], body: [560, 130], general: [420, 190],
    dashboard: [838, 176], steering_wheel: [800, 72], driver_seat: [750, 100], passenger_seats: [400, 104], floor: [380, 180],
    interior_lights: [560, 180], handrails: [632, 262], fire_extinguisher: [712, 236], first_aid: [772, 236], emergency_exit: [230, 180],
  },
};

export const BUS_LAYOUTS = [
  { id: "front_engine", label: "Bus · engine in front, no wheelchair space", short: "Engine in front" },
  { id: "minibus", label: "Minibus / Coaster · engine in front", short: "Minibus" },
  { id: "city_rear", label: "City bus · engine at the back, wheelchair space", short: "City bus" },
];
export const DEFAULT_LAYOUT = "front_engine";
const LAYOUT_IDS = new Set(BUS_LAYOUTS.map((l) => l.id));
export const layoutOf = (template) => (LAYOUT_IDS.has(template?.xray_layout) ? template.xray_layout : DEFAULT_LAYOUT);

const LABELS = {
  front_engine: { rear_door: "Rear / emergency door", engine: "Engine & oil (front)", emergency_exit: "Emergency exits & roof hatches" },
  minibus: { rear_door: "Rear / emergency door", engine: "Engine & oil (front)", emergency_exit: "Emergency exits & roof hatches" },
};

const zonesCache = {};
// The parts (with their positions and names) for a layout.
export function layoutZones(layout = DEFAULT_LAYOUT) {
  const id = LAYOUT_IDS.has(layout) ? layout : DEFAULT_LAYOUT;
  if (zonesCache[id]) return zonesCache[id];
  let zones = BUS_ZONES;
  if (FRONT_ENGINE_SPOTS[id]) {
    const spots = FRONT_ENGINE_SPOTS[id];
    zones = BUS_ZONES.filter((z) => spots[z.id]).map((z) => ({ ...z, x: spots[z.id][0], y: spots[z.id][1], label: LABELS[id]?.[z.id] || z.label }));
  }
  zonesCache[id] = zones;
  return zones;
}
export function zoneById(layout) {
  return Object.fromEntries(layoutZones(layout).map((z) => [z.id, z]));
}

// Keyword rules, checked in order against the item name first and then its
// section name. Order matters: "brake lights" must hit lights before brakes,
// "transmission oil" must hit transmission before engine.
const RULES = [
  [/interior light|cabin light/, "interior_lights"],
  [/wiper|washer/, "wipers"],
  [/windshield|windscreen/, "windshield"],
  [/mirror/, "mirrors"],
  [/headlight|high beam|low beam|fog light|front light/, "lights_front"],
  [/brake light|tail|reverse light|rear light|marker light|hazard|turn signal|indicator lamp|signal/, "lights_rear"],
  [/warning light|warning indicator|dashboard|gauge|speedo|instrument/, "dashboard"],
  [/steering wheel|horn/, "steering_wheel"],
  [/driver.?s? seat/, "driver_seat"],
  [/steering|tie rod|drag link|ball joint/, "steering"],
  [/suspension|shock|spring|air bag|bushing|u-bolt|chassis/, "suspension"],
  [/brake|air leak|air pressure|air compressor|air dryer|air tank|air line|air valve|air system/, "brakes"],
  [/ramp|wheelchair|lift/, "wheelchair"],
  [/tire|tyre|wheel nut|lug nut|tread|wheel bearing|wheel/, "tyres"],
  [/coolant|radiator|thermostat|water pump|cooling/, "cooling"],
  [/exhaust|smoke|dpf|muffler/, "exhaust"],
  [/transmission|gear|clutch|driveshaft|universal joint|center bearing|differential|axle|drivetrain/, "transmission"],
  [/fuel|injector|diesel/, "fuel"],
  [/battery|alternator|starter|wiring|ground connection|fuse|relay|sensor|electrical/, "battery"],
  [/engine|oil|belt|mount/, "engine"],
  [/\bac\b|a\/c|air con|hvac|compressor|condenser|evaporator|blower|climate|heater/, "roof_ac"],
  [/door/, "front_door"],
  [/step|handrail|grab/, "handrails"],
  [/extinguisher/, "fire_extinguisher"],
  [/first aid/, "first_aid"],
  [/emergency exit|hammer|hatch/, "emergency_exit"],
  [/seat/, "passenger_seats"],
  [/floor|aisle|clean|interior|litter|rubbish/, "floor"],
  [/roof/, "roof_ac"],
  [/body|panel|paint|dent|window|glass|exterior/, "body"],
];

function matchZone(text) {
  const t = (text || "").toLowerCase();
  if (!t) return null;
  for (const [re, zone] of RULES) if (re.test(t)) return zone;
  return null;
}

// The zone an inspection item belongs to: its saved zone if valid, otherwise
// guessed from the item name, then the section name, then "Whole bus".
// On a layout without that part (e.g. no wheelchair space) it goes under
// "Whole bus" so the item still gets checked.
export function zoneFor(item, sectionName, layout = DEFAULT_LAYOUT) {
  const has = zoneById(layout);
  if (item?.zone && has[item.zone]) return item.zone;
  const z = matchZone(item?.item_name) || matchZone(sectionName) || "general";
  return has[z] ? z : "general";
}

// Flatten a template into a list of items, each with its zone and a stable key.
export function flattenTemplate(template) {
  const layout = layoutOf(template);
  const out = [];
  (template?.sections || []).forEach((sec, sIdx) => {
    (sec.items || []).forEach((it, iIdx) => {
      out.push({
        key: `${sIdx}-${iIdx}`,
        section_name: sec.section_name,
        item_name: it.item_name,
        critical: it.critical || "Medium",
        requires_photo: !!it.requires_photo,
        instructions: it.instructions || "",
        zone: zoneFor(it, sec.section_name, layout),
      });
    });
  });
  return out;
}

// Walk order for a guided inspection: outside first, going round the bus
// front → rear, then the cabin. Items keep their template order within a zone.
const WALK_ORDER = {
  city_rear: [
    "general", "mirrors", "windshield", "wipers", "lights_front", "front_door", "steering", "brakes",
    "body", "rear_door", "suspension", "fuel", "battery", "tyres", "transmission", "engine", "cooling",
    "exhaust", "lights_rear", "roof_ac",
    "handrails", "driver_seat", "steering_wheel", "dashboard", "fire_extinguisher", "first_aid",
    "wheelchair", "interior_lights", "passenger_seats", "floor", "emergency_exit",
  ],
  front_engine: [
    "general", "mirrors", "windshield", "wipers", "lights_front", "cooling", "engine", "steering", "brakes",
    "transmission", "front_door", "body", "battery", "fuel", "suspension", "tyres", "rear_door", "exhaust",
    "lights_rear", "roof_ac",
    "handrails", "driver_seat", "steering_wheel", "dashboard", "fire_extinguisher", "first_aid",
    "interior_lights", "passenger_seats", "floor", "emergency_exit",
  ],
};
WALK_ORDER.minibus = WALK_ORDER.front_engine;

export function walkOrder(items, layout = DEFAULT_LAYOUT) {
  const order = WALK_ORDER[layout] || WALK_ORDER[DEFAULT_LAYOUT];
  const all = BUS_ZONES.map((z) => z.id);
  const rank = (z) => { const i = order.indexOf(z); return i < 0 ? all.indexOf(z) + 100 : i; };
  return [...items].map((it, i) => ({ it, i })).sort((a, b) => rank(a.it.zone) - rank(b.it.zone) || a.i - b.i).map((x) => x.it);
}

// Per-zone status for the X-ray hotspots from a list of items + results map.
export function zoneStatus(items, results = {}) {
  const map = {};
  for (const it of items) {
    const s = (map[it.zone] ||= { total: 0, done: 0, failed: 0 });
    s.total += 1;
    const c = results[it.key]?.condition;
    if (c) s.done += 1;
    if (c === "FAILED") s.failed += 1;
  }
  return map;
}
