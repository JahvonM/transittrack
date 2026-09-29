// Bus parts shown on the X-ray inspection view. Each zone sits on one of the
// two X-ray views ("outside" = side view, "inside" = top-down cabin view) at
// an x/y in that view's SVG coordinates. The front of the bus faces right.
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
  [/tire|tyre|wheel nut|lug nut|tread|wheel bearing|wheel/, "tyres"],
  [/coolant|radiator|thermostat|water pump|cooling/, "cooling"],
  [/exhaust|smoke|dpf|muffler/, "exhaust"],
  [/transmission|gear|clutch|driveshaft|universal joint|center bearing|differential|axle|drivetrain/, "transmission"],
  [/fuel|injector|diesel/, "fuel"],
  [/battery|alternator|starter|wiring|ground connection|fuse|relay|sensor|electrical/, "battery"],
  [/engine|oil|belt|mount/, "engine"],
  [/\bac\b|a\/c|air con|hvac|compressor|condenser|evaporator|blower|climate|heater/, "roof_ac"],
  [/ramp|wheelchair|lift/, "wheelchair"],
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
export function zoneFor(item, sectionName) {
  if (item?.zone && ZONE_BY_ID[item.zone]) return item.zone;
  return matchZone(item?.item_name) || matchZone(sectionName) || "general";
}

// Flatten a template into a list of items, each with its zone and a stable key.
export function flattenTemplate(template) {
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
        zone: zoneFor(it, sec.section_name),
      });
    });
  });
  return out;
}

// Walk order for a guided inspection: outside first, going round the bus
// front → rear, then the cabin. Items keep their template order within a zone.
const WALK = BUS_ZONES.map((z) => z.id);
const WALK_ORDER = [
  "general", "mirrors", "windshield", "wipers", "lights_front", "front_door", "steering", "brakes",
  "body", "rear_door", "suspension", "fuel", "battery", "tyres", "transmission", "engine", "cooling",
  "exhaust", "lights_rear", "roof_ac",
  "handrails", "driver_seat", "steering_wheel", "dashboard", "fire_extinguisher", "first_aid",
  "wheelchair", "interior_lights", "passenger_seats", "floor", "emergency_exit",
];
export function walkOrder(items) {
  const rank = (z) => { const i = WALK_ORDER.indexOf(z); return i < 0 ? WALK.indexOf(z) + 100 : i; };
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
