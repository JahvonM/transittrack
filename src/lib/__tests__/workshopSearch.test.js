import { describe, it, expect } from "vitest";
import { workshopSearch } from "../workshopSearch.js";
import { orderEmailLink, orderMessage, partFromScan, reorderLines, suggestedOrder, workshopVehicles } from "../workshop.js";

const guides = [{ id: "g1", make: "Toyota", model: "Hiace", year_from: 2004, year_to: 2019 }, { id: "g2", make: "BMW", model: "X3" }];
const buses = [{ id: "bus-a", name: "St.George", make: "Toyota", model: "Hiace", year: 2017, engine: "2KD-FTV", plate_number: "HB 123", vin: "TESTVIN0000000001" }];
const cars = [{ id: "car-1", name: "BMW X3", make: "BMW", model: "X3", year: 2013 }];
const parts = [
  { id: "p1", part_name: "Oil filter (genuine)", oem_number: "90915-YZZD2", quantity_in_stock: 1, min_stock: 2, supplier: "Toyota Grenada", bin_location: "Shelf A1" },
  { id: "p2", part_name: "Ryco oil filter", aftermarket_number: "Z418", quantity_in_stock: 0, supplier: "Ryco" },
  { id: "p3", part_name: "Wheel nut", oem_number: "90942-01058", quantity_in_stock: 12, min_stock: 4 },
  { id: "p4", part_name: "Air filter", oem_number: "17801-30040", quantity_in_stock: 0 },
];
const interchanges = [{ id: "i1", part_number: "90915-YZZD2", alt_number: "Z418", alt_brand: "Ryco", status: "unchecked" }];
const data = {
  guides, parts, interchanges,
  vehicles: workshopVehicles(buses, cars, guides),
  specs: [{ id: "t1", guide_id: "g1", system: "wheels_brakes", item: "Wheel nuts", nm: 100 }, { id: "t2", guide_id: "g2", system: "wheels_brakes", item: "Wheel bolts", nm: 140 }],
  facts: [{ id: "f1", guide_id: "g1", section: "fluids", label: "Engine oil with filter", value: "7.0 litres" }],
  groups: [{ id: "c1", guide_id: "g1", vehicle_id: "bus-a", category: "Engine / Fuel / Tool", code: "1502", title: "OIL FILTER", parts: [{ ref: "15601", number: "90915-YZZD2", name: "Element kit, oil filter" }] }],
  documents: [{ id: "d1", guide_id: "g1", title: "Owner's manual 2017", kind: "owners_manual", notes: "Fuses" }],
};
const group = (results, id) => results.find((g) => g.id === id);

describe("one search box for the Workshop", () => {
  it("needs two characters", () => {
    expect(workshopSearch(data, "")).toEqual([]);
    expect(workshopSearch(data, "o")).toEqual([]);
  });

  it("finds a part by a replacement number, with its stock", () => {
    const hits = group(workshopSearch(data, "z418"), "parts").hits;
    expect(hits.map((h) => h.key)).toEqual(["part:p1", "part:p2"]);
    expect(hits[0]).toMatchObject({ to: "/workshop/parts/p1", part: parts[0] });
  });

  it("opens torque values, specs, diagrams and manuals on a vehicle that uses the model page", () => {
    expect(group(workshopSearch(data, "wheel nuts"), "torque").hits[0]).toMatchObject({ title: "Wheel nuts", to: "/workshop/bus/bus-a/torque" });
    expect(group(workshopSearch(data, "wheel bolts"), "torque").hits[0]).toMatchObject({ to: "/workshop/car/car-1/torque" });
    expect(group(workshopSearch(data, "engine oil"), "specs").hits[0]).toMatchObject({ title: "Engine oil with filter", to: "/workshop/bus/bus-a/specs" });
    expect(group(workshopSearch(data, "fuses"), "manuals").hits[0]).toMatchObject({ to: "/workshop/bus/bus-a/manuals" });
    const maker = group(workshopSearch(data, "1502"), "catalogue").hits;
    expect(maker[0]).toMatchObject({ title: "1502 OIL FILTER", to: "/workshop/bus/bus-a/group/c1" });
    const inDiagram = group(workshopSearch(data, "element kit"), "catalogue").hits;
    expect(inDiagram[0]).toMatchObject({ title: "Element kit, oil filter", to: "/workshop/bus/bus-a/group/c1" });
  });

  it("says when no vehicle uses a model page", () => {
    const lonely = { ...data, vehicles: [] };
    expect(group(workshopSearch(lonely, "wheel nuts"), "torque").hits[0]).toMatchObject({ to: "", subtitle: expect.stringContaining("No vehicle uses this model page yet") });
  });

  it("finds a vehicle by its chassis number without showing it", () => {
    const hit = group(workshopSearch(data, "0000000001"), "vehicles").hits[0];
    expect(hit).toMatchObject({ title: "St.George", to: "/workshop/bus/bus-a" });
    expect(JSON.stringify(hit)).not.toContain("TESTVIN");
    expect(group(workshopSearch(data, "HB 123"), "vehicles").hits[0].title).toBe("St.George");
  });

  it("shows eight hits a group and counts the rest", () => {
    const many = { ...data, parts: Array.from({ length: 11 }, (_, i) => ({ id: `x${i}`, part_name: `Bolt ${i}`, quantity_in_stock: 1 })) };
    const bolts = group(workshopSearch(many, "bolt"), "parts");
    expect(bolts.hits).toHaveLength(8);
    expect(bolts.more).toBe(3);
  });
});

