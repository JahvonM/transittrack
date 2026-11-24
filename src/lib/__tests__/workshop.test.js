import { describe, it, expect } from "vitest";
import {
  TORQUE_SYSTEMS, TORQUE_TEXT_LIMITS, MAX_NM, carData, carProblem, catalogueCategories, catalogueName, categorySlug, diagramRows,
  embeddable, ftLb, groupMatches, groupRefs, guideFor, isToyotaDiagram, jpCarPartsLink, jpCarPartsModel, modelCodeFor,
  guideContents, pageFromStarter, pictureForGroup, pinKey, pinLabel, readyStarters,
  starterTorque, torqueBySystem, torqueData, torqueForm, torqueProblem, visibleTorque, workshopVehicles,
  blankFact, documentProblem, factData, factForm, factProblem, nextFactOrder, nextStock, partData, partForm, partProblem,
  partsForGuide, stockSummary, visibleParts,
} from "../workshop.js";
import { TORQUE_STARTERS } from "../../data/workshop/torque/index.js";
import { STARTERS as LIBRARY_STARTERS } from "../../data/busLibrary/index.js";

describe("torque on screen", () => {
  it("gives ft·lb beside N·m", () => {
    expect(ftLb(100)).toBe("74");
    expect(ftLb(140)).toBe("103");
    expect(ftLb(8)).toBe("5.9");
    expect(ftLb(0)).toBe("");
    expect(ftLb(null)).toBe("");
  });

  it("groups values by part of the vehicle, in order, leaving out empty parts", () => {
    const specs = [
      { id: "a", system: "engine", item: "Drain plug", sort_order: 20 },
      { id: "b", system: "wheels_brakes", item: "Wheel nuts", sort_order: 10 },
      { id: "c", system: "engine", item: "Oil filter cover", sort_order: 10 },
      { id: "d", system: "roof", item: "Odd one" },
    ];
    expect([...torqueBySystem(specs)].map(([s, list]) => [s, list.map((x) => x.id)])).toEqual([
      ["wheels_brakes", ["b"]], ["engine", ["c", "a"]], ["body_electrical", ["d"]],
    ]);
  });

  it("filters by words and by checked state", () => {
    const specs = [
      { id: "a", system: "wheels_brakes", item: "Wheel nuts", status: "checked" },
      { id: "b", system: "engine", item: "Head bolts", stages: "35 N·m, then +90°", new_bolt: true },
      { id: "c", system: "engine", item: "Drain plug", status: "wrong" },
    ];
    expect(visibleTorque(specs, { query: "head" }).map((s) => s.id)).toEqual(["b"]);
    expect(visibleTorque(specs, { query: "new bolt" }).map((s) => s.id)).toEqual(["b"]);
    expect(visibleTorque(specs, { query: "wheels" }).map((s) => s.id)).toEqual(["a"]);
    expect(visibleTorque(specs, { show: "unchecked" }).map((s) => s.id)).toEqual(["b"]);
    expect(visibleTorque(specs, { show: "wrong" }).map((s) => s.id)).toEqual(["c"]);
  });
});

describe("the torque form", () => {
  it("saves numbers as numbers, an empty torque as none, and trims the text", () => {
    const form = { ...torqueForm({ system: "engine" }), item: " Drain plug ", nm: "34,5", source_link: " https://example.com " };
    expect(torqueData(form)).toMatchObject({ system: "engine", item: "Drain plug", nm: 34.5, new_bolt: false, source_link: "https://example.com" });
    expect(torqueData({ ...form, nm: "" }).nm).toBe(null);
    expect(torqueForm({ system: "engine", item: "X", nm: 25, new_bolt: true })).toMatchObject({ nm: "25", new_bolt: true });
  });

  it("says what's missing before the server has to", () => {
    const ok = { ...torqueForm({}), item: "Wheel nuts", nm: "100" };
    expect(torqueProblem(ok)).toBe("");
    expect(torqueProblem({ ...ok, item: " " })).toMatch(/which bolt/);
    expect(torqueProblem({ ...ok, nm: "tight" })).toMatch(/N·m/);
    expect(torqueProblem({ ...ok, nm: "2500" })).toMatch(/N·m/);
    expect(torqueProblem({ ...ok, source_link: "http://x.com" })).toMatch(/https/);
  });
});

