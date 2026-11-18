import { describe, it, expect } from "vitest";
import {
  busRecordWarnings, busesOf, bySection, checkedCounts, chunks, covers, guideFromStarter, intervalLabel,
  matchesSearch, modelKey, starterFacts, uncoveredBuses, unimportedStarters, visibleFacts, yearsLabel, SECTION_IDS,
} from "../busLibrary.js";
import { STARTERS } from "../../data/busLibrary/index.js";

const hiace = { id: "g1", make: "Toyota", model: "Hiace", year_from: 2014, year_to: 2018 };
const bus = (over) => ({ id: "b", make: "Toyota", model: "Hiace", year: 2016, ...over });

describe("which buses a page covers", () => {
  it("matches make and model however they are typed", () => {
    expect(modelKey("NV-350")).toBe(modelKey("nv350"));
    expect(covers(hiace, bus({ make: " TOYOTA ", model: "Hi-Ace" }))).toBe(true);
    expect(covers({ make: "Nissan", model: "NV350" }, { make: "Nissan", model: "Nv350", year: 2019 })).toBe(true);
    expect(covers(hiace, bus({ model: "Hilux" }))).toBe(false);
  });

  it("uses the years when the bus has one", () => {
    expect(covers(hiace, bus({ year: 2013 }))).toBe(false);
    expect(covers(hiace, bus({ year: 2019 }))).toBe(false);
    expect(covers(hiace, bus({ year: 2018 }))).toBe(true);
    expect(covers(hiace, bus({ year: null }))).toBe(true);
    expect(covers({ make: "Toyota", model: "Hiace" }, bus({ year: 1999 }))).toBe(true);
  });

  it("never matches a bus with no make or model", () => {
    expect(covers({ make: "", model: "" }, { make: "", model: "" })).toBe(false);
    expect(uncoveredBuses([hiace], [bus({ make: "" }), bus({ id: "n", make: "Nissan", model: "NV350" }), bus({ id: "h" })]).map((b) => b.id)).toEqual(["n"]);
    expect(busesOf(hiace, [bus({ id: "1" }), bus({ id: "2", year: 2020 })]).map((b) => b.id)).toEqual(["1"]);
  });
});

describe("labels", () => {
  it("says the years and the service interval in words", () => {
    expect(yearsLabel(hiace)).toBe("2014–2018");
    expect(yearsLabel({ year_from: 2012 })).toBe("2012 on");
    expect(yearsLabel({})).toBe("all years");
    expect(intervalLabel({ interval_km: 10000, interval_months: 6 })).toBe("Every 10,000 km or 6 months");
    expect(intervalLabel({ interval_months: 1 })).toBe("Every 1 month");
    expect(intervalLabel({})).toBe("");
  });
});

describe("facts on a page", () => {
  const facts = [
    { id: "a", section: "fluids", label: "Engine oil", value: "7 L", status: "checked", sort_order: 20 },
    { id: "b", section: "fluids", label: "Coolant", value: "Toyota SLLC", sort_order: 10 },
    { id: "c", section: "mystery", label: "Odd one" },
    { id: "d", section: "tyres", label: "Tyre size", value: "195R15C", status: "wrong" },
  ];
  it("groups them by section in order; unknown sections are notes", () => {
    const grouped = bySection(facts);
    expect(grouped.get("fluids").map((f) => f.id)).toEqual(["b", "a"]);
    expect(grouped.get("notes").map((f) => f.id)).toEqual(["c"]);
  });
  it("searches every word, and filters by status", () => {
    expect(matchesSearch("engine OIL", "Engine oil", "7 L")).toBe(true);
    expect(matchesSearch("engine tyre", "Engine oil")).toBe(false);
    expect(visibleFacts(facts, { query: "engine" }).map((f) => f.id)).toEqual(["a"]);
    // The section's name counts: "Oils & fluids" holds both.
    expect(visibleFacts(facts, { query: "oil" }).map((f) => f.id)).toEqual(["a", "b"]);
    expect(visibleFacts(facts, { show: "unchecked" }).map((f) => f.id)).toEqual(["b", "c"]);
    expect(checkedCounts(facts)).toEqual({ total: 4, checked: 1, wrong: 1, unchecked: 2 });
  });
});

describe("a bus's own record", () => {
  it("flags a missing engine or gearbox and a VIN of the wrong length", () => {
    expect(busRecordWarnings({ engine: "2KD-FTV", transmission: "Manual", vin: "JTFSS22P0H0123456" })).toEqual([]);
    const w = busRecordWarnings({ vin: "JTFSS22P0H012345" });
    expect(w).toHaveLength(3);
    expect(w[2]).toMatch(/16 characters/);
    // A Japanese frame number is not a VIN.
    expect(busRecordWarnings({ engine: "x", transmission: "y", vin: "KDH201-0123456" })).toEqual([]);
  });
});

describe("starter pages", () => {
  const starter = { key: "toyota-hiace-h200", make: "Toyota", model: "Hiace", year_from: 2004, year_to: 2019, facts: [{ section: "fluids", label: "Oil", value: "7 L", source_link: "https://example.org", checked_by: "x", status: "checked" }] };
  it("become a page and unchecked facts", () => {
    expect(guideFromStarter(starter)).toMatchObject({ make: "Toyota", model: "Hiace", starter_key: "toyota-hiace-h200", year_from: 2004 });
    const [row] = starterFacts(starter, "g9");
    expect(row).toEqual({ guide_id: "g9", status: "unchecked", sort_order: 10, section: "fluids", label: "Oil", value: "7 L", source_link: "https://example.org" });
    expect(unimportedStarters([starter], [{ starter_key: "toyota-hiace-h200" }])).toEqual([]);
    expect(chunks([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  });

  it.each(STARTERS.map((s) => [s.key, s]))("%s is well formed and sourced", (_key, s) => {
    expect(s.key).toMatch(/^[a-z0-9-]{1,60}$/);
    expect(s.make && s.model).toBeTruthy();
    expect(s.facts.length).toBeGreaterThan(10);
    const labels = new Set();
    for (const fact of s.facts) {
      expect(SECTION_IDS.has(fact.section), `${fact.label}: section ${fact.section}`).toBe(true);
      expect(fact.label?.trim(), "a fact needs a label").toBeTruthy();
      expect(fact.label.length).toBeLessThanOrEqual(200);
      expect((fact.value || "").length).toBeLessThanOrEqual(500);
      expect((fact.detail || "").length).toBeLessThanOrEqual(4000);
      // Every fact says where it came from, and links are https.
      expect(fact.source_name?.trim(), `${fact.label}: no source`).toBeTruthy();
      if (fact.source_link) expect(fact.source_link).toMatch(/^https:\/\/\S+$/);
      expect(fact.status, "starter facts never come checked").toBeUndefined();
      const key = `${fact.section}:${fact.label}:${fact.applies_to || ""}`;
      expect(labels.has(key), `duplicate ${key}`).toBe(false);
      labels.add(key);
    }
  });
});
