// Cuts a tall full-page screenshot into side-by-side columns as one small JPEG.
import { chromium } from "@playwright/test";
import fs from "node:fs";
const [src, out, colsArg, scaleArg] = process.argv.slice(2);
const cols = Number(colsArg || 3), scale = Number(scaleArg || 0.6);
const b64 = fs.readFileSync(src).toString("base64");
const browser = await chromium.launch();
const page = await browser.newPage();
await page.setContent(`<img id=i src="data:image/png;base64,${b64}">`);
const { w, h } = await page.evaluate(() => ({ w: document.getElementById("i").naturalWidth, h: document.getElementById("i").naturalHeight }));
const colH = Math.ceil(h / cols);
const tiles = Array.from({ length: cols }, (_, c) =>
  `<div style="width:${w * scale}px;height:${colH * scale}px;overflow:hidden;border-right:2px solid #f0f"><img src="data:image/png;base64,${b64}" style="width:${w * scale}px;margin-top:${-c * colH * scale}px"></div>`).join("");
await page.setViewportSize({ width: Math.ceil(w * scale * cols + cols * 2), height: Math.ceil(colH * scale) });
await page.setContent(`<body style="margin:0;display:flex;background:#fff">${tiles}</body>`);
await page.screenshot({ path: out, type: "jpeg", quality: 55 });
await browser.close();
console.log("ok");