describe("vehicles", () => {
  const guides = [
    { id: "hiace-any", make: "Toyota", model: "Hiace" },
    { id: "hiace", make: "Toyota", model: "Hiace", year_from: 2004, year_to: 2019 },
    { id: "x3", make: "BMW", model: "X3", year_from: 2010, year_to: 2017 },
  ];

  it("finds a vehicle's model page, preferring one with years", () => {
    expect(guideFor({ make: "toyota", model: "HIACE", year: 2017 }, guides).id).toBe("hiace");
    expect(guideFor({ make: "BMW", model: "X3", year: 2013 }, guides).id).toBe("x3");
    expect(guideFor({ make: "BMW", model: "X3", year: 2020 }, guides)).toBe(null);
  });

  it("lists the buses first, then the cars, each by name", () => {
    const list = workshopVehicles(
      [{ id: "b2", name: "St.George", make: "Toyota", model: "Hiace", year: 2017 }, { id: "b1", name: "Grenville", make: "Nissan", model: "NV350" }],
      [{ id: "c1", name: "BMW X3", make: "BMW", model: "X3", year: 2013, engine: "N47 2.0 diesel" }],
      guides,
    );
    expect(list.map((v) => [v.kind, v.name])).toEqual([["bus", "Grenville"], ["bus", "St.George"], ["car", "BMW X3"]]);
    expect(list[2]).toMatchObject({ model: "BMW X3 2013", engine: "N47 2.0 diesel", guide: { id: "x3" } });
    expect(list[0].guide).toBe(null);
  });

  it("checks a car before saving it", () => {
    expect(carProblem({ name: "X3", make: "BMW", model: "X3", year: "2013" })).toBe("");
    expect(carProblem({ name: "X3", make: "", model: "X3" })).toMatch(/name, make and model/);
    expect(carProblem({ name: "X3", make: "BMW", model: "X3", year: "13" })).toMatch(/four digits/);
    expect(carData({ name: " X3 ", make: "BMW", model: "X3", year: "", vin: " testvin0000000001 " })).toMatchObject({ name: "X3", year: null, vin: "TESTVIN0000000001" });
  });
});

