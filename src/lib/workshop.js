// The Workshop app (/workshop): every vehicle the workshop looks after (the
// buses, and the workshop's own cars), and for each its model page's torque
// values and bolt maps. These are the app's rules, kept apart from the
// screens so they can be tested.
import { checkedCounts, covers, guideFromStarter, matchesSearch } from "@/lib/busLibrary";

export const TORQUE_SYSTEMS = [
  { id: "wheels_brakes", label: "Wheels & brakes" },
  { id: "suspension_steering", label: "Suspension & steering" },
  { id: "engine", label: "Engine" },
  { id: "cooling", label: "Cooling" },
  { id: "fuel", label: "Fuel" },
  { id: "gearbox_axle", label: "Gearbox & axle" },
  { id: "body_electrical", label: "Body & electrical" },
];
const SYSTEM_IDS = new Set(TORQUE_SYSTEMS.map((s) => s.id));
export const systemLabel = (id) => TORQUE_SYSTEMS.find((s) => s.id === id)?.label || "Other";

// The server's limits (entityAccess, TorqueSpec).
export const MAX_NM = 2000;
export const TORQUE_TEXT_LIMITS = { item: 120, size: 40, stages: 300, sequence: 300, thread_lock: 120, applies_to: 200, source_name: 200 };

// 1 N·m is 0.7376 ft·lbf. Whole numbers, except under 10.
export function ftLb(nm) {
  const n = Number(nm);
  if (!Number.isFinite(n) || n <= 0) return "";
  const v = n * 0.737562;
  return v < 10 ? String(Math.round(v * 10) / 10) : String(Math.round(v));
}

export const nmText = (nm) => (Number(nm) > 0 ? String(Number(nm)) : "");

const byOrder = (a, b) =>
  (Number(a.sort_order) || 0) - (Number(b.sort_order) || 0) || String(a.item || "").localeCompare(String(b.item || ""));

// Torque values by part of the vehicle, in the app's order, leaving out
// parts with none. An unknown part counts as body & electrical.
export function torqueBySystem(specs = []) {
  const out = new Map(TORQUE_SYSTEMS.map((s) => [s.id, []]));
  for (const spec of specs) out.get(SYSTEM_IDS.has(spec.system) ? spec.system : "body_electrical").push(spec);
  for (const [id, list] of out) {
    if (!list.length) out.delete(id);
    else list.sort(byOrder);
  }
  return out;
}

export const torqueText = (spec) => [spec.item, spec.size, spec.stages, spec.sequence, spec.thread_lock, spec.applies_to, systemLabel(spec.system), spec.new_bolt ? "new bolt" : ""];

// show: "all", "unchecked" or "wrong".
export function visibleTorque(specs = [], { query = "", show = "all" } = {}) {
  return specs.filter((spec) => {
    if (show !== "all" && (spec.status || "unchecked") !== show) return false;
    return matchesSearch(query, ...torqueText(spec));
  });
}

export const torqueCounts = (specs = []) => checkedCounts(specs);

// ----- vehicles -----

// The model page for a vehicle: the one that covers its make, model and year;
// a page with a year range is closer than one for every year.
export function guideFor(vehicle, guides = []) {
  const all = guides.filter((g) => covers(g, vehicle));
  return all.find((g) => g.year_from || g.year_to) || all[0] || null;
}

const nameOf = (v) => String(v?.name || "").trim();
const modelLine = (v) => [v?.make, v?.model, v?.year].filter(Boolean).join(" ");

// Every vehicle on the Home screen: the buses first, then the workshop's cars.
export function workshopVehicles(buses = [], cars = [], guides = []) {
  const row = (kind) => (v) => ({
    kind,
    id: v.id,
    name: nameOf(v) || modelLine(v) || (kind === "bus" ? "Bus" : "Car"),
    model: modelLine(v),
    engine: String(v.engine || "").trim(),
    transmission: String(v.transmission || "").trim(),
    record: v,
    guide: guideFor(v, guides),
  });
  const byName = (a, b) => a.name.localeCompare(b.name, undefined, { numeric: true });
  return [...buses.map(row("bus")).sort(byName), ...cars.map(row("car")).sort(byName)];
}

