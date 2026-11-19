import { describe, it, expect } from "vitest";
import {
  TORQUE_SYSTEMS, TORQUE_TEXT_LIMITS, MAX_NM, carData, carProblem, ftLb, guideFor, pageFromStarter, readyTorque,
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
