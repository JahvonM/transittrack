import { chromium } from "@playwright/test";
import fs from "node:fs";
const [out, height, ...srcs] = process.argv.slice(2);
const imgs = srcs.map((s) => `<img src="data:image/png;base64,${fs.readFileSync(s).toString("base64")}" style="height:${height}px;display:block;border-right:3px solid #f0f">`).join("");
const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 2400, height: Number(height) } });
await p.setContent(`<body style="margin:0;display:flex;width:max-content">${imgs}</body>`);
const w = await p.evaluate(() => document.body.scrollWidth); await p.setViewportSize({ width: w, height: Number(height) });
await p.screenshot({ path: out, type: "jpeg", quality: 62 }); await b.close();
