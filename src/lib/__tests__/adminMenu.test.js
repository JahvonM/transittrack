import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { ADMIN_HUBS, ADMIN_MENU, carriedSearch, groupOf, hubOf, hubTarget, menuSections, rememberTab } from "@/lib/adminMenu";

// Admin menu: five hubs (Jobs, Live fleet, Vehicles & drivers, Routes,
// Passengers) put related screens together as tabs. Every admin section must still be
// reachable from the menu, once.
const shell = readFileSync(new URL("../../components/admin/AdminShell.jsx", import.meta.url), "utf8");
const list = shell.slice(shell.indexOf("export const ADMIN_SECTIONS = ["), shell.indexOf("];", shell.indexOf("export const ADMIN_SECTIONS = [")));
const SECTIONS = [...list.matchAll(/\{ id: "([a-z-]+)"/g)].map((m) => m[1]);

describe("admin menu", () => {
  it("reaches every admin section exactly once (Office displays is under Settings)", () => {
    expect(SECTIONS.length).toBeGreaterThan(40);
    const reached = menuSections();
    expect(new Set(reached).size).toBe(reached.length);
    expect([...reached].sort()).toEqual(SECTIONS.filter((id) => id !== "office-displays").sort());
  });

  it("has the hubs the office asked for, with their screens as tabs", () => {
    expect(ADMIN_HUBS.map((h) => [h.label, h.tabs.map((t) => t.id)])).toEqual([
      // Jobs, and the finished ones with their billing, are one place.
      ["Jobs", ["trips", "billing"]],
      ["Live fleet", ["fleet", "fleet-workspace", "health"]],
      ["Vehicles & drivers", ["vehicles", "drivers", "shifts"]],
      ["Routes", ["route-planner", "route-explorer", "plan-pickups", "travel-times"]],
      ["Passengers", ["directory", "signup-day", "cards", "card-designs", "checkins"]],
    ]);
  });

  it("puts the hubs and everyday screens at the top, and is down from 46 links to 34", () => {
    const top = ADMIN_MENU.slice(0, ADMIN_MENU.findIndex((e) => e && e.group));
    expect(top).toEqual(["overview", { hub: "live" }, { hub: "jobs" }, { hub: "vehicles-drivers" }, { hub: "routes" }, { hub: "passengers" }, "users", "companies"]);
    const links = ADMIN_MENU.reduce((n, e) => n + (e === "divider" ? 0 : e.ids ? e.ids.length : 1), 0);
    expect(links).toBe(34);
  });

  it("finds a section's hub and folding group", () => {
    expect(hubOf("card-designs")?.label).toBe("Passengers");
    expect(hubOf("fleet")?.label).toBe("Live fleet");
    expect(hubOf("billing")?.label).toBe("Jobs");
    expect(groupOf("billing")).toBeNull();
    expect(hubOf("faults")).toBeNull();
    expect(groupOf("faults")).toBe("Maintenance");
    expect(groupOf("drivers")).toBeNull();
  });

  it("a hub link opens its first tab, then the tab last used there", () => {
    expect(hubTarget("routes")).toBe("route-planner");
    rememberTab("travel-times");
    expect(hubTarget("routes")).toBe("travel-times");
    rememberTab("faults");
    expect(hubTarget("routes")).toBe("travel-times");
    expect(hubTarget("nope")).toBeNull();
  });

  it("each hub's tabs keep what was picked in it, and nothing else", () => {
    expect(Object.fromEntries(ADMIN_HUBS.map((h) => [h.id, h.carry]))).toEqual({
      jobs: [], live: ["bus"], "vehicles-drivers": ["bus", "driver"], routes: ["route"], passengers: ["person"],
    });
    expect(carriedSearch("billing", "?bus=b1")).toBe("");
    expect(carriedSearch("drivers", "?bus=b1&driver=d1&create=1")).toBe("?bus=b1&driver=d1");
    expect(carriedSearch("health", "?bus=b1&driver=d1")).toBe("?bus=b1");
    expect(carriedSearch("cards", "?person=user%3Au-1&bus=b1")).toBe("?person=user%3Au-1");
    expect(carriedSearch("travel-times", "?route=r1")).toBe("?route=r1");
    expect(carriedSearch("vehicles", "")).toBe("");
    expect(carriedSearch("faults", "?bus=b1")).toBe("");
  });
});
