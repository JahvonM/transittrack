import { describe, it, expect } from "vitest";
import {
  blankQuickPart, guideLabel, inStockReplacements, nextPinNumber, numbersOf, parsePartText, partKey, partMatches, partsByNumber,
  partsForGuide, partsNumbered, pinPlace, quickCount, quickExtrasFilled, quickPartRecord, quickPrimary, replacementsFor,
  restockPatch, starterInterchanges, stockLabel, stockLevel, withSavedParts,
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

describe("copied part numbers", () => {
  it.each([
    ["04465-26420 PAD KIT, DISC BRAKE, FRONT", "04465-26420", "Pad kit, disc brake, front"],
    // A table row: tabs between columns, a count and a price at the end.
    ["0446526420\tPAD KIT, DISC BRAKE, FRONT\t1\t$45.00", "0446526420", "Pad kit, disc brake, front"],
    // Each column on its own line, after a row number.
    ["12\n04152-YZZA1\nELEMENT KIT, OIL FILTER\n2\nUS$9.80", "04152-YZZA1", "Element kit, oil filter"],
    ["41060-3XA0A | PAD KIT-DISC BRAKE, FRONT | x2", "41060-3XA0A", "Pad kit-disc brake, front"],
    ["Ryco Z418 oil filter", "Z418", "Ryco oil filter"],
    // An engine code in the name stays as written, and isn't the number.
    ["FILTER, OIL (1KD-FTV) 90915-YZZD2", "90915-YZZD2", "Filter, oil (1KD-FTV)"],
    ["90915-yzzd2", "90915-YZZD2", ""],
    // A year at the end is not a part number.
    ["Front brake pads 2019", "", "Front brake pads 2019"],
    ["just a name", "", "just a name"],
    ["   \n ", "", ""],
  ])("%j", (text, number, name) => {
    expect(parsePartText(text)).toEqual({ number, name });
  });

  it("finds the part already in stock under a number, however it's typed", () => {
    expect(partsNumbered("90915 yzzd2", [oil, ryco, wesfil]).map((p) => p.id)).toEqual(["p1"]);
    expect(partsNumbered("WZ418", [oil, ryco, wesfil]).map((p) => p.id)).toEqual(["p3"]);
    expect(partsNumbered("", [oil, ryco])).toEqual([]);
  });
});

describe("quick add", () => {
  const guides = [{ id: "g1", make: "Toyota", model: "Hiace" }, { id: "g2", make: "Nissan", model: "NV350" }];

  it("saves the number as genuine or other brand, the count, and the models as the vehicle", () => {
    expect(quickPartRecord({ name: " Front brake pads ", number: "04465-26420", kind: "genuine", quantity: "3", guide_ids: ["g1", "gone"] }, guides)).toEqual({
      part_name: "Front brake pads", oem_number: "04465-26420", aftermarket_number: "", quantity_in_stock: 3, unit_price: 0,
      vehicle_compatibility: "Toyota Hiace", category: "", supplier: "", bin_location: "", photo_url: "", min_stock: null, guide_ids: ["g1"],
    });
    const other = quickPartRecord({ name: "Bendix pads", number: "DB1735", other_number: "04465-26420", kind: "other", quantity: -2, min_stock: "1", unit_price: "45.5", vehicle_compatibility: "Hiace 2KD only", guide_ids: ["g1", "g2"] }, guides);
    expect(other).toMatchObject({ oem_number: "04465-26420", aftermarket_number: "DB1735", quantity_in_stock: 0, min_stock: 1, unit_price: 45.5, vehicle_compatibility: "Hiace 2KD only", guide_ids: ["g1", "g2"] });
  });

  it("leaves the models alone where the library can't be read", () => {
    expect(quickPartRecord({ name: "Wiper", quantity: 1, guide_ids: ["g1"] }, [])).not.toHaveProperty("guide_ids");
  });
});

describe("quick add on a phone", () => {
  it("restocks onto the count read fresh, and adds the photo only to a part without one", () => {
    expect(restockPatch({ quantity_in_stock: "6" }, 2)).toEqual({ quantity_in_stock: 8 });
    expect(restockPatch({ quantity_in_stock: null }, "3", "https://x.test/p.jpg")).toEqual({ quantity_in_stock: 3, photo_url: "https://x.test/p.jpg" });
    expect(restockPatch({ quantity_in_stock: 1, photo_url: "https://x.test/old.jpg" }, 1, "https://x.test/p.jpg")).toEqual({ quantity_in_stock: 2 });
    expect(quickCount("-2")).toBe(0);
    expect(quickCount("2.9")).toBe(2);
  });

  it("knows parts saved on this screen without loading the list again", () => {
    const listed = [{ id: "p1", quantity_in_stock: 0, updated_date: "2026-11-18T10:00:00Z" }, { id: "p2", quantity_in_stock: 6 }];
    const saved = [{ id: "p2", quantity_in_stock: 7, updated_date: "2026-11-18T11:00:00Z" }, { id: "p9", quantity_in_stock: 1 }];
    const known = withSavedParts(listed, saved);
    expect(known.map((p) => [p.id, p.quantity_in_stock])).toEqual([["p9", 1], ["p1", 0], ["p2", 7]]);
    // A newer copy in the list (someone else changed it since) wins.
    const newer = withSavedParts([{ id: "p2", quantity_in_stock: 9, updated_date: "2026-11-18T12:00:00Z" }], saved.slice(0, 1));
    expect(newer).toEqual([{ id: "p2", quantity_in_stock: 9, updated_date: "2026-11-18T12:00:00Z" }]);
    expect(withSavedParts(listed, [])).toBe(listed);
  });

  it("finds a number as it's typed the same way as a search does", () => {
    const index = partsByNumber([oil, ryco, wesfil]);
    for (const typed of ["90915 yzzd2", "z-418", "WZ418", "nope"]) {
      expect((index.get(partKey(typed)) || []).map((p) => p.id), typed).toEqual(partsNumbered(typed, [oil, ryco, wesfil]).map((p) => p.id));
    }
    // A part with the same number in both boxes is listed once.
    expect(partsByNumber([{ id: "d", oem_number: "Z418", aftermarket_number: "z 418" }]).get("Z418")).toHaveLength(1);
  });

  it("picks the main button: restock one match, else a new part with a name", () => {
    expect(quickPrimary({ matches: [], qty: 1, name: "" })).toEqual({ kind: "new", label: "Add part", enabled: false });
    expect(quickPrimary({ matches: [], qty: 1, name: " Pads " })).toEqual({ kind: "new", label: "Add part", enabled: true });
    expect(quickPrimary({ matches: [ryco], qty: 2, name: "" })).toEqual({ kind: "restock", part: ryco, label: "Add 2 to its stock", enabled: true });
    expect(quickPrimary({ matches: [ryco], qty: 0, name: "" }).enabled).toBe(false);
    expect(quickPrimary({ matches: [ryco, wesfil], qty: 1, name: "Filter" })).toEqual({ kind: "new", label: "Add as a new part", enabled: true });
  });

  it("counts the More details filled in, and starts the next part with the same kind and models", () => {
    expect(quickExtrasFilled(blankQuickPart())).toBe(0);
    expect(quickExtrasFilled({ ...blankQuickPart(), bin_location: "Shelf C3", min_stock: 0, supplier: "  " })).toBe(2);
    expect(blankQuickPart({ kind: "other", guide_ids: ["g1"], name: "x" })).toMatchObject({ kind: "other", guide_ids: ["g1"], name: "", quantity: 1 });
    expect(guideLabel({ make: "Toyota", model: "Hiace", generation: "H200 (2004-2019)" })).toBe("Toyota Hiace (H200)");
    expect(guideLabel({ make: "Nissan", model: "NV350" })).toBe("Nissan NV350");
  });
});
