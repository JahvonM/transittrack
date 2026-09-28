// Places several PNGs side by side (each scaled to the same height) into one JPEG.
import { chromium } from "@playwright/test";
import fs from "node:fs";
const [out, heightArg, ...srcs] = process.argv.slice(2);
const height = Number(heightArg || 300);
const imgs = srcs.map((s) => `<img src="data:image/png;base64,${fs.readFileSync(s).toString("base64")}" style="height:${height}px;display:block;border-right:3px solid #f0f">`).join("");
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 2000, height } });
await page.setContent(`<body style="margin:0;display:flex;background:#fff;width:max-content">${imgs}</body>`);
const w = await page.evaluate(() => document.body.scrollWidth);
await page.setViewportSize({ width: w, height });
await page.screenshot({ path: out, type: "jpeg", quality: 70 });
await browser.close();
console.log("ok", w);