describe("starter torque tables", () => {
  const SYSTEMS = new Set(TORQUE_SYSTEMS.map((s) => s.id));

  it.each(TORQUE_STARTERS.map((s) => [s.key, s]))("%s: every value has a known part, a bolt, a sane torque and an https source", (_, starter) => {
    expect(starter.guide_key).toMatch(/^[a-z0-9-]{1,60}$/);
    expect(starter.torque.length).toBeGreaterThan(0);
    for (const spec of starter.torque) {
      expect(SYSTEMS.has(spec.system)).toBe(true);
      expect(String(spec.item).trim()).not.toBe("");
      expect(spec.nm).toBeGreaterThan(0);
      expect(spec.nm).toBeLessThanOrEqual(MAX_NM);
      expect(spec.source_link).toMatch(/^https:\/\/[^\s]+$/);
      expect(String(spec.source_name).trim()).not.toBe("");
      expect(spec.status).toBeUndefined();
      for (const [field, max] of Object.entries(TORQUE_TEXT_LIMITS)) expect(String(spec[field] ?? "").length).toBeLessThanOrEqual(max);
    }
  });

  it("goes on the Bus library's own pages for the buses, and makes pages for the cars", () => {
    const libraryKeys = new Set(LIBRARY_STARTERS.map((s) => s.key));
    for (const starter of TORQUE_STARTERS) {
      if (starter.page) {
        expect(libraryKeys.has(starter.guide_key)).toBe(false);
        expect(pageFromStarter(starter)).toMatchObject({ make: starter.page.make, model: starter.page.model, starter_key: starter.guide_key });
      } else {
        expect(libraryKeys.has(starter.guide_key)).toBe(true);
      }
    }
  });

  it("adds only the values a page doesn't have, all not checked, after the ones it has", () => {
    const starter = { guide_key: "x", torque: [
      { system: "wheels_brakes", item: "Wheel nuts", nm: 100, source_name: "A", source_link: "https://a.example" },
      { system: "engine", item: "Drain plug", nm: 34, source_name: "B", source_link: "https://b.example" },
    ] };
    const existing = [{ guide_id: "g1", system: "wheels_brakes", item: " wheel NUTS", sort_order: 40 }, { guide_id: "other", system: "engine", item: "Drain plug" }];
    expect(starterTorque(starter, "g1", existing)).toEqual([
      { guide_id: "g1", status: "unchecked", sort_order: 50, system: "engine", item: "Drain plug", nm: 34, source_name: "B", source_link: "https://b.example" },
    ]);
  });

  it("offers each model once: a bus page with its researched facts, a car's own page, and torque values a page lacks", () => {
    const library = [{ key: "bus", make: "Toyota", model: "Hiace", generation: "H200", facts: [{ section: "fluids", label: "Oil" }, { section: "tyres", label: "Tyres" }] }];
    const torque = [
      { key: "bus", guide_key: "bus", label: "Toyota Hiace H200", torque: [{ system: "engine", item: "A", nm: 1 }] },
      { key: "car", guide_key: "car", label: "BMW X3 F25", page: { make: "BMW", model: "X3" }, torque: [{ system: "engine", item: "A", nm: 1 }, { system: "engine", item: "B", nm: 2 }] },
      { key: "done", guide_key: "done", label: "Done", torque: [{ system: "engine", item: "A", nm: 1 }] },
      { key: "more", guide_key: "more", label: "More", torque: [{ system: "engine", item: "A", nm: 1 }, { system: "engine", item: "B", nm: 2 }] },
    ];
    const guides = [{ id: "g-done", starter_key: "done" }, { id: "g-more", starter_key: "more", make: "Nissan", model: "NV350" }];
    const specs = [{ guide_id: "g-done", system: "engine", item: "A" }, { guide_id: "g-more", system: "engine", item: "a " }];
    const ready = readyStarters(library, torque, guides, specs);
    expect(ready.map((r) => [r.key, r.label, r.facts, r.torque, !!r.guide])).toEqual([
      ["bus", "Toyota Hiace H200", 2, 1, false],
      ["car", "BMW X3 F25", 0, 2, false],
      ["more", "More", 0, 1, true],
    ]);
    // A new page is made from the bus starter (with its key, so it's offered once), or from the car's own page.
    expect(ready[0].page).toMatchObject({ make: "Toyota", model: "Hiace", generation: "H200", starter_key: "bus" });
    expect(ready[1].page).toMatchObject({ make: "BMW", model: "X3", starter_key: "car" });
    expect(readyStarters(library, torque, [...guides, { id: "g-bus", starter_key: "bus" }, { id: "g-car", starter_key: "car" }], specs).map((r) => r.key)).toEqual(["bus", "car", "more"]);
  });
});

describe("deleting a model page", () => {
  it("takes its facts, manuals, pictures, torque values and maker's diagrams, and unlinks its parts", () => {
    const data = {
      facts: [{ id: "f1", guide_id: "g1" }, { id: "f2", guide_id: "g2" }],
      documents: [{ id: "d1", guide_id: "g1" }],
      diagrams: [{ id: "p1", guide_id: "g1" }, { id: "p2", guide_id: "g2" }],
      specs: [{ id: "t1", guide_id: "g1" }],
      groups: [{ id: "c1", guide_id: "g1" }, { id: "c2", guide_id: "g2" }],
      parts: [{ id: "x1", guide_ids: ["g1", "g2"] }, { id: "x2", guide_ids: ["g2"] }, { id: "x3" }],
    };
    const own = guideContents("g1", data);
    expect(Object.fromEntries(Object.entries(own).map(([k, list]) => [k, list.map((r) => r.id)]))).toEqual({
      facts: ["f1"], documents: ["d1"], pictures: ["p1"], torque: ["t1"], groups: ["c1"], parts: ["x1"],
    });
  });
});

