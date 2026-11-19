import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  byCategory, groupLabel, newGroups, parseDiagramIndex, parsePartsList, progress, searchCatalogue, stockFor, stockIndex,
} from "../makerCatalogue.js";

// The owner's own pastes from Partsouq (chassis numbers replaced).
const sample = (name) => fs.readFileSync(path.join(__dirname, "fixtures", name), "utf8");

describe("a pasted list of diagrams", () => {
  it("reads Toyota's: a four-digit number and a name, under its category", () => {
    const groups = parseDiagramIndex(sample("partsouq-toyota-index.txt"));
    expect(groups).toHaveLength(29);
    expect(new Set(groups.map((g) => g.category))).toEqual(new Set(["Engine / Fuel / Tool"]));
    expect(groups[0]).toEqual({ category: "Engine / Fuel / Tool", code: "0901", title: "STANDARD TOOL", detail: "" });
    expect(groups.find((g) => g.code === "1502")).toMatchObject({ title: "OIL FILTER" });
    expect(groups.find((g) => g.code === "1901")).toMatchObject({ title: "IGNITION COIL & SPARK PLUG / GLOW PLUG" });
    expect(groups.at(-1)).toMatchObject({ code: "2606", title: "VENTURI" });
  });

  it("reads Nissan's: its number, name and sub-name, and the engine and dates after it", () => {
    const groups = parseDiagramIndex(sample("partsouq-nissan-index.txt"));
    expect(groups).toHaveLength(24);
    expect(new Set(groups.map((g) => g.category))).toEqual(new Set(["A ENGINE MECHANICAL"]));
    expect(groups.find((g) => g.code === "150A-001")).toEqual({ category: "A ENGINE MECHANICAL", code: "150A-001", title: "LUBRICATING SYSTEM", detail: "YD25DDTI (1206 - 2006)" });
    expect(groups.find((g) => g.code === "110A-002")).toMatchObject({ title: "CYLINDER BLOCK & OIL PAN · COMPONENT PARTS" });
    // The same name twice is said once.
    expect(groups.find((g) => g.code === "130A-001")).toMatchObject({ title: "CAMSHAFT & VALVE MECHANISM" });
    expect(groups.find((g) => g.code === "112D-001")).toMatchObject({ detail: "YD25DDTI.MT (1206 - 2006)" });
    expect(groups.find((g) => g.code === "147A-003")).toMatchObject({ title: "EGR PARTS · LCV0" });
  });

  it("keeps each category's own heading across a longer paste", () => {
    const text = "Engine / Fuel / Tool\n1502 OIL FILTER\n\nChassis / Driveline\n4401 BRAKE MASTER CYLINDER\n4702 FRONT DISC BRAKE CALIPER & DUST COVER";
    expect(parseDiagramIndex(text).map((g) => [g.category, g.code])).toEqual([
      ["Engine / Fuel / Tool", "1502"], ["Chassis / Driveline", "4401"], ["Chassis / Driveline", "4702"],
    ]);
    expect(parseDiagramIndex("Garage\tRegion\tYear\nnothing here")).toEqual([]);
  });

  it("adds only the diagrams a page doesn't have, after the ones it has", () => {
    const parsed = parseDiagramIndex("Engine / Fuel / Tool\n1502 OIL FILTER\n2302 FUEL FILTER");
    const rows = newGroups(parsed, [{ code: "1502", sort_order: 40 }], { guideId: "g1", vehicleId: "bus-a", modelCode: "KDH212R-JEMDY" });
    expect(rows).toEqual([{ guide_id: "g1", vehicle_id: "bus-a", model_code: "KDH212R-JEMDY", category: "Engine / Fuel / Tool", code: "2302", title: "FUEL FILTER", detail: "", parts: [], sort_order: 50 }]);
  });
});

describe("a pasted table of parts", () => {
  it("reads rows copied on a computer, tabs between the cells", () => {
    const text = [
      "No.\tPart number\tName\tQty\tInfo",
      "15601\t90915-YZZD2\tELEMENT KIT, OIL FILTER\t1\t2KD-FTV",
      "90430A\t90430-12031\tGASKET\t1",
    ].join("\n");
    expect(parsePartsList(text)).toEqual([
      { ref: "15601", number: "90915-YZZD2", name: "Element kit, oil filter", qty: "1", info: "2KD-FTV" },
      { ref: "90430A", number: "90430-12031", name: "Gasket", qty: "1", info: "" },
    ]);
  });

  it("reads one cell per line, as a phone copies a table", () => {
    const text = "15208\n15208-BN30A\nOIL FILTER ASSY\n1\n11026\n11026-01M02\nWASHER-DRAIN PLUG\n1\nYD25DDTI";
    expect(parsePartsList(text)).toEqual([
      { ref: "15208", number: "15208-BN30A", name: "Oil filter assy", qty: "1", info: "" },
      { ref: "11026", number: "11026-01M02", name: "Washer-drain plug", qty: "1", info: "YD25DDTI" },
    ]);
  });

  it("finds nothing in text without part numbers, and keeps each part once", () => {
    expect(parsePartsList("OIL FILTER\nNo parts here")).toEqual([]);
    expect(parsePartsList("1\t9091510009\tFILTER\n1\t9091510009\tFILTER")).toHaveLength(1);
  });
});

describe("the catalogue on the page", () => {
  const groups = [
    { id: "a", category: "Engine / Fuel / Tool", code: "1502", title: "OIL FILTER", sort_order: 20, parts: [{ ref: "15601", number: "90915-YZZD2", name: "Element kit, oil filter", qty: "1", info: "" }] },
    { id: "b", category: "Engine / Fuel / Tool", code: "0901", title: "STANDARD TOOL", sort_order: 10, parts: [] },
    { id: "c", category: "Chassis / Driveline", code: "4702", title: "FRONT DISC BRAKE CALIPER", sort_order: 30, parts: [{ ref: "1", number: "04465-26420", name: "Pad kit, disc brake, front", qty: "1", info: "" }] },
  ];

  it("lists diagrams by category in the catalogue's order, and counts those with parts", () => {
    expect([...byCategory(groups)].map(([c, gs]) => [c, gs.map((g) => g.code)])).toEqual([["Engine / Fuel / Tool", ["0901", "1502"]], ["Chassis / Driveline", ["4702"]]]);
    expect(progress(groups)).toEqual({ total: 3, done: 2 });
    expect(groupLabel(groups[0])).toBe("1502 OIL FILTER");
  });

  it("finds a part by its number however it's typed, or by words of its name", () => {
    expect(searchCatalogue(groups, "90915 yzzd2").map((h) => h.group.code)).toEqual(["1502"]);
    expect(searchCatalogue(groups, "disc front").map((h) => h.part.number)).toEqual(["04465-26420"]);
    expect(searchCatalogue(groups, "caliper").map((h) => h.part.number)).toEqual(["04465-26420"]);
    expect(searchCatalogue(groups, "  ")).toEqual([]);
  });

  it("shows what's on the shelf under a catalogue number", () => {
    const index = stockIndex([{ id: "p1", oem_number: "90915YZZD2", quantity_in_stock: 3 }]);
    expect(stockFor(groups[0].parts[0], index).map((p) => p.id)).toEqual(["p1"]);
    expect(stockFor(groups[2].parts[0], index)).toEqual([]);
  });
});
