// Guide drawings built into the app, for a part picture that has no photo
// yet. Our own line drawings of each area (src/assets/diagrams): generic,
// not drawn from Toyota or Nissan diagrams, and labelled as a guide.
import airFilter from "@/assets/diagrams/air-filter.svg";
import cooling from "@/assets/diagrams/cooling.svg";
import driveBelt from "@/assets/diagrams/drive-belt.svg";
import frontBrakes from "@/assets/diagrams/front-brakes.svg";
import frontSuspension from "@/assets/diagrams/front-suspension.svg";
import fuelFilter from "@/assets/diagrams/fuel-filter.svg";
import oilFilter from "@/assets/diagrams/oil-filter.svg";
import rearBrakes from "@/assets/diagrams/rear-brakes.svg";

// The same keys the server accepts (entityAccess GUIDE_DRAWINGS).
export const GUIDE_DRAWINGS = [
  { key: "oil-filter", label: "Engine oil & oil filter", url: oilFilter },
  { key: "fuel-filter", label: "Diesel fuel filter", url: fuelFilter },
  { key: "air-filter", label: "Air filter", url: airFilter },
  { key: "front-brakes", label: "Front disc brake", url: frontBrakes },
  { key: "rear-brakes", label: "Rear drum brake", url: rearBrakes },
  { key: "front-suspension", label: "Front suspension", url: frontSuspension },
  { key: "cooling", label: "Cooling system", url: cooling },
  { key: "drive-belt", label: "Drive belt", url: driveBelt },
];

export const drawingFor = (key) => GUIDE_DRAWINGS.find((d) => d.key === key) || null;

// What a picture shows: the team's photo when there is one, else its guide
// drawing, else nothing.
export function pictureSource(diagram) {
  if (diagram?.image_url) return { url: diagram.image_url, isDrawing: false };
  const drawing = drawingFor(diagram?.drawing_key);
  return drawing ? { url: drawing.url, isDrawing: true } : null;
}

// Starter picture slots (src/data/partsCatalogue/pictures.json) for the
// library pages that have them, leaving out areas a page already has.
export function starterPictures(starter = {}, guides = [], diagrams = []) {
  const rows = [];
  for (const guide of guides) {
    const areas = starter[guide.starter_key];
    if (!Array.isArray(areas)) continue;
    const have = new Set(diagrams.filter((d) => d.guide_id === guide.id).map((d) => d.drawing_key || d.title));
    areas.forEach((area, i) => {
      if (have.has(area.drawing_key) || have.has(area.title)) return;
      rows.push({
        guide_id: guide.id,
        title: area.title,
        system: area.system || "",
        drawing_key: area.drawing_key,
        catalogue_link: area.catalogue_link || "",
        notes: area.notes || "",
        pins: [],
        sort_order: (i + 1) * 10,
      });
    });
  }
  return rows;
}