describe("the catalogue", () => {
  const groups = [
    { id: "c2", guide_id: "g1", vehicle_id: "bus-a", model_code: "KDH212R-JEMDY", category: "Engine / Fuel / Tool", code: "2302", title: "FUEL FILTER", sort_order: 20 },
    { id: "c1", guide_id: "g1", vehicle_id: "bus-a", model_code: "KDH212R-JEMDY", category: "Engine / Fuel / Tool", code: "1502", title: "OIL FILTER", sort_order: 10 },
    { id: "c3", guide_id: "g1", category: "", code: "4702", title: "FRONT DISC BRAKE CALIPER", sort_order: 30,
      parts: [
        { ref: "47750", number: "47750-26310", name: "Cylinder assy, disc brake", qty: "1" },
        { ref: "47750", number: "47730-26310", name: "Cylinder assy, disc brake, LH", qty: "1" },
        { ref: "04465", number: "04465-26420", name: "Pad kit", qty: "1" },
        { ref: "", number: "90105-10334", name: "Bolt", qty: "2" },
      ] },
  ];

  it("lists the maker's categories in its order, with their diagrams", () => {
    expect([...catalogueCategories(groups)].map(([c, list]) => [c, list.map((g) => g.code)])).toEqual([
      ["Engine / Fuel / Tool", ["1502", "2302"]], ["Other", ["4702"]],
    ]);
    expect(categorySlug("Engine / Fuel / Tool")).toBe("engine-fuel-tool");
    expect(categorySlug("A ENGINE MECHANICAL")).toBe("a-engine-mechanical");
    expect(categorySlug("  ")).toBe("other");
    expect(groupMatches(groups[1], "oil")).toBe(true);
    expect(groupMatches(groups[1], "1502")).toBe(true);
    expect(groupMatches(groups[1], "fuel")).toBe(false);
  });

  it("knows a vehicle's model code and a diagram's photo", () => {
    expect(modelCodeFor({ id: "bus-a" }, groups)).toBe("KDH212R-JEMDY");
    expect(modelCodeFor({ id: "bus-b" }, groups)).toBe("");
    const diagrams = [{ id: "d1", catalogue_group_id: "" }, { id: "d2", catalogue_group_id: "c3" }];
    expect(pictureForGroup(groups[2], diagrams).id).toBe("d2");
    expect(pictureForGroup(groups[0], diagrams)).toBe(null);
  });

  it("pairs a maker's diagram's rows with the numbers on its photo, by the maker's number", () => {
    const pins = [{ n: 1, ref: "47750", x: 0.2, y: 0.2 }, { n: 2, ref: "", x: 0.5, y: 0.5 }];
    const rows = diagramRows({ group: groups[2], pins });
    expect(rows.map((r) => [r.key, r.pins.map((p) => p.n)])).toEqual([["ref:47750", [1]], ["ref:47750", [1]], ["ref:04465", []], ["row:3", []]]);
    expect(pinKey(pins[0], true)).toBe("ref:47750");
    expect(pinKey(pins[1], true)).toBe("pin:2");
    expect([pinLabel(pins[0]), pinLabel(pins[1])]).toEqual(["47750", "2"]);
    expect(groupRefs(groups[2]).map((r) => r.ref)).toEqual(["47750", "04465"]);
  });

  it("lists a plain picture's own numbers in order", () => {
    const rows = diagramRows({ pins: [{ n: 3 }, { n: 1 }] });
    expect(rows.map((r) => [r.key, r.ref])).toEqual([["pin:1", "1"], ["pin:3", "3"]]);
    expect(pinKey({ n: 3, ref: "47750" }, false)).toBe("pin:3");
  });
});

