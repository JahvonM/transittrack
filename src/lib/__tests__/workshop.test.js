import { describe, it, expect } from "vitest";
import {
  TORQUE_SYSTEMS, TORQUE_TEXT_LIMITS, MAX_NM, carData, carProblem, catalogueCategories, catalogueName, categorySlug, diagramRows,
  embeddable, ftLb, groupMatches, groupRefs, guideFor, isToyotaDiagram, jpCarPartsLink, jpCarPartsModel, modelCodeFor,
  pageFromStarter, pictureForGroup, pinKey, pinLabel, readyTorque,
  starterTorque, torqueBySystem, torqueData, torqueForm, torqueProblem, visibleTorque, workshopVehicles,
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

  it("offers each starter until its values are in, and says when a bus page is needed first", () => {
    const starters = [
      { key: "bus", guide_key: "bus", torque: [{ system: "engine", item: "A", nm: 1 }] },
      { key: "car", guide_key: "car", page: { make: "BMW", model: "X3" }, torque: [{ system: "engine", item: "A", nm: 1 }] },
      { key: "done", guide_key: "done", torque: [{ system: "engine", item: "A", nm: 1 }] },
    ];
    const guides = [{ id: "g-done", starter_key: "done" }];
    const specs = [{ guide_id: "g-done", system: "engine", item: "A" }];
    expect(readyTorque(starters, guides, specs).map((r) => [r.starter.key, r.count, r.needsPage, r.blocked])).toEqual([
      ["bus", 1, false, true], ["car", 1, true, false],
    ]);
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
