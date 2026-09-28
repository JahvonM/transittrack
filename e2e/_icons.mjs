// Rasterises public/brand/icon.svg into the PNG sizes the PWA / iOS need.
import { chromium } from "@playwright/test";
import fs from "node:fs";

const svg = fs.readFileSync("public/brand/icon.svg", "utf8");
// Maskable / iOS variants: full-bleed square (the OS applies its own mask).
const square = svg.replace('rx="112" fill="#0B0B0D"', 'fill="#0B0B0D"');

const outputs = [
  ["public/brand/icon-192.png", 192, svg],
  ["public/brand/icon-512.png", 512, svg],
  ["public/brand/maskable-512.png", 512, square],
  ["public/brand/apple-touch-icon.png", 180, square],
  ["public/brand/favicon-32.png", 32, svg],
];

const browser = await chromium.launch();
for (const [file, size, markup] of outputs) {
  const page = await browser.newPage({ viewport: { width: size, height: size } });
  const sized = markup.replace("<svg ", `<svg width="${size}" height="${size}" `);
  await page.setContent(`<html><body style="margin:0;background:transparent">${sized}</body></html>`);
  await page.screenshot({ path: file, omitBackground: true, clip: { x: 0, y: 0, width: size, height: size } });
  await page.close();
  console.log("wrote", file);
}
await browser.close();