describe("the maker's diagram from the catalogue site", () => {
  const LIST = "https://jp-carparts.com/toyota/figlist.php?maker=toyota&type=711160&model=KDH201K-ERMDY&profile=143d1f38d2d60c9eba8bbdbe7a0d75360a0f985e528ebb1c964d63495fbee54f";

  it("shows only JP-CarParts inside the Workshop, and only over https", () => {
    expect(embeddable("https://jp-carparts.com/toyota/partlist.php?fig=1502")).toBe(true);
    expect(embeddable("http://jp-carparts.com/toyota/partlist.php")).toBe(false);
    expect(embeddable("https://jp-carparts.com.evil.example/x")).toBe(false);
    expect(embeddable("https://www.jp-carparts.com/x")).toBe(false);
    expect(embeddable("https://partsouq.com/en/catalog/genuine")).toBe(false);
    expect(embeddable("javascript:alert(1)")).toBe(false);
    expect(embeddable("")).toBe(false);
  });

  it("names the site a link opens", () => {
    expect(catalogueName("https://jp-carparts.com/toyota/partlist.php")).toBe("JP-CarParts");
    expect(catalogueName("https://partsouq.com/en/catalog/genuine/unit?x=1")).toBe("Partsouq");
    expect(catalogueName("https://www.megazip.net/parts/toyota")).toBe("MegaZip");
    expect(catalogueName("https://example.com/")).toBe("the maker's site");
    expect(catalogueName("not a link")).toBe("the maker's site");
  });

  it("turns a model's list of diagrams into each diagram's address, by Toyota's number", () => {
    const link = jpCarPartsLink(LIST, "1502");
    const url = new URL(link);
    expect(url.origin + url.pathname).toBe("https://jp-carparts.com/toyota/partlist.php");
    expect(Object.fromEntries(url.searchParams)).toEqual({
      maker: "toyota", type: "711160", model: "KDH201K-ERMDY", profile: "143d1f38d2d60c9eba8bbdbe7a0d75360a0f985e528ebb1c964d63495fbee54f", fig: "1502",
    });
    // A diagram's own address works as the starting point too.
    expect(jpCarPartsLink(link, "0901")).toBe(link.replace("fig=1502", "fig=0901"));
    expect(jpCarPartsModel(LIST)).toBe("KDH201K-ERMDY");
    expect(isToyotaDiagram("1502")).toBe(true);
    expect(isToyotaDiagram("150A-001")).toBe(false);
  });

  it("refuses anything that isn't a Toyota model page on JP-CarParts, or a code that isn't Toyota's", () => {
    expect(jpCarPartsLink(LIST, "150A-001")).toBe("");
    expect(jpCarPartsLink(LIST, "")).toBe("");
    expect(jpCarPartsLink(LIST.replace("https:", "http:"), "1502")).toBe("");
    expect(jpCarPartsLink(LIST.replace("jp-carparts.com", "jp-carparts.com.evil.example"), "1502")).toBe("");
    expect(jpCarPartsLink(LIST.replace("/toyota/", "/nissan/").replace("maker=toyota", "maker=nissan"), "1502")).toBe("");
    expect(jpCarPartsLink(LIST.replace(/&profile=[0-9a-f]+/, ""), "1502")).toBe("");
    expect(jpCarPartsLink(LIST.replace("model=KDH201K-ERMDY", "model=<script>"), "1502")).toBe("");
    expect(jpCarPartsLink("https://partsouq.com/en/catalog/genuine", "1502")).toBe("");
    expect(jpCarPartsModel("https://example.com")).toBe("");
  });
});

describe("parts in the Workshop", () => {
  const parts = [
    { id: "p1", part_name: "Wheel nut", oem_number: "90942-01058", quantity_in_stock: 12, guide_ids: ["g1"] },
    { id: "p2", part_name: "Oil filter (genuine)", oem_number: "90915-YZZD2", quantity_in_stock: 1, min_stock: 2, guide_ids: ["g1", "g2"] },
    { id: "p3", part_name: "Air filter", quantity_in_stock: 0 },
  ];
  const interchanges = [{ id: "i1", part_number: "90915-YZZD2", alt_number: "Z418", alt_brand: "Ryco", status: "unchecked" }];

  it("finds the parts that fit a model page, by name", () => {
    expect(partsForGuide(parts, "g1").map((p) => p.id)).toEqual(["p2", "p1"]);
    expect(partsForGuide(parts, "g2").map((p) => p.id)).toEqual(["p2"]);
    expect(partsForGuide(parts, "")).toEqual([]);
  });

  it("counts the parts, and those low or out of stock", () => {
    expect(stockSummary(parts)).toEqual({ total: 3, low: 2 });
    expect(stockSummary([])).toEqual({ total: 0, low: 0 });
  });

  it("searches names and every number, replacement numbers too, and shows only the low ones when asked", () => {
    expect(visibleParts(parts, interchanges, { query: "z418" }).map((p) => p.id)).toEqual(["p2"]);
    expect(visibleParts(parts, interchanges, { query: "filter" }).map((p) => p.id)).toEqual(["p3", "p2"]);
    expect(visibleParts(parts, interchanges, { show: "low" }).map((p) => p.id)).toEqual(["p3", "p2"]);
  });

  it("never counts below 0", () => {
    expect(nextStock(3, 2)).toBe(5);
    expect(nextStock(3, -5)).toBe(0);
    expect(nextStock(null, 1)).toBe(1);
    expect(nextStock("4", -1)).toBe(3);
  });

  it("edits a part's details, keeping only models that have a page", () => {
    const form = partForm({ ...parts[1], bin_location: "Shelf A1", unit_price: 12.5 });
    expect(form).toMatchObject({ part_name: "Oil filter (genuine)", min_stock: "2", unit_price: "12.5", bin_location: "Shelf A1", guide_ids: ["g1", "g2"] });
    const data = partData({ ...form, part_name: "  Oil filter  ", min_stock: "" }, [{ id: "g1" }]);
    expect(data).toMatchObject({ part_name: "Oil filter", min_stock: null, unit_price: 12.5, bin_location: "Shelf A1", guide_ids: ["g1"] });
    expect(partData(form, [])).not.toHaveProperty("guide_ids");
  });

  it("says what's wrong with a part's details", () => {
    const ok = partForm(parts[0]);
    expect(partProblem(ok)).toBe("");
    expect(partProblem({ ...ok, part_name: " " })).toMatch(/needs a name/);
    expect(partProblem({ ...ok, min_stock: "-1" })).toMatch(/Warn at/);
    expect(partProblem({ ...ok, min_stock: "2.5" })).toMatch(/Warn at/);
    expect(partProblem({ ...ok, unit_price: "abc" })).toMatch(/price/);
    expect(partProblem({ ...ok, bin_location: "x".repeat(61) })).toMatch(/Kept at/);
  });
});

