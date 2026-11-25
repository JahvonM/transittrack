import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { GUIDE_DRAWINGS, drawingFor, pictureSource, starterPictures } from "../partDrawings.js";
import PICTURES from "../../data/partsCatalogue/pictures.json";

const root = path.resolve(__dirname, "../../..");
const keys = GUIDE_DRAWINGS.map((d) => d.key).sort();

describe("guide drawings", () => {
  it("are the same eight in the app, the server and the database", () => {
    const server = fs.readFileSync(path.join(root, "base44/functions/entityAccess/entry.ts"), "utf8");
    const listed = server.match(/const GUIDE_DRAWINGS=new Set\(\[([^\]]+)\]\)/)[1].match(/'([^']+)'/g).map((k) => k.slice(1, -1)).sort();
    expect(listed).toEqual(keys);
    const entity = JSON.parse(fs.readFileSync(path.join(root, "base44/entities/PartDiagram.jsonc"), "utf8"));
    expect([...entity.properties.drawing_key.enum].sort()).toEqual(keys);
    expect(keys).toHaveLength(8);
  });

  it.each(GUIDE_DRAWINGS.map((d) => [d.key]))("%s is our own labelled SVG", (key) => {
    const file = path.join(root, `src/assets/diagrams/${key}.svg`);
    const svg = fs.readFileSync(file, "utf8");
    expect(svg).toMatch(/^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" viewBox="0 0 800 640"/);
    expect(svg).toMatch(/<title id="t">[^<]+: guide drawing<\/title>/);
    expect(svg).toContain("not from Toyota or Nissan diagrams");
    // Nothing fetched from elsewhere: no links, pictures or scripts inside.
    expect(svg).not.toMatch(/<image|<script|href=|url\(/i);
  });

  it("show the photo first, else the drawing", () => {
    expect(pictureSource({ image_url: "https://x.test/p.jpg", drawing_key: "cooling" })).toEqual({ url: "https://x.test/p.jpg", isDrawing: false });
    expect(pictureSource({ drawing_key: "cooling" })).toEqual({ url: drawingFor("cooling").url, isDrawing: true });
    expect(pictureSource({ drawing_key: "nope" })).toBeNull();
    expect(pictureSource({})).toBeNull();
  });
});

describe("starter picture slots", () => {
  const guides = [{ id: "g1", starter_key: "toyota-hiace-h200" }, { id: "g2", starter_key: "nissan-nv350-e26" }, { id: "g3" }];

  it("are eight areas per starter page, each with a drawing, a link and steps", () => {
    for (const [key, areas] of Object.entries(PICTURES)) {
      expect(["toyota-hiace-h200", "nissan-nv350-e26"]).toContain(key);
      expect(areas.map((a) => a.drawing_key).sort()).toEqual(keys);
      expect(new Set(areas.map((a) => a.title)).size).toBe(areas.length);
      for (const a of areas) {
        expect(a.title.length).toBeLessThanOrEqual(120);
        expect(a.catalogue_link).toMatch(/^https:\/\/\S+$/);
        expect(a.notes.length).toBeGreaterThan(40);
        expect(a.notes.length).toBeLessThanOrEqual(2000);
      }
    }
  });

  it("go on the pages they're for, once", () => {
    const rows = starterPictures(PICTURES, guides, []);
    expect(rows).toHaveLength(16);
    expect(rows.filter((r) => r.guide_id === "g1")).toHaveLength(8);
    expect(rows.every((r) => r.pins.length === 0 && r.drawing_key)).toBe(true);
    // A page that already has a front brake picture (by drawing or title) keeps it.
    const again = starterPictures(PICTURES, guides, [
      { guide_id: "g1", drawing_key: "front-brakes" },
      { guide_id: "g2", title: "Fuel filter" },
    ]);
    expect(again).toHaveLength(14);
    expect(again.some((r) => r.guide_id === "g1" && r.drawing_key === "front-brakes")).toBe(false);
    expect(again.some((r) => r.guide_id === "g2" && r.title === "Fuel filter")).toBe(false);
  });
});
