// The maker's catalogue on a Bus library page: Toyota's or Nissan's own list
// of diagrams and the parts on each, pasted in from Partsouq one page at a
// time (the drawings themselves are theirs and are not kept). These read the
// copied text: the list of diagrams, and one diagram's parts table.
import { NUMBER_WORD, cleanName, partKey, partsByNumber } from "@/lib/partsCatalogue";

const lines = (text) => String(text ?? "").split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

// A diagram in the list:
//   Toyota  "1502 OIL FILTER"
//   Nissan  "150A-001-01 150A-001 LUBRICATING SYSTEM ; YD25DDTI (1206 - 2006)"
const NISSAN = /^(?:\d{3}[A-Z]?-\d{3}-\d{2}\s+)?(\d{3}[A-Z]?-\d{3})\s+(\S.*)$/;
const TOYOTA = /^(\d{4}[A-Z]?)\s+([A-Z0-9][A-Z0-9 ,.&/()'+-]*[A-Z)])$/;
const COUNT = /\s*\(\d+\)\s*$/;
// Page text around the list that is not a heading.
const FURNITURE = /^(filter all diagrams|search|categories|groups|parts diagrams for|catalogs\b|to garage|garage\b|part description|vin\b|\+\d+$)/i;

function splitTitle(rest) {
  const parts = rest.split(/\s*;\s*/).filter(Boolean);
  // What follows the name: the engine and dates, e.g. "YD25DDTI (1206 - 2006)".
  const detail = parts.length > 1 && /\d/.test(parts[parts.length - 1]) ? parts.pop() : "";
  const title = [...new Set(parts)].join(" · ");
  return { title, detail };
}

export function parseDiagramIndex(text) {
  const out = [];
  const seen = new Set();
  let category = "";
  let previous = "";
  for (const line of lines(text)) {
    const n = NISSAN.exec(line);
    const t = !n && TOYOTA.exec(line);
    if (n || t) {
      // The heading is the line just before a run of diagrams.
      if (previous) { category = previous; previous = ""; }
      const code = (n || t)[1];
      if (seen.has(code)) continue;
      seen.add(code);
      const { title, detail } = n ? splitTitle(n[2]) : { title: t[2].trim(), detail: "" };
      out.push({ category, code, title, detail });
    } else {
      previous = FURNITURE.test(line) || line.includes(":") ? "" : line.replace(COUNT, "");
    }
  }
  return out;
}

// One diagram's parts, copied from its table: on a computer each row comes
// with tabs between the cells; from a phone each cell is often on a line of
// its own. Each part has a part number (letters, digits and dashes with at
// least five digits, so an engine code like YD25DDTI isn't one; the longest
// in a row when there are two); the cell before it is the number on the
// drawing, the first cell with letters after it the name, a small number the
// quantity, and anything else the catalogue's notes.
const HEADER = /^(no\.?|#|ref|pos\.?|part\s*(number|no\.?)|number|name|description|qty|quantity|code|info|notes?|price|amount)$/i;
const digits = (cell) => (String(cell).match(/\d/g) || []).length;
const isNumber = (cell) => NUMBER_WORD.test(cell) && partKey(cell).length >= 6 && digits(cell) >= 5;
const isQty = (cell) => /^\d{1,3}$/.test(cell) || /^\d{1,3}\s*(pcs?|x)$/i.test(cell);

function rowToPart(cells) {
  let at = -1;
  cells.forEach((c, i) => { if (isNumber(c) && (at < 0 || partKey(c).length > partKey(cells[at]).length)) at = i; });
  if (at < 0) return null;
  const number = cells[at].toUpperCase();
  const ref = at > 0 && cells[at - 1].length <= 12 ? cells[at - 1] : "";
  const rest = cells.slice(at + 1);
  const nameAt = rest.findIndex((c) => /[a-z]{3}/i.test(c) && !HEADER.test(c));
  const name = nameAt >= 0 ? cleanName(rest[nameAt].split(/\s+/), { keepEnd: true }) : "";
  const left = rest.filter((_, i) => i !== nameAt);
  const qtyAt = left.findIndex(isQty);
  const qty = qtyAt >= 0 ? left[qtyAt].replace(/\D/g, "") : "";
  const info = left.filter((_, i) => i !== qtyAt).join(" · ").slice(0, 300);
  return { ref, number, name, qty, info };
}

export function parsePartsList(text) {
  const all = lines(text);
  let rows;
  if (all.some((l) => l.includes("\t"))) {
    rows = all.map((l) => l.split("\t").map((c) => c.trim()).filter(Boolean));
  } else {
    // One cell per line: a row starts at the cell before each part number
    // (its number on the drawing), unless that cell is the quantity the row
    // before it still needs.
    rows = [];
    let row = null;
    let before = [];
    for (const line of all) {
      if (!isNumber(line)) { (row || before).push(line); continue; }
      const holder = row || before;
      const prev = holder[holder.length - 1];
      const shortCode = prev && prev.length <= 12 && !isNumber(prev) && !/[a-z]{3}/i.test(prev);
      const neededAsQty = row && /^\d{1,3}$/.test(prev) && !row.slice(0, -1).some(isQty);
      const ref = shortCode && !neededAsQty ? holder.pop() : null;
      if (row?.length) rows.push(row);
      row = ref ? [ref, line] : [line];
      before = [];
    }
    if (row?.length) rows.push(row);
  }
  const out = [];
  const seen = new Set();
  for (const cells of rows) {
    if (cells.every((c) => HEADER.test(c))) continue;
    const part = rowToPart(cells);
    if (!part) continue;
    const key = `${part.ref}|${partKey(part.number)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(part);
  }
  return out.slice(0, 400);
}

// ----- on the page -----

export const groupLabel = (g) => [g?.code, g?.title].filter(Boolean).join(" ");

// Diagrams in the catalogue's own order, by category.
export function byCategory(groups = []) {
  const out = new Map();
  const sorted = [...groups].sort((a, b) => (Number(a.sort_order) || 0) - (Number(b.sort_order) || 0) || String(a.code).localeCompare(String(b.code)));
  for (const g of sorted) {
    const key = g.category || "Other";
    if (!out.has(key)) out.set(key, []);
    out.get(key).push(g);
  }
  return out;
}

export const progress = (groups = []) => ({ total: groups.length, done: groups.filter((g) => (g.parts || []).length > 0).length });

// Every part in the catalogue that matches: by its number however it's
// typed, or by every word in its name or its diagram's name.
export function searchCatalogue(groups = [], query = "") {
  const q = String(query).trim();
  if (!q) return [];
  const key = partKey(q);
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  const hits = [];
  for (const group of groups) {
    for (const part of group.parts || []) {
      const byNumber = key.length >= 3 && partKey(part.number).includes(key);
      const hay = `${part.name} ${part.info} ${group.title}`.toLowerCase();
      if (byNumber || words.every((w) => hay.includes(w))) hits.push({ group, part });
      if (hits.length >= 100) return hits;
    }
  }
  return hits;
}

// What's on the shelf under a catalogue part's number.
export const stockIndex = (stock = []) => partsByNumber(stock);
export const stockFor = (part, index) => index.get(partKey(part?.number)) || [];

// New diagrams from a pasted list, leaving out those already on the page.
export function newGroups(parsed = [], existing = [], { guideId, vehicleId = "", modelCode = "" } = {}) {
  const have = new Set(existing.map((g) => g.code));
  const start = existing.reduce((max, g) => Math.max(max, Number(g.sort_order) || 0), 0);
  return parsed
    .filter((g) => !have.has(g.code))
    .map((g, i) => ({
      guide_id: guideId, vehicle_id: vehicleId, model_code: modelCode,
      category: g.category, code: g.code, title: g.title, detail: g.detail, parts: [], sort_order: start + (i + 1) * 10,
    }));
}
