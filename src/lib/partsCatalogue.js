// Parts catalogue rules, kept apart from the screens so they can be tested:
// part numbers that match however they are typed, which numbers can replace a
// part (and which of those are already on the shelf), stock warnings, the
// parts that fit a bus model, and pins on a part picture.

// "90915-YZZD2", "90915 yzzd2" and "90915YZZD2" are one number.
export const partKey = (value) => String(value ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");

export const numbersOf = (part) => [part?.oem_number, part?.aftermarket_number].map(partKey).filter(Boolean);

export const KIND_LABEL = {
  newer_genuine: "Newer genuine number",
  older_genuine: "Older genuine number",
  aftermarket: "Aftermarket equivalent",
};
const REVERSED = { newer_genuine: "older_genuine", older_genuine: "newer_genuine", aftermarket: "aftermarket" };

// The numbers that can be used instead of this part. A replacement row reads
// both ways: if 90915-YZZD2 can be replaced by Z418, a Z418 on the shelf can
// be replaced by 90915-YZZD2. A newer genuine number seen from the other side
// is the older one.
export function replacementsFor(part, interchanges = []) {
  const mine = new Set(numbersOf(part));
  if (!mine.size) return [];
  const out = [];
  const seen = new Set();
  for (const row of interchanges) {
    const from = partKey(row.part_number), to = partKey(row.alt_number);
    let number, brand, kind;
    if (mine.has(from) && !mine.has(to)) { number = row.alt_number; brand = row.alt_brand || ""; kind = row.kind || "aftermarket"; }
    else if (mine.has(to) && !mine.has(from)) { number = row.part_number; brand = ""; kind = REVERSED[row.kind] || "aftermarket"; }
    else continue;
    const key = `${partKey(number)}|${row.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ row, number, brand, kind, isReversed: mine.has(to) });
  }
  // A wrong one stays listed, last, as a warning.
  return out.sort((a, b) => (a.row.status === "wrong") - (b.row.status === "wrong") || a.number.localeCompare(b.number));
}

// The other parts in stock under a given number.
export const partsNumbered = (number, parts = [], exceptId = null) => {
  const key = partKey(number);
  if (!key) return [];
  return parts.filter((p) => p.id !== exceptId && numbersOf(p).includes(key));
};

// Replacements of this part that are on the shelf now (not marked wrong).
export function inStockReplacements(part, parts, interchanges) {
  const out = [];
  for (const rep of replacementsFor(part, interchanges)) {
    if (rep.row.status === "wrong") continue;
    for (const other of partsNumbered(rep.number, parts, part.id)) {
      if (Number(other.quantity_in_stock) > 0 && !out.some((o) => o.part.id === other.id)) out.push({ part: other, replacement: rep });
    }
  }
  return out;
}

// "out" at none, "low" at or under the warning level, else "ok".
export function stockLevel(part) {
  const qty = Number(part?.quantity_in_stock) || 0;
  if (qty <= 0) return "out";
  const min = part?.min_stock;
  if (min !== null && min !== undefined && min !== "" && qty <= Number(min)) return "low";
  return "ok";
}

export function stockLabel(part) {
  const qty = Number(part?.quantity_in_stock) || 0;
  const level = stockLevel(part);
  if (level === "out") return { tone: "danger", text: "Out of stock" };
  if (level === "low") return { tone: "warning", text: `Low: ${qty} left` };
  return { tone: "neutral", text: `${qty} in stock` };
}

export const fitsGuide = (part, guideId) => Array.isArray(part?.guide_ids) && part.guide_ids.includes(guideId);
export const partsForGuide = (guideId, parts = []) => parts.filter((p) => fitsGuide(p, guideId));

// A part matches a search by its name, any of its numbers, where it's kept,
// its supplier, or the number of anything that can replace it.
export function partMatches(part, query, interchanges = []) {
  const words = String(query ?? "").toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  const replacementNumbers = replacementsFor(part, interchanges).map((r) => r.number);
  const hay = [part.part_name, part.oem_number, part.aftermarket_number, part.vehicle_compatibility, part.category, part.supplier, part.bin_location, ...replacementNumbers]
    .filter(Boolean).join(" ").toLowerCase();
  const compact = partKey(hay);
  return words.every((w) => hay.includes(w) || (partKey(w) && compact.includes(partKey(w))));
}

// The next free pin number on a picture.
export const nextPinNumber = (pins = []) => pins.reduce((max, p) => Math.max(max, Number(p.n) || 0), 0) + 1;

// Where a click landed on a picture, as 0–1 across and down.
export function pinPlace(clientX, clientY, rect) {
  const clamp = (v) => Math.min(1, Math.max(0, v));
  return {
    x: Math.round(clamp((clientX - rect.left) / rect.width) * 10000) / 10000,
    y: Math.round(clamp((clientY - rect.top) / rect.height) * 10000) / 10000,
  };
}

// Starter replacement numbers (src/data/partsCatalogue) as records, all
// unchecked; ones already saved (same pair of numbers) are left out.
export function starterInterchanges(rows = [], existing = []) {
  const have = new Set(existing.map((r) => `${partKey(r.part_number)}>${partKey(r.alt_number)}`));
  return rows
    .filter((r) => !have.has(`${partKey(r.part_number)}>${partKey(r.alt_number)}`))
    .map(({ part_number, alt_number, alt_brand, kind, applies_to, notes, source_name, source_link }) => {
      const row = { part_number, alt_number, status: "unchecked" };
      for (const [k, v] of Object.entries({ alt_brand, kind, applies_to, notes, source_name, source_link })) if (v) row[k] = v;
      return row;
    });
}