export const findVehicle = (vehicles, kind, id) => vehicles.find((v) => v.kind === kind && v.id === id) || null;

// ----- forms -----

export const blankTorque = (system = "wheels_brakes") => ({
  system, item: "", size: "", nm: "", stages: "", sequence: "", new_bolt: false, thread_lock: "", applies_to: "", source_name: "", source_link: "",
});

export const torqueForm = (spec) => ({
  ...blankTorque(spec.system || "wheels_brakes"),
  ...Object.fromEntries(Object.keys(blankTorque()).filter((k) => spec[k] != null).map((k) => [k, k === "nm" ? nmText(spec[k]) : spec[k]])),
  new_bolt: spec.new_bolt === true,
});

// What a form saves; an empty Nm is saved as none.
export function torqueData(form) {
  const trim = (k) => String(form[k] ?? "").trim();
  const nm = trim("nm").replace(",", ".");
  return {
    system: SYSTEM_IDS.has(form.system) ? form.system : "wheels_brakes",
    item: trim("item"),
    size: trim("size"),
    nm: nm === "" ? null : Number(nm),
    stages: trim("stages"),
    sequence: trim("sequence"),
    new_bolt: form.new_bolt === true,
    thread_lock: trim("thread_lock"),
    applies_to: trim("applies_to"),
    source_name: trim("source_name"),
    source_link: trim("source_link"),
  };
}