describe("specs & service in the Workshop", () => {
  const fact = { id: "f1", guide_id: "g1", section: "service", label: "Engine oil", value: "Every service", interval_km: 10000, interval_months: 6, status: "checked", source_name: "Manual", source_link: "https://example.com/manual" };

  it("fills the form from a fact, and starts new facts empty", () => {
    expect(factForm(fact)).toMatchObject({ section: "service", label: "Engine oil", interval_km: "10000", interval_months: "6", detail: "" });
    expect(blankFact("tyres")).toMatchObject({ section: "tyres", label: "", interval_km: "" });
  });

  it("sends km and months only for the service schedule", () => {
    expect(factData({ ...factForm(fact) })).toMatchObject({ interval_km: 10000, interval_months: 6 });
    expect(factData({ ...factForm(fact), section: "specs" })).toMatchObject({ section: "specs", interval_km: null, interval_months: null });
    expect(factData({ ...blankFact("nonsense"), label: "x" }).section).toBe("notes");
  });

  it("sends only what changed when editing, so an unchanged save keeps it checked", () => {
    expect(factData(factForm(fact), fact)).toEqual({});
    const unchanged = factData(factForm({ ...fact, detail: null, applies_to: null }), { ...fact, detail: null, applies_to: null });
    expect(unchanged).toEqual({});
    expect(factData({ ...factForm(fact), value: "Every 10,000 km" }, fact)).toEqual({ value: "Every 10,000 km" });
  });

  it("checks the answer against the server's limits", () => {
    const ok = factForm(fact);
    expect(factProblem(ok)).toBe("");
    expect(factProblem({ ...ok, label: "" })).toMatch(/Say what it is/);
    expect(factProblem({ ...ok, section: "bogus" })).toMatch(/section/);
    expect(factProblem({ ...ok, value: "x".repeat(501) })).toMatch(/too long/);
    expect(factProblem({ ...ok, source_link: "http://example.com" })).toMatch(/https/);
    expect(factProblem({ ...ok, interval_km: "1000001" })).toMatch(/km/);
    expect(factProblem({ ...ok, interval_months: "6.5" })).toMatch(/Months/);
    expect(factProblem({ ...ok, section: "specs", interval_km: "nonsense" })).toBe("");
  });

  it("puts a new fact after the page's others", () => {
    expect(nextFactOrder([{ guide_id: "g1", sort_order: 30 }, { guide_id: "g2", sort_order: 90 }], "g1")).toBe(40);
    expect(nextFactOrder([], "g1")).toBe(10);
  });
});

describe("manuals in the Workshop", () => {
  const file = { size: 1000, type: "application/pdf" };
  it("needs a title, a kind and a PDF or photo up to 25 MB", () => {
    expect(documentProblem({ title: "Owner's manual", kind: "owners_manual", file })).toBe("");
    expect(documentProblem({ title: " ", kind: "owners_manual", file })).toMatch(/title/);
    expect(documentProblem({ title: "x", kind: "bogus", file })).toMatch(/kind/);
    expect(documentProblem({ title: "x", kind: "other", file: null })).toMatch(/Choose the file/);
    expect(documentProblem({ title: "x", kind: "other", file: { size: 26 * 1024 * 1024, type: "application/pdf" } })).toMatch(/25 MB/);
    expect(documentProblem({ title: "x", kind: "other", file: { size: 10, type: "application/zip" } })).toMatch(/PDF or a photo/);
  });
});