describe("scanning a part's barcode", () => {
  it("finds a part by its own number however it's printed, before parts it replaces", () => {
    expect(partFromScan("90915YZZD2", parts, interchanges).matches.map((p) => p.id)).toEqual(["p1"]);
    expect(partFromScan(" 90915-yzzd2 ", parts, interchanges).matches.map((p) => p.id)).toEqual(["p1"]);
    expect(partFromScan("Z418", parts, interchanges).matches.map((p) => p.id)).toEqual(["p2"]);
  });

  it("finds a part by a replacement number no part has as its own", () => {
    const more = [...interchanges, { id: "i2", part_number: "90915-YZZD2", alt_number: "C-1139", alt_brand: "Sakura", status: "unchecked" }];
    expect(partFromScan("C1139", parts, more).matches.map((p) => p.id)).toEqual(["p1"]);
  });

  it("finds a known number inside a longer label code", () => {
    expect(partFromScan("P9094201058Q4", parts, interchanges).matches.map((p) => p.id)).toEqual(["p3"]);
  });

  it("finds nothing for an unknown or too short code, and keeps what was scanned", () => {
    expect(partFromScan("04465-26420", parts, interchanges)).toEqual({ matches: [], number: "04465-26420" });
    expect(partFromScan("Z4", parts, interchanges).matches).toEqual([]);
  });
});

describe("the reorder list", () => {
  it("orders back up to twice the warning level, at least one", () => {
    expect(suggestedOrder({ quantity_in_stock: 1, min_stock: 2 })).toBe(3);
    expect(suggestedOrder({ quantity_in_stock: 0, min_stock: 4 })).toBe(8);
    expect(suggestedOrder({ quantity_in_stock: 0 })).toBe(1);
    expect(suggestedOrder({ quantity_in_stock: 5, min_stock: 2 })).toBe(1);
  });

  it("lists low and out-of-stock parts by supplier, with no supplier last", () => {
    expect(reorderLines(parts).map((g) => [g.supplier, g.lines.map((l) => [l.part.id, l.qty])])).toEqual([
      ["Ryco", [["p2", 1]]],
      ["Toyota Grenada", [["p1", 3]]],
      ["", [["p4", 1]]],
    ]);
  });

  it("writes the order as a message and an email", () => {
    const order = { supplier: "Toyota Grenada", lines: [{ part: parts[0], qty: 3 }, { part: parts[3], qty: 1 }] };
    expect(orderMessage(order)).toBe("Hello Toyota Grenada,\nMcSween Transport would like to order:\n• 90915-YZZD2 Oil filter (genuine) × 3\n• 17801-30040 Air filter × 1\n\nThank you.");
    const link = orderEmailLink(order);
    expect(link.startsWith("mailto:?subject=Parts%20order%20from%20McSween%20Transport&body=")).toBe(true);
    expect(decodeURIComponent(link.split("body=")[1])).toBe(orderMessage(order));
  });
});
