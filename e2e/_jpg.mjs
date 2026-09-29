import { chromium } from "@playwright/test"; import fs from "node:fs";
const [out, w, ...files] = process.argv.slice(2);
const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: Number(w), height: 400 } });
const imgs = files.map(f => `<img src="data:image/png;base64,${fs.readFileSync(f).toString("base64")}" style="width:${Number(w)/ (files.length>1?2:1)}px;display:inline-block;vertical-align:top">`).join("");
await p.setContent(`<body style="margin:0;background:#000;font-size:0">${imgs}</body>`); await p.waitForTimeout(300);
await p.screenshot({ path: out, type: "jpeg", quality: 62, fullPage: true }); await b.close();
