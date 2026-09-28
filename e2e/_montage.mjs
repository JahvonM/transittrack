// Joins /tmp/shots/*.png side by side into one small JPEG (/tmp/shots/m.jpg).
import { chromium } from "@playwright/test";
import fs from "node:fs";
const names = (process.argv[2] || "light_,light_admin,light_mechanic,dark_,dark_mechanic").split(",");
const imgs = names.map((n) => `<img src="data:image/png;base64,${fs.readFileSync(`/tmp/shots/${n}.png`).toString("base64")}" style="width:260px;display:block">`).join("");
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 260 * names.length, height: 563 } });
await page.setContent(`<body style="margin:0;display:flex">${imgs}</body>`);
await page.screenshot({ path: "/tmp/shots/m.jpg", type: "jpeg", quality: 60 });
await browser.close();
console.log("ok");
