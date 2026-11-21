// One search box for the whole Workshop: vehicles, parts (and their
// replacement numbers), torque values, specs & service, the maker's
// diagrams and the parts in them, and manuals. Everything is already loaded
// in the Workshop, so this runs on the tablet with no extra requests.
import { documentKindLabel, documentText, factText, guideTitle, matchesSearch, sectionLabel } from "@/lib/busLibrary";
import { partKey } from "@/lib/partsCatalogue";
import { searchCatalogue } from "@/lib/makerCatalogue";
import { groupMatches, modelCodeFor, nmText, systemLabel, torqueText, visibleParts } from "@/lib/workshop";

export const MIN_QUERY = 2;
export const PER_GROUP = 8;

const vehiclePath = (v) => `/workshop/${v.kind}/${v.id}`;

// The vehicle a model page's result opens on: the one a diagram was pasted
// for when there is one, else the first vehicle (buses first) that uses it.
function vehicleFor(vehicles, guideId, preferredId = "") {
  const using = vehicles.filter((v) => v.guide?.id === guideId);
  return using.find((v) => v.id === preferredId) || using[0] || null;
}

const cap = (hits) => ({ hits: hits.slice(0, PER_GROUP), more: Math.max(0, hits.length - PER_GROUP) });

export function workshopSearch(data = {}, query = "") {
  const q = String(query ?? "").trim();
  if (q.length < MIN_QUERY) return [];
  const { vehicles = [], parts = [], interchanges = [], specs = [], facts = [], groups = [], documents = [], guides = [] } = data;
  const pageName = (guideId) => guideTitle(guides.find((g) => g.id === guideId));
  const onVehicle = (guideId, section, preferredId) => {
    const v = vehicleFor(vehicles, guideId, preferredId);
    return v ? { to: `${vehiclePath(v)}${section}`, where: v.name } : { to: "", where: "No vehicle uses this model page yet" };
  };
  const out = [];

  // Vehicles: the chassis number can be searched, but is never shown here.
  const vehicleHits = vehicles.filter((v) => {
    const r = v.record || {};
    const code = modelCodeFor(v, groups.filter((g) => g.guide_id === v.guide?.id));
    const vin = partKey(r.vin);
    return matchesSearch(q, v.name, v.model, v.engine, v.transmission, r.make, r.model, r.year, r.plate_number, code)
      || (vin && partKey(q).length >= 4 && vin.includes(partKey(q)));
  }).map((v) => ({
    key: `vehicle:${v.kind}:${v.id}`, title: v.name, to: vehiclePath(v),
    subtitle: [v.model !== v.name ? v.model : "", v.engine].filter(Boolean).join(" · ") || (v.kind === "car" ? "Car" : "Bus"),
  }));
  if (vehicleHits.length) out.push({ id: "vehicles", label: "Vehicles", ...cap(vehicleHits) });

  const partHits = visibleParts(parts, interchanges, { query: q }).map((part) => ({
    key: `part:${part.id}`, title: part.part_name || "Part", to: `/workshop/parts/${part.id}`, part,
    subtitle: [part.oem_number, part.aftermarket_number, part.bin_location && `Kept at ${part.bin_location}`].filter(Boolean).join(" · "),
  }));
  if (partHits.length) out.push({ id: "parts", label: "Parts", ...cap(partHits) });

  const torqueHits = specs.filter((s) => matchesSearch(q, ...torqueText(s), pageName(s.guide_id))).map((s) => {
    const link = onVehicle(s.guide_id, "/torque");
    return {
      key: `torque:${s.id}`, title: s.item, to: link.to,
      subtitle: [nmText(s.nm) ? `${nmText(s.nm)} N·m` : s.stages, systemLabel(s.system), pageName(s.guide_id), link.where].filter(Boolean).join(" · "),
    };
  });
  if (torqueHits.length) out.push({ id: "torque", label: "Torque values", ...cap(torqueHits) });

  const factHits = facts.filter((f) => matchesSearch(q, ...factText(f), pageName(f.guide_id))).map((f) => {
    const link = onVehicle(f.guide_id, "/specs");
    return {
      key: `fact:${f.id}`, title: f.label, to: link.to,
      subtitle: [f.value, sectionLabel(f.section), pageName(f.guide_id), link.where].filter(Boolean).join(" · "),
    };
  });
  if (factHits.length) out.push({ id: "specs", label: "Specs & service", ...cap(factHits) });

  // The maker's diagrams by number or name, then the parts listed in them.
  const diagramHits = groups.filter((g) => groupMatches(g, q)).map((g) => {
    const link = onVehicle(g.guide_id, `/group/${g.id}`, g.vehicle_id);
    return { key: `diagram:${g.id}`, title: `${g.code} ${g.title}`, to: link.to, subtitle: [g.category, pageName(g.guide_id), link.where].filter(Boolean).join(" · ") };
  });
  const seen = new Set(diagramHits.map((h) => h.key));
  const catalogueHits = searchCatalogue(groups, q).map(({ group, part }, i) => {
    const link = onVehicle(group.guide_id, `/group/${group.id}`, group.vehicle_id);
    return {
      key: `catalogue:${group.id}:${part.ref || ""}:${part.number || ""}:${i}`, title: part.name || part.number, to: link.to, number: part.number,
      subtitle: [part.number, `on ${group.code} ${group.title}`, link.where].filter(Boolean).join(" · "),
    };
  });
  const makerHits = [...diagramHits, ...catalogueHits.filter((h) => !seen.has(h.key))];
  if (makerHits.length) out.push({ id: "catalogue", label: "Maker's diagrams", ...cap(makerHits) });

  const manualHits = documents.filter((d) => matchesSearch(q, ...documentText(d), pageName(d.guide_id))).map((d) => {
    const link = onVehicle(d.guide_id, "/manuals");
    return { key: `manual:${d.id}`, title: d.title, to: link.to, subtitle: [documentKindLabel(d.kind), pageName(d.guide_id), link.where].filter(Boolean).join(" · ") };
  });
  if (manualHits.length) out.push({ id: "manuals", label: "Manuals", ...cap(manualHits) });

  return out;
}
