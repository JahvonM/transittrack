// Model pages (the Workshop's specs & service and manuals; once the Bus
// library): one page per model, its facts and manuals. These helpers are the
// page's rules, kept apart from the screens so they can be tested: which buses a page covers, how facts are grouped and
// searched, and how a starter file becomes records.

export const SECTIONS = [
  { id: "specs", label: "Specs", hint: "Engine, gearbox, sizes and weights" },
  { id: "fluids", label: "Oils & fluids", hint: "Types and amounts" },
  { id: "service", label: "Service schedule", hint: "What to do, and how often" },
  { id: "tyres", label: "Tyres & wheels", hint: "Sizes, pressures, wheel nuts" },
  { id: "electrical", label: "Electrical", hint: "Battery, bulbs, fuses" },
  { id: "filters", label: "Filters, belts & part numbers", hint: "What to order" },
  { id: "torque", label: "Tightening torques", hint: "How tight" },
  { id: "problems", label: "Known problems", hint: "What goes wrong on this model, and the fix" },
  { id: "recalls", label: "Recalls & bulletins", hint: "Factory campaigns" },
  { id: "notes", label: "Our notes", hint: "What the team has learned" },
];
export const SECTION_IDS = new Set(SECTIONS.map((s) => s.id));
export const sectionLabel = (id) => SECTIONS.find((s) => s.id === id)?.label || "Notes";

export const FACT_STATUS = {
  unchecked: { label: "Not checked", tone: "warning" },
  checked: { label: "Checked", tone: "success" },
  wrong: { label: "Wrong", tone: "danger" },
};

export const DOCUMENT_KINDS = [
  { id: "owners_manual", label: "Owner's manual" },
  { id: "workshop_manual", label: "Workshop manual" },
  { id: "parts_list", label: "Parts list" },
  { id: "bulletin", label: "Service bulletin" },
  { id: "other", label: "Other" },
];
export const documentKindLabel = (id) => DOCUMENT_KINDS.find((k) => k.id === id)?.label || "Other";

// The same limit the upload function has.
export const MAX_DOCUMENT_BYTES = 25 * 1024 * 1024;

// "NV-350", "nv350" and "NV 350" are one model.
export const modelKey = (value) => String(value ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");

// A page covers a bus of its make and model whose year is in its range. A bus
// with no year recorded is covered by every page of its make and model.
export function covers(guide, bus) {
  if (!guide || !bus) return false;
  if (!modelKey(bus.make) || !modelKey(bus.model)) return false;
  if (modelKey(guide.make) !== modelKey(bus.make) || modelKey(guide.model) !== modelKey(bus.model)) return false;
  const year = Number(bus.year);
  if (!Number.isInteger(year) || year <= 0) return true;
  if (guide.year_from && year < guide.year_from) return false;
  if (guide.year_to && year > guide.year_to) return false;
  return true;
}

export const busesOf = (guide, vehicles = []) => vehicles.filter((bus) => covers(guide, bus));

// Buses with a make and model that no page covers yet.
export const uncoveredBuses = (guides = [], vehicles = []) =>
  vehicles.filter((bus) => modelKey(bus.make) && modelKey(bus.model) && !guides.some((g) => covers(g, bus)));

export function yearsLabel(guide) {
  const from = guide?.year_from, to = guide?.year_to;
  if (from && to) return from === to ? String(from) : `${from}–${to}`;
  if (from) return `${from} on`;
  if (to) return `up to ${to}`;
  return "all years";
}

export const guideTitle = (guide) => [guide?.make, guide?.model].filter(Boolean).join(" ") || "Bus model";

const number = (n) => Number(n).toLocaleString("en-US");
export function intervalLabel(fact) {
  const parts = [];
  if (fact?.interval_km > 0) parts.push(`${number(fact.interval_km)} km`);
  if (fact?.interval_months > 0) parts.push(`${number(fact.interval_months)} ${Number(fact.interval_months) === 1 ? "month" : "months"}`);
  return parts.length ? `Every ${parts.join(" or ")}` : "";
}

const byOrder = (a, b) =>
  (Number(a.sort_order) || 0) - (Number(b.sort_order) || 0) || String(a.label || "").localeCompare(String(b.label || ""));

// Facts by section, in the page's order; an unknown section counts as notes.
export function bySection(facts = []) {
  const out = new Map(SECTIONS.map((s) => [s.id, []]));
  for (const fact of facts) out.get(SECTION_IDS.has(fact.section) ? fact.section : "notes").push(fact);
  for (const list of out.values()) list.sort(byOrder);
  return out;
}

// Every word of the search appears somewhere in the record's text.
export function matchesSearch(query, ...texts) {
  const words = String(query ?? "").toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  const hay = texts.filter((t) => t != null && t !== "").join(" ").toLowerCase();
  return words.every((w) => hay.includes(w));
}

export const factText = (fact) => [fact.label, fact.value, fact.detail, fact.applies_to, fact.source_name, sectionLabel(fact.section)];
export const documentText = (doc) => [doc.title, doc.notes, doc.file_name, documentKindLabel(doc.kind)];

// show: "all", "unchecked" or "wrong".
export function visibleFacts(facts = [], { query = "", show = "all" } = {}) {
  return facts.filter((fact) => {
    const status = fact.status || "unchecked";
    if (show !== "all" && status !== show) return false;
    return matchesSearch(query, ...factText(fact));
  });
}

export function checkedCounts(facts = []) {
  const out = { total: facts.length, checked: 0, wrong: 0, unchecked: 0 };
  for (const fact of facts) out[FACT_STATUS[fact.status] ? fact.status : "unchecked"] += 1;
  return out;
}

// What to fix on a bus's own record before trusting its page. A VIN has 17
// characters; a Japanese frame number (KDH201-0123456) has a dash and is
// left alone.
export function busRecordWarnings(bus) {
  const out = [];
  if (!String(bus?.engine ?? "").trim()) out.push("Engine not recorded: the right oil, filters and belts depend on it.");
  if (!String(bus?.transmission ?? "").trim()) out.push("Gearbox not recorded.");
  const vin = String(bus?.vin ?? "").replace(/\s/g, "");
  if (vin && !vin.includes("-") && vin.length !== 17) {
    out.push(`Chassis number has ${vin.length} characters; a VIN has 17. Check it against the plate on the bus.`);
  }
  return out;
}

// A starter file (src/data/busLibrary) as the records it becomes. Every fact
// starts unchecked: research from the web is a lead, not a fact, until a
// mechanic confirms it on a bus or in a manual.
export function guideFromStarter(starter) {
  return {
    make: starter.make,
    model: starter.model,
    generation: starter.generation || "",
    year_from: starter.year_from ?? null,
    year_to: starter.year_to ?? null,
    engines: starter.engines || "",
    market: starter.market || "",
    summary: starter.summary || "",
    starter_key: starter.key,
  };
}

const FACT_FIELDS = ["section", "label", "value", "detail", "applies_to", "interval_km", "interval_months", "source_name", "source_link"];
export function starterFacts(starter, guideId) {
  return (starter.facts || []).map((fact, i) => {
    const row = { guide_id: guideId, status: "unchecked", sort_order: (i + 1) * 10 };
    for (const field of FACT_FIELDS) if (fact[field] !== undefined && fact[field] !== "") row[field] = fact[field];
    return row;
  });
}

export const unimportedStarters = (starters = [], guides = []) =>
  starters.filter((s) => !guides.some((g) => g.starter_key === s.key));

// Saves in batches the server accepts (it takes up to 500 at once).
export function chunks(list, size = 200) {
  const out = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}
