import { chromium } from "@playwright/test"; import fs from "node:fs";
const [src, out, x, y, w, h] = process.argv.slice(2);
const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: Number(w), height: Number(h) } });
await p.setContent(`<body style="margin:0;background:#000"><div style="width:${w}px;height:${h}px;overflow:hidden;position:relative"><img src="data:image/png;base64,${fs.readFileSync(src).toString("base64")}" style="position:absolute;left:-${x}px;top:-${y}px"></div></body>`);
await p.waitForTimeout(200); await p.screenshot({ path: out, type: "jpeg", quality: 60 }); await b.close();