// The reason a form can't be saved yet, or "".
export function torqueProblem(form) {
  const data = torqueData(form);
  if (!data.item) return "Say which bolt it is.";
  if (data.nm !== null && !(Number.isFinite(data.nm) && data.nm > 0 && data.nm <= MAX_NM)) return `The torque is a number of N·m, up to ${MAX_NM}.`;
  if (data.source_link && !/^https:\/\//i.test(data.source_link)) return "The source link must start with https://";
  for (const [field, max] of Object.entries(TORQUE_TEXT_LIMITS)) if (data[field].length > max) return "One of the boxes is too long.";
  return "";
}

export const blankCar = () => ({ name: "", make: "", model: "", year: "", engine: "", transmission: "", plate_number: "", vin: "", notes: "" });
export const carForm = (car) => ({ ...blankCar(), ...Object.fromEntries(Object.keys(blankCar()).filter((k) => car[k] != null).map((k) => [k, String(car[k])])) });
export function carData(form) {
  const trim = (k) => String(form[k] ?? "").trim();
  const year = trim("year");
  return {
    name: trim("name"), make: trim("make"), model: trim("model"),
    year: year === "" ? null : Number(year),
    engine: trim("engine"), transmission: trim("transmission"),
    plate_number: trim("plate_number"), vin: trim("vin").toUpperCase(), notes: trim("notes"),
  };
}
export function carProblem(form) {
  const data = carData(form);
  if (!data.name || !data.make || !data.model) return "A car needs a name, make and model.";
  if (data.year !== null && !(Number.isInteger(data.year) && data.year >= 1900 && data.year <= 2100)) return "The year is four digits, like 2013.";
  return "";
}

// ----- starter torque tables (src/data/workshop/torque) -----

const torqueKey = (spec) => `${spec.system}|${String(spec.item || "").trim().toLowerCase()}`;
const STARTER_FIELDS = ["system", "item", "size", "nm", "stages", "sequence", "new_bolt", "thread_lock", "applies_to", "source_name", "source_link"];

// The page a starter's values go on: the page made from the same starter.
export const starterGuide = (starter, guides = []) => guides.find((g) => g.starter_key === starter.guide_key) || null;

// A starter's values not on its page yet (the same bolt in the same part of
// the vehicle counts as there), as records: every one "Not checked".
export function starterTorque(starter, guideId, existing = []) {
  const have = new Set(existing.filter((s) => s.guide_id === guideId).map(torqueKey));
  const start = existing.filter((s) => s.guide_id === guideId).reduce((max, s) => Math.max(max, Number(s.sort_order) || 0), 0);
  return (starter.torque || [])
    .filter((spec) => !have.has(torqueKey(spec)))
    .map((spec, i) => {
      const row = { guide_id: guideId, status: "unchecked", sort_order: start + (i + 1) * 10 };
      for (const field of STARTER_FIELDS) if (spec[field] !== undefined && spec[field] !== "") row[field] = spec[field];
      return row;
    });
}

// What Models › Ready to add offers: each starter with values still to add.
// One without a page makes its page first when it has one to make; a bus
// page comes from the Bus library.
export function readyTorque(starters = [], guides = [], specs = []) {
  const out = [];
  for (const starter of starters) {
    const guide = starterGuide(starter, guides);
    if (guide) {
      const count = starterTorque(starter, guide.id, specs).length;
      if (count) out.push({ starter, guide, count, needsPage: false, blocked: false });
    } else {
      out.push({ starter, guide: null, count: (starter.torque || []).length, needsPage: !!starter.page, blocked: !starter.page });
    }
  }
  return out;
}

export const pageFromStarter = (starter) => guideFromStarter({ ...starter.page, key: starter.guide_key });

// ----- the catalogue (a parts catalogue's layout) -----

// The maker's categories on a model page, in the catalogue's own order, each
// with its diagrams: "Engine / Fuel / Tool" → 1502 OIL FILTER, 2302 FUEL FILTER…
export function catalogueCategories(groups = []) {
  const out = new Map();
  const sorted = [...groups].sort((a, b) => (Number(a.sort_order) || 0) - (Number(b.sort_order) || 0) || String(a.code).localeCompare(String(b.code)));
  for (const g of sorted) {
    const key = String(g.category || "").trim() || "Other";
    if (!out.has(key)) out.set(key, []);
    out.get(key).push(g);
  }
  return out;
}

// The team's photo of one of the maker's diagrams.
export const pictureForGroup = (group, diagrams = []) => (group ? diagrams.find((d) => d.catalogue_group_id === group.id) || null : null);

// Every word of the filter in a diagram's number or name.
export const groupMatches = (group, query) => matchesSearch(query, group.code, group.title, group.detail);

// The chassis code the maker's catalogue knows a vehicle by (pasted with its
// list of diagrams).
export const modelCodeFor = (vehicle, groups = []) =>
  groups.find((g) => g.vehicle_id === vehicle?.id && String(g.model_code || "").trim())?.model_code || "";

// What a pin is called on its picture: the number on the maker's diagram
// when it has one, else its own number.
export const pinLabel = (pin) => String(pin?.ref || "").trim() || String(pin?.n ?? "");

// The rows of a diagram's table, each with the key its pins share: on a
// photo of a maker's diagram, the maker's parts list (a pin points at a row
// by the row's number on the drawing); on any other picture, its pins.
export function diagramRows({ group = null, pins = [] } = {}) {
  if (group) {
    return (group.parts || []).map((part, i) => {
      const ref = String(part.ref || "").trim();
      return { key: ref ? `ref:${ref}` : `row:${i}`, ref, part, pins: ref ? pins.filter((p) => String(p.ref || "").trim() === ref) : [] };
    });
  }
  return [...pins].sort((a, b) => a.n - b.n).map((pin) => ({ key: `pin:${pin.n}`, ref: String(pin.n), part: null, pins: [pin] }));
}

// The row key a pin highlights.
export const pinKey = (pin, grouped) => (grouped && String(pin?.ref || "").trim() ? `ref:${String(pin.ref).trim()}` : `pin:${pin?.n}`);

// The numbers on a maker's diagram, once each, for choosing a pin's row.
export const groupRefs = (group) => {
  const seen = new Map();
  for (const part of group?.parts || []) {
    const ref = String(part.ref || "").trim();
    if (ref && !seen.has(ref)) seen.set(ref, part);
  }
  return [...seen].map(([ref, part]) => ({ ref, part }));
};

// A category's name in a page address: "Engine / Fuel / Tool" → engine-fuel-tool.
export const categorySlug = (name) => String(name || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "other";
