import { describe, it, expect } from "vitest";
import {
  inStockReplacements, nextPinNumber, numbersOf, partKey, partMatches, partsForGuide, pinPlace,
  replacementsFor, starterInterchanges, stockLabel, stockLevel,
} from "../partsCatalogue.js";
import REPLACEMENTS from "../../data/partsCatalogue/replacements.json";

const oil = { id: "p1", part_name: "Oil filter (genuine)", oem_number: "90915-YZZD2", quantity_in_stock: 0, min_stock: 2, guide_ids: ["g1"] };
const ryco = { id: "p2", part_name: "Ryco oil filter", aftermarket_number: "Z418", quantity_in_stock: 6, bin_location: "Shelf B2" };
const wesfil = { id: "p3", part_name: "Wesfil oil filter", aftermarket_number: "wz 418", quantity_in_stock: 0 };
const rows = [
  { id: "x1", part_number: "90915 yzzd2", alt_number: "Z418", alt_brand: "Ryco", kind: "aftermarket", status: "checked" },
  { id: "x2", part_number: "90915-YZZD2", alt_number: "WZ418", alt_brand: "Wesfil", kind: "aftermarket" },
  { id: "x3", part_number: "90915-YZZD1", alt_number: "90915-YZZD2", kind: "newer_genuine" },
  { id: "x4", part_number: "90915-YZZD2", alt_number: "C-1123", alt_brand: "Sakura", kind: "aftermarket", status: "wrong" },
];

describe("part numbers", () => {
  it("match however they are typed", () => {
    expect(partKey("90915-yzzd2")).toBe(partKey("90915 YZZD2"));
    expect(numbersOf({ oem_number: "a-1", aftermarket_number: "" })).toEqual(["A1"]);
  });
});

describe("what can replace a part", () => {
  it("reads replacement rows both ways, with the genuine order flipped", () => {
    const list = replacementsFor(oil, rows);
    expect(list.map((r) => r.number)).toEqual(["90915-YZZD1", "WZ418", "Z418", "C-1123"]);
    // YZZD2 is the newer number for YZZD1, so YZZD1 is the older one for YZZD2.
    expect(list.find((r) => r.number === "90915-YZZD1").kind).toBe("older_genuine");
    // The Ryco filter can be replaced by the genuine one.
    expect(replacementsFor(ryco, rows).map((r) => r.number)).toEqual(["90915 yzzd2"]);
    expect(replacementsFor({ part_name: "No number" }, rows)).toEqual([]);
  });

  it("finds replacements on the shelf, skipping empty stock and ones marked wrong", () => {
    const found = inStockReplacements(oil, [oil, ryco, wesfil, { id: "p4", aftermarket_number: "C1123", quantity_in_stock: 3 }], rows);
    expect(found.map((f) => f.part.id)).toEqual(["p2"]);
  });
});

describe("stock", () => {
  it("warns at or under the warning level, and when out", () => {
    expect(stockLevel(oil)).toBe("out");
    expect(stockLevel({ quantity_in_stock: 2, min_stock: 2 })).toBe("low");
    expect(stockLevel({ quantity_in_stock: 3, min_stock: 2 })).toBe("ok");
    expect(stockLevel({ quantity_in_stock: 1, min_stock: null })).toBe("ok");
    expect(stockLevel({ quantity_in_stock: 1, min_stock: "" })).toBe("ok");
    expect(stockLabel({ quantity_in_stock: 2, min_stock: 2 })).toEqual({ tone: "warning", text: "Low: 2 left" });
    expect(stockLabel(ryco)).toEqual({ tone: "neutral", text: "6 in stock" });
  });
  it("lists the parts that fit a model", () => {
    expect(partsForGuide("g1", [oil, ryco]).map((p) => p.id)).toEqual(["p1"]);
  });
});

describe("searching parts", () => {
  it("finds a part by any number, its shelf, or a number that replaces it", () => {
    expect(partMatches(oil, "yzzd2", rows)).toBe(true);
    expect(partMatches(oil, "z418", rows)).toBe(true);
    expect(partMatches(ryco, "shelf b2", rows)).toBe(true);
    expect(partMatches(ryco, "brake", rows)).toBe(false);
    expect(partMatches(wesfil, "WZ418", [])).toBe(true);
  });
});

describe("pins", () => {
  it("number on from the highest, and land where the picture was tapped", () => {
    expect(nextPinNumber([])).toBe(1);
    expect(nextPinNumber([{ n: 1 }, { n: 4 }])).toBe(5);
    expect(pinPlace(150, 75, { left: 100, top: 50, width: 200, height: 100 })).toEqual({ x: 0.25, y: 0.25 });
    expect(pinPlace(0, 999, { left: 100, top: 50, width: 200, height: 100 })).toEqual({ x: 0, y: 1 });
  });
});

describe("starter replacement numbers", () => {
  it("are added once, unchecked", () => {
    const fresh = starterInterchanges(REPLACEMENTS, [{ part_number: "90915 yzzd2", alt_number: "z418" }]);
    expect(fresh).toHaveLength(REPLACEMENTS.length - 1);
    expect(fresh.every((r) => r.status === "unchecked")).toBe(true);
  });

  it("are well formed and sourced", () => {
    const pairs = new Set();
    for (const r of REPLACEMENTS) {
      expect(partKey(r.part_number) && partKey(r.alt_number)).toBeTruthy();
      expect(partKey(r.part_number)).not.toBe(partKey(r.alt_number));
      expect(["newer_genuine", "older_genuine", "aftermarket"]).toContain(r.kind);
      expect(r.source_name?.trim()).toBeTruthy();
      expect(r.source_link).toMatch(/^https:\/\/\S+$/);
      expect(r.status).toBeUndefined();
      const pair = `${partKey(r.part_number)}>${partKey(r.alt_number)}`;
      expect(pairs.has(pair), pair).toBe(false);
      pairs.add(pair);
    }
  });
});
