import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { ADMIN_HUBS, ADMIN_MENU, PAGE_OF, carriedSearch, groupOf, hubOf, hubTarget, menuHome, menuSections, rememberTab } from "@/lib/adminMenu";

// Admin menu: two hubs (Vehicles & drivers, Routes) put related screens
// together as tabs. Passengers is one page that card issuing, card design and
// the sign-in log open on; Live fleet is one page that Fleet workspace and
// Fleet health open on. Every admin section must still be reachable from the
// menu, once.
const shell = readFileSync(new URL("../../components/admin/AdminShell.jsx", import.meta.url), "utf8");
const list = shell.slice(shell.indexOf("export const ADMIN_SECTIONS = ["), shell.indexOf("];", shell.indexOf("export const ADMIN_SECTIONS = [")));
const SECTIONS = [...list.matchAll(/\{ id: "([a-z-]+)"/g)].map((m) => m[1]);

describe("admin menu", () => {
  it("reaches every admin section exactly once (Office displays is under Settings; the rest of Passengers and Live fleet open on their pages)", () => {
    expect(SECTIONS.length).toBeGreaterThan(40);
    const reached = menuSections();
    expect(new Set(reached).size).toBe(reached.length);
    expect([...reached].sort()).toEqual(SECTIONS.filter((id) => id !== "office-displays" && !PAGE_OF[id]).sort());
    for (const id of Object.keys(PAGE_OF)) expect(reached).toContain(menuHome(id));
  });

  it("has two hubs, with their screens as tabs", () => {
    expect(ADMIN_HUBS.map((h) => [h.label, h.tabs.map((t) => t.id)])).toEqual([
      ["Vehicles & drivers", ["vehicles", "drivers", "shifts"]],
      ["Routes", ["route-planner", "route-explorer", "plan-pickups", "travel-times"]],
    ]);
  });

  it("Passengers and Live fleet are one page each; their other parts open on them", () => {
    expect(PAGE_OF).toEqual({ cards: "directory", "card-designs": "directory", checkins: "directory", "fleet-workspace": "fleet", health: "fleet" });
    expect(["cards", "card-designs", "checkins", "directory", "vehicles"].map(menuHome)).toEqual(["directory", "directory", "directory", "directory", "vehicles"]);
    expect(["fleet", "fleet-workspace", "health"].map(menuHome)).toEqual(["fleet", "fleet", "fleet"]);
    expect(hubOf("cards")).toBeNull();
    expect(hubOf("health")).toBeNull();
  });

  it("puts the hubs and everyday screens at the top, with Sign-up day on its own, in 36 links", () => {
    const top = ADMIN_MENU.slice(0, ADMIN_MENU.findIndex((e) => e && e.group));
    expect(top).toEqual(["overview", "fleet", "trips", { hub: "vehicles-drivers" }, { hub: "routes" }, "directory", "signup-day", "users", "companies"]);
    const links = ADMIN_MENU.reduce((n, e) => n + (e === "divider" ? 0 : e.ids ? e.ids.length : 1), 0);
    expect(links).toBe(36);
  });

  it("finds a section's hub and folding group", () => {
    expect(hubOf("drivers")?.label).toBe("Vehicles & drivers");
    expect(hubOf("fleet")).toBeNull();
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
      "vehicles-drivers": ["bus", "driver"], routes: ["route"],
    });
    expect(carriedSearch("drivers", "?bus=b1&driver=d1&create=1")).toBe("?bus=b1&driver=d1");
    expect(carriedSearch("shifts", "?bus=b1&driver=d1")).toBe("?bus=b1&driver=d1");
    expect(carriedSearch("travel-times", "?route=r1")).toBe("?route=r1");
    expect(carriedSearch("vehicles", "")).toBe("");
    expect(carriedSearch("faults", "?bus=b1")).toBe("");
  });
});
